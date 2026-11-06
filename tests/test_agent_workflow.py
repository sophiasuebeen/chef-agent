"""Offline workflow checks. ADK tests mock the model, not the simulator or Runner.

PYTHONPATH=backend/src python3 -m unittest discover -s tests -v
PYTHONPATH=backend/src backend/.venv/bin/python -m unittest discover -s tests -v
"""
import asyncio
from copy import deepcopy
import io
import json
import logging
import os
from pathlib import Path
import random
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from pasta_chef.agents.tools.kitchen import EpisodeLimit, KitchenTools
from pasta_chef.config import Settings
from pasta_chef.runtime.progress import EpisodeProgress, enable_progress_logs
from pasta_chef.simulation.kitchen import Kitchen
from pasta_chef.simulation.observation import build_observation
from pasta_chef.simulation.recipes import load_recipe
from pasta_chef.simulation.scheduler import run_priority_episode
from scripts.run_local import run_scripted

try:
    from google.adk.models.base_llm import BaseLlm
    from google.adk.models.llm_response import LlmResponse
    from google.genai import types
except ImportError:
    BaseLlm = None


class ScriptedWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.kitchen = Kitchen()
        self.order = self.kitchen.add_order("lemon_pasta")

    def test_background_preparation_and_service(self):
        result = run_scripted(self.kitchen, self.order.id)
        self.assertTrue(result["on_time"])
        self.assertEqual(self.order.served_at, 710)
        self.assertEqual(len(self.order.completed_tasks), 9)
        self.assertEqual(self.order.status, "served")
        self.assertFalse(self.kitchen.state.running_tasks)
        self.assertTrue(all(v is None for v in self.kitchen.state.resources.values()))
        starts = {e["task_id"]: e for e in self.kitchen.state.events if e["action"] == "task_started"}
        self.assertEqual(starts["prepare_mint"]["time"], 20)
        self.assertLess(starts["crush_garlic"]["time"], starts["boil_water"]["finishes_at"])

    def test_rejections_preserve_entire_state(self):
        operations = [
            lambda: self.kitchen.start_task("missing", "collect_ingredients"),
            lambda: self.kitchen.start_task(self.order.id, "missing"),
            lambda: self.kitchen.start_task(self.order.id, "prepare_sauce"),
            lambda: self.kitchen.serve_order(self.order.id),
            lambda: self.kitchen.add_order("missing"),
            lambda: self.kitchen.add_order("lemon_pasta", True),
        ]
        for operation in operations:
            with self.subTest(operation=operation):
                before = deepcopy(self.kitchen.state)
                with self.assertRaises((KeyError, ValueError)):
                    operation()
                self.assertEqual(before, self.kitchen.state)
        self.kitchen.start_task(self.order.id, "collect_ingredients")
        before = deepcopy(self.kitchen.state)
        with self.assertRaises(ValueError):
            self.kitchen.start_task(self.order.id, "collect_ingredients")
        self.assertEqual(before, self.kitchen.state)

    def test_duplicate_completion_and_service(self):
        run_scripted(self.kitchen, self.order.id)
        before = deepcopy(self.kitchen.state)
        for operation in (
            lambda: self.kitchen.start_task(self.order.id, "collect_ingredients"),
            lambda: self.kitchen.serve_order(self.order.id),
        ):
            with self.assertRaises(ValueError):
                operation()
            self.assertEqual(before, self.kitchen.state)
        self.assertEqual(self.kitchen.advance_to_next_event()["action"], "no_op")
        self.assertEqual(before, self.kitchen.state)

    def test_orders_are_independent_and_share_resources(self):
        second = self.kitchen.add_order("lemon_pasta")
        self.kitchen.start_task(self.order.id, "collect_ingredients")
        before = deepcopy(self.kitchen.state)
        with self.assertRaises(ValueError):
            self.kitchen.start_task(second.id, "collect_ingredients")
        self.assertEqual(before, self.kitchen.state)
        self.kitchen.advance_to_next_event()
        self.assertEqual(second.completed_tasks, [])
        self.kitchen.start_task(second.id, "collect_ingredients")
        self.kitchen.start_task(self.order.id, "boil_water")
        self.kitchen.advance_to_next_event()
        before = deepcopy(self.kitchen.state)
        with self.assertRaises(ValueError):
            self.kitchen.start_task(second.id, "boil_water")
        self.assertEqual(before, self.kitchen.state)
        self.assertIsNot(second.completed_tasks, self.order.completed_tasks)

    def test_simultaneous_completions_release_only_their_owners(self):
        recipe = {"id": "lemon_pasta", "tasks": [
            {"id": "a", "duration": 10, "requires": [], "resources": ["chef"]},
            {"id": "b", "duration": 10, "requires": [], "resources": ["pot"]},
            {"id": "c", "duration": 20, "requires": [], "resources": ["pan"]},
        ]}
        with patch("pasta_chef.simulation.kitchen.load_recipe", return_value=recipe):
            for task in ("a", "b", "c"):
                self.kitchen.start_task(self.order.id, task)
            result = self.kitchen.advance_to_next_event()
        self.assertEqual(result["time"], 10)
        self.assertEqual([t["task_id"] for t in result["completed"]], ["a", "b"])
        self.assertIsNone(self.kitchen.state.resources["chef"])
        self.assertIsNone(self.kitchen.state.resources["pot"])
        self.assertEqual(self.kitchen.state.resources["pan"], (self.order.id, "c"))
        self.assertEqual([t.task_id for t in self.kitchen.state.running_tasks], ["c"])

    def test_observation_is_detached_and_json_serializable(self):
        self.kitchen.start_task(self.order.id, "collect_ingredients")
        before = deepcopy(self.kitchen.state)
        snapshot = build_observation(self.kitchen.state)
        json.dumps(snapshot)
        self.assertFalse(snapshot["chef_available"])
        self.assertEqual(snapshot["running_tasks"][0]["remaining_time"], 20)
        snapshot["orders"][0]["completed_tasks"].append("fake")
        snapshot["resources"]["chef"][0] = "fake"
        snapshot["recent_events"][0]["menu"] = "fake"
        self.assertEqual(before, self.kitchen.state)

    def test_late_service_and_reset(self):
        self.order.deadline = 709
        self.assertFalse(run_scripted(self.kitchen, self.order.id)["on_time"])
        self.kitchen.reset()
        self.assertEqual(self.kitchen.state.time, 0)
        self.assertEqual(self.kitchen.state.events, [])
        self.assertEqual(self.kitchen.add_order("lemon_pasta").id, "order_1")

    def test_service_at_deadline_is_on_time(self):
        self.order.deadline = 710
        self.assertTrue(run_scripted(self.kitchen, self.order.id)["on_time"])

    def test_root_env_loaded_and_gemini_api_selected_before_adk(self):
        try:
            import dotenv
        except ImportError:
            self.skipTest("optional dotenv dependency is not installed")
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env").write_text(
                "GOOGLE_API_KEY=offline-test-value\nCHEF_MODEL=gemini-test\n"
            )
            module_path = root / "backend" / "src" / "pasta_chef" / "config.py"
            with patch("pasta_chef.config.__file__", str(module_path)), patch.dict(
                os.environ, {"GOOGLE_GENAI_USE_VERTEXAI": "true"}, clear=True
            ):
                settings = Settings.from_env()
                self.assertEqual(settings.model, "gemini-test")
                self.assertEqual(os.environ["GOOGLE_API_KEY"], "offline-test-value")
                self.assertEqual(os.environ["GOOGLE_GENAI_USE_VERTEXAI"], "false")

    def test_openai_credentials_do_not_require_google_auth(self):
        from pasta_chef.config import ConfigurationError, require_model_credentials
        with patch.dict(os.environ, {"OPENAI_API_KEY": "offline-test-value"}, clear=True):
            require_model_credentials("openai/gpt-4o")
            require_model_credentials("gpt-4o")
        with patch.dict(os.environ, {}, clear=True), self.assertRaises(ConfigurationError):
            require_model_credentials("openai/gpt-4o")

    def test_settings_reject_unbounded_limits(self):
        for args in ({"max_model_calls": 0}, {"max_tool_calls": -1},
                     {"max_simulated_time": True}, {"timeout_seconds": float("inf")},
                     {"timeout_seconds": 0}, {"model": " "}):
            with self.subTest(args=args), self.assertRaises(ValueError):
                Settings(**args)

    def test_wrapper_errors_and_tool_limit(self):
        tools = KitchenTools(self.kitchen, Settings(max_tool_calls=1))
        before = deepcopy(self.kitchen.state)
        result = tools.start_task(self.order.id, "finish_pasta")
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"]["type"], "ValueError")
        self.assertEqual(before, self.kitchen.state)
        with self.assertRaises(EpisodeLimit):
            tools.get_kitchen_state()
        self.assertEqual(before, self.kitchen.state)

    def test_simulation_limit_prevents_time_advance(self):
        tools = KitchenTools(self.kitchen, Settings(max_simulated_time=10))
        tools.start_task(self.order.id, "collect_ingredients")
        before = deepcopy(self.kitchen.state)
        with self.assertRaises(EpisodeLimit):
            tools.advance_to_next_event()
        self.assertEqual(before, self.kitchen.state)


