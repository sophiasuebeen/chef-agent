"""Offline metrics, repeatability and real-ADK session isolation checks."""
import asyncio
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from evaluation.metrics import calculate_metrics
from evaluation.run import (
    comparison_table, initialize_kitchen, load_scenario,
    run_baseline, run_comparison, terminal_table,
)
from pasta_chef.agents.chef import DEADLINE_OBJECTIVE, get_chef_instruction
from pasta_chef.config import Settings
from scripts.run_local import run_scripted

try:
    from google.adk.models.base_llm import BaseLlm
    from google.adk.models.llm_response import LlmResponse
    from google.adk.sessions import InMemorySessionService
    from google.genai import types
except ImportError:
    BaseLlm = None


def result(reason="completed", ok=True):
    return {"ok": ok, "status": "served" if ok else "stopped",
            "termination_reason": reason, "model_calls": 3, "tool_calls": 7}


class EvaluationMetricTests(unittest.TestCase):
    def setUp(self):
        self.scenario = load_scenario()
        self.kitchen = initialize_kitchen(self.scenario)

    def test_baseline_meets_both_deadlines_with_existing_script(self):
        outcome = run_baseline(self.kitchen, Settings(max_simulated_time=1800))
        metrics = calculate_metrics(self.kitchen.state, outcome)
        self.assertTrue(metrics["all_served"])
        self.assertTrue(metrics["all_on_time"])
        self.assertTrue(metrics["run_success"])
        self.assertEqual(metrics["unserved_orders"], 0)
        self.assertEqual(metrics["late_orders"], 0)
        self.assertEqual(metrics["total_tardiness"], 0)
        self.assertEqual(metrics["finished_at"], 1420)
        self.assertEqual([o["served_at"] for o in metrics["orders"]], [1420, 710])
        self.assertEqual((metrics["model_calls"], metrics["tool_calls"]), (0, 0))

    def test_wrong_priority_counts_late_served_order(self):
        for order in self.kitchen.state.orders.values():
            run_scripted(self.kitchen, order.id)
        metrics = calculate_metrics(self.kitchen.state, result())
        self.assertTrue(metrics["all_served"])
        self.assertFalse(metrics["all_on_time"])
        self.assertFalse(metrics["run_success"])
        self.assertEqual(metrics["late_orders"], 1)
        self.assertEqual(metrics["total_tardiness"], 520)
        self.assertEqual(metrics["unserved_orders"], 0)

    def test_partial_stop_with_zero_tardiness_is_not_success(self):
        run_scripted(self.kitchen, "order_1")
        self.kitchen.state.time = 1200
        metrics = calculate_metrics(self.kitchen.state, result("simulated_time_limit", False))
        self.assertFalse(metrics["all_served"])
        self.assertFalse(metrics["all_on_time"])
        self.assertFalse(metrics["run_success"])
        self.assertEqual(metrics["unserved_orders"], 1)
        self.assertEqual(metrics["late_orders"], 0)
        self.assertEqual(metrics["total_tardiness"], 0)
        self.assertIsNone(metrics["orders"][1]["tardiness"])
        self.assertEqual(metrics["termination_reason"], "simulated_time_limit")
        self.assertEqual(metrics["finished_at"], 1200)
        self.assertEqual((metrics["model_calls"], metrics["tool_calls"]), (3, 7))

    def test_late_served_and_unserved_are_counted_separately(self):
        self.kitchen.get_order("order_1").deadline = 1
        run_scripted(self.kitchen, "order_1")
        metrics = calculate_metrics(self.kitchen.state, result("api_error", False))
        self.assertEqual(metrics["unserved_orders"], 1)
        self.assertEqual(metrics["late_orders"], 1)
        self.assertEqual(metrics["total_tardiness"], 709)
        self.assertFalse(metrics["run_success"])

    def test_service_exactly_at_deadline_counts_as_on_time(self):
        self.kitchen.get_order("order_2").deadline = 710
        run_baseline(self.kitchen, Settings(max_simulated_time=1800))
        self.assertTrue(calculate_metrics(self.kitchen.state, result())["all_on_time"])

    def test_service_timestamp_falls_back_to_event_without_mutation(self):
        run_baseline(self.kitchen, Settings(max_simulated_time=1800))
        self.kitchen.get_order("order_2").served_at = None
        before = deepcopy(self.kitchen.state)
        metrics = calculate_metrics(self.kitchen.state, result())
        self.assertEqual(metrics["orders"][1]["served_at"], 710)
        self.assertTrue(metrics["all_on_time"])
        self.assertEqual(before, self.kitchen.state)

    def test_missing_all_timestamp_evidence_fails_closed(self):
        self.kitchen.get_order("order_1").status = "served"
        with self.assertRaisesRegex(ValueError, "Missing service timestamp"):
            calculate_metrics(self.kitchen.state, result())

    def test_api_error_with_no_services_and_empty_state_are_not_success(self):
        metrics = calculate_metrics(self.kitchen.state, result("api_error", False))
        self.assertEqual(metrics["unserved_orders"], 2)
        self.assertEqual(metrics["total_tardiness"], 0)
        self.assertFalse(metrics["all_on_time"])
        self.kitchen.reset()
        self.assertFalse(calculate_metrics(self.kitchen.state, result())["all_served"])

    def test_interrupted_result_never_reports_run_success(self):
        run_baseline(self.kitchen, Settings(max_simulated_time=1800))
        metrics = calculate_metrics(self.kitchen.state, result("tool_call_limit", False))
        self.assertFalse(metrics["run_success"])
        self.assertEqual(metrics["termination_reason"], "tool_call_limit")

    def test_original_prompt_is_unchanged_and_new_version_only_appends_goal(self):
        original = get_chef_instruction("original")
        # Snapshot captured before extracting the original prompt for comparison.
        self.assertEqual(sha256(original.encode()).hexdigest(),
                         "2579a50344ac819545d24a380f55f52af2d30201f78a63d57f2a1ef739aa0a01")
        self.assertEqual(get_chef_instruction("deadline"), original + "\n\n" + DEADLINE_OBJECTIVE)
        with self.assertRaises(ValueError):
            get_chef_instruction("missing")

    def test_initialization_is_fresh_and_preserves_default_resources(self):
        second = initialize_kitchen(self.scenario)
        self.kitchen.start_task("order_1", "collect_ingredients")
        self.assertEqual(second.state.time, 0)
        self.assertEqual(second.state.next_order_number, 3)
        self.assertEqual([o.deadline for o in second.state.orders.values()], [1500, 900])
        self.assertTrue(all(o.created_at == 0 for o in second.state.orders.values()))
        self.assertEqual(second.state.resources, dict.fromkeys(("chef", "burner", "pot", "pan")))
        self.assertEqual(second.state.running_tasks, [])
        self.assertIsNot(second.state.orders["order_1"].completed_tasks,
                         self.kitchen.state.orders["order_1"].completed_tasks)


