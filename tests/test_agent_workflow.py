"""Offline workflow checks. ADK tests mock the model, not the simulator or Runner.

PYTHONPATH=backend/src python3 -m unittest discover -s tests -v
PYTHONPATH=backend/src backend/.venv/bin/python -m unittest discover -s tests -v
"""
import asyncio
from copy import deepcopy
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from pasta_chef.agents.tools.kitchen import EpisodeLimit, KitchenTools
from pasta_chef.config import Settings
from pasta_chef.simulation.kitchen import Kitchen
from pasta_chef.simulation.observation import build_observation
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

        async def generate_content_async(self, llm_request, stream=False):
            observation = json.loads(llm_request.contents[-1].parts[0].text.split(": ", 1)[1])
            self.observations.append(observation)
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
            yield LlmResponse(content=types.Content(role="model", parts=parts))


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


if __name__ == "__main__":
    unittest.main()