if BaseLlm is not None:
    class MockChefModel(BaseLlm):
        mode: str = "cook"
        observations: list[dict] = []
        requests: list[str] = []

        async def generate_content_async(self, llm_request, stream=False):
            observation = json.loads(llm_request.contents[-1].parts[0].text.split(": ", 1)[1])
            self.observations.append(observation)
            self.requests.append(json.dumps(
                [content.model_dump(mode="json", exclude_none=True) for content in llm_request.contents]))
            if self.mode == "timeout":
                await asyncio.sleep(10)
            if self.mode == "error":
                raise ConnectionError("mock provider unavailable")
            if self.mode == "text":
                parts = [types.Part(text="The dish is served!")]
            elif self.mode == "invalid":
                parts = [types.Part(function_call=types.FunctionCall(
                    name="start_task", args={"order_id": "order_1", "task_id": "prepare_sauce"}))]
            elif self.mode in ("read", "parallel"):
                parts = [types.Part(function_call=types.FunctionCall(
                    name="get_kitchen_state", args={})) for _ in range(4 if self.mode == "parallel" else 1)]
            else:
                order_id = observation["orders"][0]["id"]
                available = observation["available_tasks"][order_id]
                name, args = ("start_task", {"order_id": order_id, "task_id": available[0]}) if available else (
                    "serve_order", {"order_id": order_id})
                parts = [types.Part(function_call=types.FunctionCall(name=name, args=args))]
            yield LlmResponse(
                content=types.Content(role="model", parts=parts),
                usage_metadata=types.GenerateContentResponseUsageMetadata(
                    prompt_token_count=100, candidates_token_count=10),
            )


    class FlakyModel(BaseLlm):
        """Raises the queued errors in order, then returns a text response."""
        errors: list = []
        attempts: int = 0

        async def generate_content_async(self, llm_request, stream=False):
            self.attempts += 1
            if self.errors:
                raise self.errors.pop(0)
            yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text="ok")]))


    class FailsAfterResponseModel(BaseLlm):
        attempts: int = 0

        async def generate_content_async(self, llm_request, stream=False):
            self.attempts += 1
            yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text="partial")]))
            raise ProviderError(429)