class EvaluationTableTests(unittest.TestCase):
    def setUp(self):
        metrics = {
            "all_served": True, "all_on_time": False, "unserved_orders": 0,
            "late_orders": 1, "total_tardiness": 470, "finished_at": 1370,
            "model_calls": 18, "tool_calls": 45, "input_tokens": 40000,
            "rejected_tool_calls": 3, "provider_retries": 1,
            "termination_reason": "completed", "run_success": False,
        }
        stopped = dict(metrics, all_served=False, unserved_orders=2, late_orders=0,
                       total_tardiness=0, finished_at=0, model_calls=1, tool_calls=0,
                       termination_reason="api_error")
        self.reports = [
            {"variant": "original", "repetition": 1, "metrics": metrics},
            {"variant": "deadline", "repetition": 12, "metrics": stopped},
        ]

    def test_terminal_table_columns_line_up_across_rows(self):
        lines = terminal_table(self.reports).splitlines()
        rule = next(i for i, text in enumerate(lines) if text.startswith("---"))
        table = lines[rule - 1:]
        self.assertEqual(len(table), 4)
        self.assertNotIn("|", "\n".join(table))
        # Each column starts where the rule says, whatever a row's cell width is.
        starts = [i for i, c in enumerate(lines[rule]) if c == "-" and lines[rule][i - 1] == " "]
        for text in table:
            for start in starts:
                self.assertEqual(text[start - 2:start], "  ", text)

    def test_terminal_table_reports_same_values_as_markdown(self):
        rows = terminal_table(self.reports).splitlines()[-2:]
        self.assertEqual(rows[0].split(), ["original", "1", "yes", "no", "0", "1", "470",
                                           "1370", "18/45", "40000", "3", "1", "completed", "no"])
        self.assertEqual(rows[1].split(), ["deadline", "12", "no", "no", "2", "0", "0",
                                           "0", "1/0", "40000", "3", "1", "api_error", "no"])
        self.assertIn("| original | 1 | True | False |", comparison_table(self.reports))


