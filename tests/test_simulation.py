"""Offline simulator behavior, task dependencies and equipment ownership."""
from copy import deepcopy
import json
import random
import unittest
from unittest.mock import patch

from pasta_chef.simulation.kitchen import Kitchen
from pasta_chef.simulation.observation import build_observation
from pasta_chef.simulation.recipes import load_recipe
from pasta_chef.simulation.scheduler import run_priority_episode
from pasta_chef.simulation.scripted import run_scripted

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