class ProviderError(Exception):
    def __init__(self, status_code, message="", headers=None):
        super().__init__(message)
        self.status_code = status_code
        self.response = type("Response", (), {"headers": headers or {}})()


@unittest.skipIf(BaseLlm is None, "optional ADK extra is not installed")
class MockedAdkWorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def run_episode(self, mode="cook", **settings):
        from pasta_chef.runtime.controller import run_agent_episode
        kitchen = Kitchen()
        kitchen.add_order("lemon_pasta")
        model = MockChefModel(model="mock-chef", mode=mode)
        result = await run_agent_episode(kitchen, Settings(**settings), model=model)
        return kitchen, model, result

    async def test_real_runner_tools_and_mocked_model_serve(self):
        kitchen, model, result = await self.run_episode()
        self.assertTrue(result["ok"], result)
        self.assertEqual(kitchen.state.time, 710)
        self.assertEqual(kitchen.get_order("order_1").status, "served")
        self.assertEqual(result["model_calls"], 10)
        self.assertEqual(result["tool_calls"], 19)
        self.assertEqual(len(model.observations), 10)
        self.assertIn("crush_garlic", model.observations[4]["completed_tasks"]["order_1"])

    async def test_text_claims_do_not_count_as_service(self):
        kitchen, _, result = await self.run_episode("text", max_model_calls=3)
        self.assertFalse(result["ok"])
        self.assertEqual(result["model_calls"], 3)
        self.assertEqual(kitchen.get_order("order_1").status, "pending")

    async def test_live_configuration_missing_fails_before_model_call(self):
        from pasta_chef.runtime.controller import run_agent_episode
        kitchen = Kitchen()
        kitchen.add_order("lemon_pasta")
        with patch.dict(os.environ, {}, clear=True):
            result = await run_agent_episode(kitchen, Settings())
        self.assertFalse(result["ok"])
        self.assertIn("credentials unavailable", result["error"])
        self.assertEqual(result["model_calls"], 0)
        self.assertEqual(result["tool_calls"], 0)

    async def test_rejected_actions_consume_attempt_budget(self):
        kitchen, _, result = await self.run_episode("invalid", max_tool_calls=2)
        self.assertFalse(result["ok"])
        self.assertEqual(result["tool_calls"], 2)
        self.assertEqual(kitchen.get_order("order_1").status, "pending")
        self.assertEqual(len(kitchen.state.events), 1)

    async def test_read_loop_hits_tool_budget(self):
        _, _, result = await self.run_episode("read", max_tool_calls=2)
        self.assertFalse(result["ok"])
        self.assertEqual(result["tool_calls"], 2)
        self.assertIn("Tool call limit", result["error"])

    async def test_parallel_batch_cannot_bypass_budget(self):
        kitchen, _, result = await self.run_episode("parallel", max_tool_calls=2)
        self.assertFalse(result["ok"])
        self.assertEqual(result["tool_calls"], 2)
        self.assertEqual(kitchen.state.time, 0)

    async def test_simulated_time_budget(self):
        kitchen, _, result = await self.run_episode(max_simulated_time=10)
        self.assertFalse(result["ok"])
        self.assertEqual(kitchen.state.time, 0)
        self.assertIn("simulated time limit", result["error"])

    async def test_wall_clock_timeout(self):
        kitchen, _, result = await self.run_episode("timeout", timeout_seconds=0.1)
        self.assertFalse(result["ok"])
        self.assertIn("Wall-clock", result["error"])
        self.assertEqual(kitchen.state.time, 0)

    async def test_provider_failure_is_explicit(self):
        kitchen, _, result = await self.run_episode("error")
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], "ConnectionError")
        self.assertEqual(kitchen.get_order("order_1").status, "pending")

    async def test_only_newest_observation_reaches_the_model(self):
        _, model, result = await self.run_episode()
        self.assertTrue(result["ok"], result)
        self.assertGreater(len(model.requests), 5)
        for request in model.requests:
            self.assertEqual(request.count("available_tasks"), 1)

    async def test_rejection_stays_visible_after_its_observation_is_removed(self):
        _, model, _ = await self.run_episode("invalid", max_tool_calls=2)
        self.assertIn("ValueError", model.requests[1])
        self.assertEqual(model.requests[1].count("available_tasks"), 1)

    def test_stripping_observations_does_not_change_stored_history(self):
        from pasta_chef.agents.chef import without_stale_observations
        content = types.Content(role="user", parts=[types.Part(function_response=types.FunctionResponse(
            name="start_task", response={"ok": False, "error": "busy", "observation": {"time": 1}}))])
        trimmed = without_stale_observations([content])
        self.assertEqual(trimmed[0].parts[0].function_response.response, {"ok": False, "error": "busy"})
        self.assertIn("observation", content.parts[0].function_response.response)

    async def test_decision_log_records_tokens_actions_and_rejections(self):
        kitchen, _, result = await self.run_episode()
        log = result["decision_log"]
        calls = [e for e in log if e["type"] == "model_call"]
        self.assertEqual(len(calls), result["model_calls"])
        self.assertEqual(calls[0]["calls"], [{"tool": "start_task", "args": {
            "order_id": "order_1", "task_id": "collect_ingredients"}}])
        self.assertEqual(result["input_tokens"], 100 * result["model_calls"])
        self.assertEqual(result["output_tokens"], 10 * result["model_calls"])
        self.assertEqual(result["rejected_tool_calls"], 0)
        # Every tool attempt is attributed, so counts reconcile with the total.
        tool_entries = [e for e in log if e["type"] == "tool_call"]
        self.assertEqual(len(tool_entries), result["tool_calls"])
        self.assertTrue(any(e["source"] == "controller" for e in tool_entries))
        json.dumps(log)

        _, _, rejected = await self.run_episode("invalid", max_tool_calls=2)
        self.assertGreaterEqual(rejected["rejected_tool_calls"], 1)
        entry = next(e for e in rejected["decision_log"] if e["type"] == "tool_call" and not e["ok"])
        self.assertEqual(entry["args"]["task_id"], "prepare_sauce")
        self.assertTrue(entry["error"])