class EvaluationRunnerTests(unittest.IsolatedAsyncioTestCase):
    async def test_three_runs_per_prompt_use_same_conditions_and_fresh_kitchens(self):
        calls = []

        async def offline_episode(kitchen, settings, *, prompt_variant):
            self.assertEqual(kitchen.state.time, 0)
            self.assertTrue(all(not o.completed_tasks for o in kitchen.state.orders.values()))
            self.assertTrue(all(owner is None for owner in kitchen.state.resources.values()))
            calls.append((kitchen, settings, prompt_variant))
            kitchen.start_task("order_1", "collect_ingredients")
            return result("model_call_limit", False)

        settings = Settings(model="offline-model", max_model_calls=5, max_tool_calls=11,
                            timeout_seconds=30)
        with TemporaryDirectory() as directory:
            output = Path(directory) / "comparison"
            with self.assertLogs("pasta_chef.progress", "INFO") as logs:
                reports = await run_comparison(load_scenario(), settings, output,
                                               live=True, episode_runner=offline_episode)
            announced = "\n".join(logs.output)
            self.assertIn("Results directory:", announced)
            self.assertIn("Episode 1/6 started: original-1", announced)
            self.assertIn("Saved deadline-3: stop=model_call_limit", announced)
            self.assertEqual(len(reports), 7)
            self.assertEqual(len(list(output.glob("*.json"))), 7)
            self.assertEqual(len({id(call[0]) for call in calls}), 6)
            self.assertEqual([call[2] for call in calls], ["original", "deadline"] * 3)
            self.assertEqual(len({call[1] for call in calls}), 1)
            self.assertEqual(calls[0][1].max_simulated_time, 1800)
            self.assertEqual(calls[0][1].max_model_calls, 5)
            self.assertEqual(calls[0][1].max_tool_calls, 11)
            self.assertEqual(calls[0][1].model, "offline-model")
            self.assertEqual(settings.max_simulated_time, 1200)
            self.assertFalse(reports[1]["metrics"]["run_success"])
            saved = json.loads((output / "deadline-3.json").read_text())
            self.assertEqual(saved["prompt"], get_chef_instruction("deadline"))
            self.assertEqual(saved["settings"]["max_model_calls"], 5)
            self.assertIn("model_call_limit", (output / "comparison.md").read_text())

    async def test_default_mode_never_calls_model(self):
        async def forbidden(*args, **kwargs):
            self.fail("Baseline mode must not call an agent")
        with TemporaryDirectory() as directory:
            reports = await run_comparison(load_scenario(), Settings(), Path(directory) / "baseline",
                                           episode_runner=forbidden)
        self.assertEqual(len(reports), 1)
        self.assertTrue(reports[0]["metrics"]["run_success"])

    async def test_setup_failure_is_recorded_and_comparison_continues(self):
        async def unavailable(*args, **kwargs):
            raise ImportError("potentially sensitive provider details")
        with TemporaryDirectory() as directory:
            reports = await run_comparison(load_scenario(), Settings(), Path(directory) / "failures",
                                           live=True, repetitions=1, episode_runner=unavailable)
        self.assertEqual(len(reports), 3)
        for report in reports[1:]:
            self.assertEqual(report["metrics"]["termination_reason"], "setup_error")
            self.assertEqual(report["metrics"]["unserved_orders"], 2)
            self.assertFalse(report["metrics"]["run_success"])
            self.assertEqual(report["controller_result"]["error"], "ImportError")

    async def test_existing_output_is_not_mixed_with_new_experiment(self):
        with TemporaryDirectory() as directory, self.assertRaises(FileExistsError):
            await run_comparison(load_scenario(), Settings(), directory)


