"""Offline deadline metrics used by priority-rule evaluation."""
from copy import deepcopy
import unittest
from evaluation.metrics import calculate_metrics
from pasta_chef.simulation.kitchen import Kitchen
from pasta_chef.simulation.scripted import run_scripted, run_scripted_episode

def result(reason="completed", ok=True):
    return {"ok": ok, "status": "served" if ok else "stopped",
            "termination_reason": reason, "model_calls": 3, "tool_calls": 7}

class EvaluationMetricTests(unittest.TestCase):
    def setUp(self):
        self.kitchen = Kitchen()
        self.kitchen.add_order("lemon_pasta", 1500)
        self.kitchen.add_order("lemon_pasta", 900)

    def test_baseline_meets_both_deadlines_with_existing_script(self):
        outcome = run_scripted_episode(self.kitchen, max_simulated_time=1800)
        metrics = calculate_metrics(self.kitchen.state, outcome)
        self.assertTrue(metrics["all_served"])
        self.assertTrue(metrics["all_on_time"])
        self.assertTrue(metrics["run_success"])
        self.assertEqual(metrics["unserved_orders"], 0)
        self.assertEqual(metrics["late_orders"], 0)
        self.assertEqual(metrics["total_tardiness"], 0)
        self.assertEqual(metrics["finished_at"], 1420)
        self.assertEqual([o["served_at"] for o in metrics["orders"]], [1420, 710])
        self.assertEqual(metrics["model_calls"], 0)

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
        run_scripted_episode(self.kitchen, max_simulated_time=1800)
        self.assertTrue(calculate_metrics(self.kitchen.state, result())["all_on_time"])

    def test_service_timestamp_falls_back_to_event_without_mutation(self):
        run_scripted_episode(self.kitchen, max_simulated_time=1800)
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
        run_scripted_episode(self.kitchen, max_simulated_time=1800)
        metrics = calculate_metrics(self.kitchen.state, result("action_limit", False))
        self.assertFalse(metrics["run_success"])
        self.assertEqual(metrics["termination_reason"], "action_limit")