@unittest.skipIf(BaseLlm is None, "optional ADK extra is not installed")
class ProviderRetryTests(unittest.IsolatedAsyncioTestCase):
    async def collect(self, inner, **fields):
        from pasta_chef.agents.retrying_llm import RetryingLlm
        retries = []
        model = RetryingLlm(model="mock", inner=inner,
                            on_retry=lambda status, delay, details: retries.append((status, delay)), **fields)
        with patch("pasta_chef.agents.retrying_llm.sleep") as sleep:
            sleep.return_value = None
            responses = [r async for r in model.generate_content_async(None)]
        return responses, retries, [call.args[0] for call in sleep.call_args_list]

    async def test_rate_limit_backs_off_exponentially_then_succeeds(self):
        inner = FlakyModel(model="mock", errors=[ProviderError(429), ProviderError(503)])
        responses, retries, sleeps = await self.collect(inner)
        self.assertEqual(len(responses), 1)
        self.assertEqual(inner.attempts, 3)
        self.assertEqual(sleeps, [2.0, 4.0])
        self.assertEqual(retries, [(429, 2.0), (503, 4.0)])

    async def test_retry_after_header_wins_but_is_capped(self):
        inner = FlakyModel(model="mock", errors=[
            ProviderError(429, headers={"retry-after": "7"}),
            ProviderError(429, headers={"retry-after": "9999"}),
            ProviderError(429, headers={"retry-after": "soon"}),
        ])
        _, _, sleeps = await self.collect(inner)
        self.assertEqual(sleeps, [7.0, 60.0, 8.0])

    async def test_retries_are_bounded_and_the_error_surfaces(self):
        inner = FlakyModel(model="mock", errors=[ProviderError(429) for _ in range(9)])
        with self.assertRaises(ProviderError):
            await self.collect(inner, max_retries=2)
        self.assertEqual(inner.attempts, 3)

    async def test_permanent_failures_are_not_retried(self):
        for error in (ProviderError(401), ProviderError(400), ConnectionError("no status"),
                      ProviderError(429, "You exceeded your quota: insufficient_quota"),
                      ProviderError(429, "You exceeded your current quota, check billing")):
            with self.subTest(error=error):
                inner = FlakyModel(model="mock", errors=[error])
                with self.assertRaises(type(error)):
                    await self.collect(inner)
                self.assertEqual(inner.attempts, 1)

    async def test_giving_up_reports_status_and_retry_count(self):
        from pasta_chef.agents.retrying_llm import RetryingLlm
        for error, retries, status in ((ProviderError(429), 2, 429), (ProviderError(401), 0, 401)):
            with self.subTest(status=status):
                failures = []
                model = RetryingLlm(
                    model="mock", max_retries=2,
                    inner=FlakyModel(model="mock", errors=[error] * 9),
                    on_give_up=lambda code, count, details: failures.append((code, count)))
                with patch("pasta_chef.agents.retrying_llm.sleep"), self.assertRaises(ProviderError):
                    [r async for r in model.generate_content_async(None)]
                self.assertEqual(failures, [(status, retries)])

    async def test_failure_after_a_response_is_not_replayed(self):
        inner = FailsAfterResponseModel(model="mock")
        with self.assertRaises(ProviderError):
            await self.collect(inner)
        self.assertEqual(inner.attempts, 1)


    async def test_retry_details_name_the_limit_without_provider_text(self):
        from pasta_chef.agents.retrying_llm import retry_details
        error = ProviderError(429, "Limit in organization org-secret on requests per day (RPD): try later",
                              headers={"x-ratelimit-remaining-requests": "0", "authorization": "secret"})
        details = retry_details(error)
        self.assertEqual(details, {"limit": "RPD", "remaining-requests": "0"})
        self.assertEqual(retry_details(ProviderError(429))["limit"], "unknown")