if BaseLlm is not None:
    class OneActionModel(BaseLlm):
        mode: str = "start"

        async def generate_content_async(self, llm_request, stream=False):
            if self.mode == "error":
                raise ConnectionError("private request details must not be saved")
            if self.mode == "timeout":
                await asyncio.sleep(10)
            if self.mode == "read":
                yield LlmResponse(content=types.Content(role="model", parts=[types.Part(
                    function_call=types.FunctionCall(name="get_kitchen_state", args={}))]))
                return
            yield LlmResponse(content=types.Content(role="model", parts=[types.Part(
                function_call=types.FunctionCall(name="start_task", args={
                    "order_id": "order_1", "task_id": "collect_ingredients"}))]))


@unittest.skipIf(BaseLlm is None, "optional ADK dependency not installed")
class EvaluationAdkIsolationTests(unittest.IsolatedAsyncioTestCase):
    async def test_controller_reports_distinct_stop_reasons_without_credentials(self):
        from pasta_chef.runtime.controller import run_agent_episode
        from pasta_chef.simulation.kitchen import Kitchen
        cases = [
            ("start", {"max_model_calls": 1}, "model_call_limit"),
            ("read", {"max_tool_calls": 1}, "tool_call_limit"),
            ("start", {"max_simulated_time": 10}, "simulated_time_limit"),
            ("timeout", {"timeout_seconds": 0.05}, "wall_clock_limit"),
            ("error", {}, "api_error"),
        ]
        for mode, limits, reason in cases:
            with self.subTest(reason=reason):
                kitchen = Kitchen()
                kitchen.add_order("lemon_pasta")
                # Use two orders only in the model-call case so another task
                # becomes startable after the first task completes.
                if reason == "model_call_limit":
                    kitchen.add_order("lemon_pasta")
                outcome = await run_agent_episode(
                    kitchen, Settings(**limits), model=OneActionModel(model="offline", mode=mode))
                self.assertFalse(outcome["ok"])
                self.assertEqual(outcome["termination_reason"], reason)
                self.assertNotIn("private request details", json.dumps(outcome))

    async def test_every_episode_creates_fresh_adk_session_and_agent(self):
        from pasta_chef.runtime.controller import run_agent_episode
        sessions, models = [], []
        create_session = InMemorySessionService.create_session

        async def tracked_session(service, **kwargs):
            session = await create_session(service, **kwargs)
            sessions.append((service, session))
            return session

        async def mocked_episode(kitchen, settings, *, prompt_variant):
            model = OneActionModel(model="offline-model")
            models.append(model)
            return await run_agent_episode(kitchen, settings, model=model, prompt_variant=prompt_variant)

        with TemporaryDirectory() as directory, patch.object(
            InMemorySessionService, "create_session", tracked_session
        ):
            reports = await run_comparison(
                load_scenario(), Settings(max_model_calls=1), Path(directory) / "sessions",
                live=True, episode_runner=mocked_episode,
            )
        self.assertEqual(len(sessions), 6)
        self.assertEqual(len({id(service) for service, _ in sessions}), 6)
        self.assertEqual(len({session.id for _, session in sessions}), 6)
        self.assertEqual(len({id(model) for model in models}), 6)
        for report in reports[1:]:
            self.assertEqual(report["metrics"]["termination_reason"], "model_call_limit")
            self.assertEqual(report["metrics"]["model_calls"], 1)
            self.assertEqual(report["metrics"]["unserved_orders"], 2)
            self.assertEqual(report["events"][2]["time"], 0)
            self.assertEqual(report["events"][2]["task_id"], "collect_ingredients")


if __name__ == "__main__":
    unittest.main()