class ProgressPhaseTests(unittest.TestCase):
    def setUp(self):
        self.now = 0.0
        self.progress = EpisodeProgress(300, clock=lambda: self.now)

    def heartbeat_after(self, seconds):
        self.now += seconds
        with self.assertLogs("pasta_chef.progress", "INFO") as logs:
            self.progress.heartbeat()
        return logs.output[0]

    def test_heartbeat_names_the_phase_that_is_waiting(self):
        self.progress.request_sent(3, 140)
        self.assertIn("waiting on MODEL RESPONSE for 20s (model_call 3)", self.heartbeat_after(20))
        self.progress.backoff_started(429, 32.0, 2, {"limit": "RPD"})
        self.assertIn("in RETRY BACKOFF 10s of 32s", self.heartbeat_after(10))
        self.progress.request_resent()
        self.assertIn("waiting on MODEL RESPONSE for 5s", self.heartbeat_after(5))

    def test_heartbeat_reports_a_cancellation_that_outlives_the_timeout(self):
        self.progress.request_sent(1, 0)
        self.assertIn("OVER TIMEOUT by 5s", self.heartbeat_after(305))

    def test_enable_writes_each_record_to_stderr_only_once(self):
        logger = logging.getLogger("pasta_chef.progress")
        before = logger.handlers[:], logger.level, logger.propagate
        logger.handlers[:] = []
        stream = io.StringIO()
        try:
            with patch("sys.stderr", stream), patch("sys.stdout", io.StringIO()) as out:
                enable_progress_logs()
                enable_progress_logs()
                logger.info("visible now")
            self.assertEqual(stream.getvalue().count("visible now"), 1)
            self.assertEqual(out.getvalue(), "")
        finally:
            logger.handlers[:], logger.level, logger.propagate = before[0], before[1], before[2]


@unittest.skipIf(BaseLlm is None, "optional ADK extra is not installed")
class EpisodeProgressLogTests(unittest.IsolatedAsyncioTestCase):
    async def episode(self, mode="cook", **settings):
        from pasta_chef.runtime.controller import run_agent_episode
        kitchen = Kitchen()
        kitchen.add_order("lemon_pasta")
        with self.assertLogs("pasta_chef.progress", "INFO") as logs:
            result = await run_agent_episode(
                kitchen, Settings(**settings), model=MockChefModel(model="mock-chef", mode=mode))
        return result, "\n".join(logs.output)

    async def test_requests_responses_tools_and_stop_reason_are_logged(self):
        _, output = await self.episode()
        self.assertIn("model_call 1: request sent (sim_t=0)", output)
        self.assertIn("tokens=100/10 -> start_task(order_1, collect_ingredients)", output)
        self.assertIn("chef start_task(order_1, collect_ingredients) ok", output)
        self.assertIn("controller advance_to_next_event() ok", output)
        self.assertIn("episode stopped: completed", output)

    async def test_rejection_is_logged_as_it_happens(self):
        _, output = await self.episode("invalid", max_tool_calls=2)
        self.assertIn("chef start_task(order_1, prepare_sauce) REJECTED:", output)
        self.assertIn("episode stopped: tool_call_limit", output)

    async def test_heartbeat_runs_during_a_slow_request_and_stops_at_timeout(self):
        with patch("pasta_chef.runtime.progress.HEARTBEAT_SECONDS", 0.02):
            result, output = await self.episode("timeout", timeout_seconds=1.0)
        self.assertEqual(result["termination_reason"], "wall_clock_limit")
        self.assertIn("alive: waiting on MODEL RESPONSE", output)
        self.assertIn("episode stopped: wall_clock_limit", output)
        self.assertEqual(len([t for t in asyncio.all_tasks() if "run_heartbeat" in repr(t)]), 0)


@unittest.skipIf(BaseLlm is None, "optional ADK extra is not installed")
class GeminiPathTests(unittest.IsolatedAsyncioTestCase):
    """Real ADK Runner, Gemini class and google.genai errors; no request is sent."""

    @staticmethod
    def rate_limited(quota, delay="34s"):
        from google.genai import errors
        return errors.ClientError(429, {"error": {
            "code": 429, "status": "RESOURCE_EXHAUSTED",
            "message": f"Quota exceeded for org-secret, quotaId: {quota}",
            "details": [{"retryDelay": delay}],
        }})

    def test_google_errors_are_classified(self):
        from google.genai import errors
        from pasta_chef.agents.retrying_llm import is_retryable, retry_after_seconds, retry_details
        busy = errors.ServerError(503, {"error": {"code": 503, "status": "UNAVAILABLE",
                                                  "message": "The model is overloaded."}})
        self.assertTrue(is_retryable(busy))
        self.assertIsNone(retry_after_seconds(busy))
        per_minute = self.rate_limited("GenerateRequestsPerMinutePerProjectPerModel-FreeTier")
        self.assertTrue(is_retryable(per_minute))
        self.assertEqual(retry_after_seconds(per_minute), 34.0)
        self.assertEqual(retry_details(per_minute)["limit"],
                         "GenerateRequestsPerMinutePerProjectPerModel")
        self.assertNotIn("org-secret", json.dumps(retry_details(per_minute)))
        self.assertFalse(is_retryable(self.rate_limited("GenerateRequestsPerDayPerProjectPerModel")))
        # Same wording as an out-of-credit account, but Google gives a retry delay.
        same_words = errors.ClientError(429, {"error": {
            "code": 429, "message": "You exceeded your current quota, check your plan.",
            "details": [{"retryDelay": "34s"}]}})
        self.assertTrue(is_retryable(same_words))
        self.assertFalse(is_retryable(errors.ClientError(400, {"error": {"code": 400}})))

    async def test_gemini_model_backs_off_when_busy_then_serves(self):
        from google.adk.models.google_llm import Gemini
        from google.genai import errors
        from pasta_chef.runtime.controller import run_agent_episode
        attempts = []

        async def fake_generate(model, llm_request, stream=False):
            attempts.append(model.model)
            if len(attempts) == 1:
                raise errors.ServerError(503, {"error": {"code": 503, "status": "UNAVAILABLE",
                                                         "message": "overloaded"}})
            observation = json.loads(llm_request.contents[-1].parts[0].text.split(": ", 1)[1])
            available = observation["available_tasks"]["order_1"]
            name, args = ("start_task", {"order_id": "order_1", "task_id": available[0]}) \
                if available else ("serve_order", {"order_id": "order_1"})
            yield LlmResponse(content=types.Content(role="model", parts=[
                types.Part(function_call=types.FunctionCall(name=name, args=args))]))

        kitchen = Kitchen()
        kitchen.add_order("lemon_pasta")
        with patch.dict(os.environ, {"GOOGLE_API_KEY": "offline-test-value"}), patch.object(
            Gemini, "generate_content_async", fake_generate
        ), patch("pasta_chef.agents.retrying_llm.sleep") as sleep:
            with self.assertLogs("pasta_chef.progress", "INFO") as logs:
                result = await run_agent_episode(kitchen, Settings(model="gemini-3.6-flash"))
        self.assertTrue(result["ok"], result)
        self.assertEqual(kitchen.get_order("order_1").status, "served")
        self.assertEqual(result["provider_retries"], 1)
        self.assertEqual(attempts[0], "gemini-3.6-flash")
        self.assertEqual(sleep.call_args_list[0].args[0], 2.0)
        self.assertIn("provider 503, BACKOFF 2s (retry 1)", "\n".join(logs.output))


@unittest.skipIf(BaseLlm is None, "optional ADK extra is not installed")
class LiteLlmPathTests(unittest.IsolatedAsyncioTestCase):
    """Real ADK Runner, LiteLlm adapter and litellm errors; only the HTTP call is fake."""

    async def test_openai_path_retries_trims_context_and_disables_parallel_calls(self):
        import litellm
        from google.adk.models.lite_llm import LiteLLMClient
        from pasta_chef.runtime.controller import run_agent_episode
        requests = []

        async def fake_acompletion(client, **kwargs):
            requests.append(kwargs)
            if len(requests) == 1:
                raise litellm.RateLimitError("slow down", "openai", "gpt-4o")
            observation = json.loads(kwargs["messages"][-1]["content"].split(": ", 1)[1])
            available = observation["available_tasks"]["order_1"]
            name, args = ("start_task", {"order_id": "order_1", "task_id": available[0]}) \
                if available else ("serve_order", {"order_id": "order_1"})
            return litellm.ModelResponse(
                choices=[{"finish_reason": "tool_calls", "message": {
                    "role": "assistant", "content": None, "tool_calls": [{
                        "id": f"call_{len(requests)}", "type": "function",
                        "function": {"name": name, "arguments": json.dumps(args)},
                    }],
                }}],
                usage={"prompt_tokens": 500, "completion_tokens": 20, "total_tokens": 520},
            )

        kitchen = Kitchen()
        kitchen.add_order("lemon_pasta")
        with patch.dict(os.environ, {"OPENAI_API_KEY": "offline-test-value"}), patch.object(
            LiteLLMClient, "acompletion", fake_acompletion
        ), patch("pasta_chef.agents.retrying_llm.sleep") as sleep:
            sleep.return_value = None
            with self.assertLogs("pasta_chef.progress", "INFO") as logs:
                result = await run_agent_episode(kitchen, Settings(model="openai/gpt-4o"))

        self.assertTrue(result["ok"], result)
        output = "\n".join(logs.output)
        self.assertIn("provider 429, BACKOFF 2s (retry 1)", output)
        self.assertIn("model_call 1: request resent", output)
        self.assertNotIn("slow down", output)
        self.assertEqual(kitchen.get_order("order_1").status, "served")
        self.assertEqual(result["provider_retries"], 1)
        # The failed attempt is one decision: it adds no model-call budget use.
        self.assertEqual(result["model_calls"], len(requests) - 1)
        self.assertEqual(result["input_tokens"], 500 * result["model_calls"])
        for request in requests:
            self.assertIs(request["parallel_tool_calls"], False)
            self.assertEqual(request["num_retries"], 0)
            self.assertEqual(json.dumps(request["messages"]).count("available_tasks"), 1)
        self.assertTrue(any(m["role"] == "tool" for m in requests[-1]["messages"]))


class EquipmentHoldTests(unittest.TestCase):
    """Cooked pasta stays in the pot, and sauce in the pan, until the next step takes over."""

    def setUp(self):
        self.kitchen = Kitchen()
        self.first = self.kitchen.add_order("lemon_pasta", 900)
        self.second = self.kitchen.add_order("lemon_pasta", 900)

    def run_first_through(self, *tasks):
        """Start each task of the first order and advance until it completes."""
        for task in tasks:
            self.kitchen.start_task(self.first.id, task)
            while task not in self.first.completed_tasks:
                self.kitchen.advance_to_next_event()

    def ready_second_for_boil(self):
        self.kitchen.start_task(self.second.id, "collect_ingredients")
        self.kitchen.advance_to_next_event()

    def assert_rejected(self, order, task, resource):
        before = deepcopy(self.kitchen.state)
        with self.assertRaisesRegex(ValueError, f"Resource unavailable: {resource}"):
            self.kitchen.start_task(order.id, task)
        self.assertEqual(self.kitchen.state, before)

    def test_another_order_cannot_take_the_pot_between_boiling_and_cooking(self):
        self.ready_second_for_boil()
        self.run_first_through("collect_ingredients", "boil_water")
        self.assertEqual(self.kitchen.state.resources["pot"], (self.first.id, "boil_water"))
        self.assert_rejected(self.second, "boil_water", "pot|burner")
        self.kitchen.start_task(self.first.id, "cook_pasta_halfway")
        self.assertEqual(self.kitchen.state.resources["pot"], (self.first.id, "cook_pasta_halfway"))

    def test_cooked_pasta_keeps_the_pot_until_drained_then_burner_frees_at_drain_start(self):
        self.ready_second_for_boil()
        self.run_first_through("collect_ingredients", "boil_water", "cook_pasta_halfway")
        self.assertEqual(self.kitchen.state.resources["pot"], (self.first.id, "cook_pasta_halfway"))
        self.assertEqual(self.kitchen.state.resources["burner"], (self.first.id, "cook_pasta_halfway"))
        self.assertNotIn("boil_water", build_observation(self.kitchen.state)["available_tasks"][self.second.id])
        self.assert_rejected(self.second, "boil_water", "pot|burner")

        self.kitchen.start_task(self.first.id, "reserve_water_and_drain")
        self.assertEqual(self.kitchen.state.resources["pot"], (self.first.id, "reserve_water_and_drain"))
        self.assertIsNone(self.kitchen.state.resources["burner"])
        self.kitchen.advance_to_next_event()
        self.assertIsNone(self.kitchen.state.resources["pot"])

    def test_sauce_keeps_the_pan_and_only_finishing_off_heat_frees_the_burner(self):
        self.run_first_through("collect_ingredients", "prepare_mint", "crush_garlic", "boil_water",
                               "cook_pasta_halfway", "reserve_water_and_drain", "prepare_sauce")
        self.assertEqual(self.kitchen.state.resources["pan"], (self.first.id, "prepare_sauce"))
        self.assertEqual(self.kitchen.state.resources["burner"], (self.first.id, "prepare_sauce"))
        self.run_first_through("finish_pasta")
        self.assertEqual(self.kitchen.state.resources["pan"], (self.first.id, "finish_pasta"))
        self.assertIsNone(self.kitchen.state.resources["burner"])
        self.run_first_through("finish_off_heat")
        self.assertIsNone(self.kitchen.state.resources["pan"])
        self.kitchen.serve_order(self.first.id)
        self.assertTrue(all(owner is None for owner in self.kitchen.state.resources.values()))

    def test_a_hold_only_serves_its_named_next_step(self):
        self.run_first_through("collect_ingredients", "crush_garlic", "boil_water")
        before = deepcopy(self.kitchen.state)
        self.assertEqual(self.kitchen.state.resources["burner"], (self.first.id, "boil_water"))
        with self.assertRaisesRegex(ValueError, "dependencies"):
            self.kitchen.start_task(self.first.id, "prepare_sauce")
        self.assertEqual(self.kitchen.state, before)

    def test_recipe_holds_are_consistent(self):
        recipe = load_recipe("lemon_pasta")
        tasks = {task["id"]: task for task in recipe["tasks"]}
        holders = [task for task in recipe["tasks"] if "holds" in task]
        self.assertEqual({task["id"] for task in holders},
                         {"boil_water", "cook_pasta_halfway", "prepare_sauce", "finish_pasta"})
        for task in holders:
            self.assertTrue(set(task["holds"]["resources"]) <= set(task["resources"]), task["id"])
            self.assertIn(task["id"], tasks[task["holds"]["until"]]["requires"])

    def test_any_legal_action_order_finishes_without_deadlock(self):
        rng = random.Random(7)
        for episode in range(200):
            kitchen = Kitchen()
            orders = [kitchen.add_order("lemon_pasta", 900) for _ in range(rng.randint(1, 5))]
            while any(order.status != "served" for order in orders):
                for order in orders:
                    if order.status != "served" and "finish_off_heat" in order.completed_tasks:
                        kitchen.serve_order(order.id)
                available = [(order_id, task) for order_id, tasks
                             in build_observation(kitchen.state)["available_tasks"].items() for task in tasks]
                # Waiting while work is running is legal too, so explore it sometimes.
                if available and (not kitchen.state.running_tasks or rng.random() < 0.8):
                    kitchen.start_task(*rng.choice(available))
                elif kitchen.state.running_tasks:
                    kitchen.advance_to_next_event()
                else:
                    self.assertTrue(all(order.status == "served" for order in orders),
                                    f"Deadlock in episode {episode}: {kitchen.state.resources}")
            self.assertTrue(all(owner is None for owner in kitchen.state.resources.values()))

    def test_priority_drains_immediately_instead_of_reusing_a_full_pot(self):
        run_priority_episode(self.kitchen)
        starts = {(e["order_id"], e["task_id"]): e["time"] for e in self.kitchen.state.events
                  if e["action"] == "task_started"}
        self.assertEqual(starts[(self.first.id, "reserve_water_and_drain")], 380)
        self.assertGreaterEqual(starts[(self.second.id, "boil_water")], 400)


if __name__ == "__main__":
    unittest.main()
