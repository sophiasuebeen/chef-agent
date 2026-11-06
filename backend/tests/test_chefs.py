"""Several chefs as real simulator resources, through the API. Offline."""
import json
import unittest

from fastapi.testclient import TestClient

from pasta_chef.agents.chef import get_chef_instruction
from pasta_chef.main import create_app
from pasta_chef.runtime.sessions import LiveKitchen, SessionStore
from pasta_chef.simulation.kitchen import Kitchen, chef_names, free_chef
from pasta_chef.simulation.observation import build_observation
from pasta_chef.simulation.recipes import load_recipe
from pasta_chef.simulation.scheduler import run_priority_episode
from pasta_chef.simulation.scripted import run_scripted_episode


def kitchen_with(chefs, orders=1):
    kitchen = Kitchen(chefs=chefs)
    for _ in range(orders):
        kitchen.add_order("lemon_pasta")
    return kitchen


class ChefResourceTests(unittest.TestCase):
    def test_resource_names_and_helpers(self):
        self.assertEqual(list(Kitchen().state.resources), ["chef", "burner", "pot", "pan"])
        kitchen = Kitchen(chefs=3)
        self.assertEqual(list(kitchen.state.resources), ["chef", "chef_2", "chef_3", "burner", "pot", "pan"])
        self.assertEqual(chef_names(kitchen.state), ["chef", "chef_2", "chef_3"])
        self.assertEqual(free_chef(kitchen.state), "chef")
        kitchen.state.resources["chef"] = ("customer", "chat")
        self.assertEqual(free_chef(kitchen.state), "chef_2")
        kitchen.state.resources["chef_2"] = kitchen.state.resources["chef_3"] = ("customer", "chat")
        self.assertIsNone(free_chef(kitchen.state))
        kitchen.reset()
        self.assertEqual(chef_names(kitchen.state), ["chef", "chef_2", "chef_3"])

    def test_invalid_counts_are_rejected(self):
        for chefs in (0, 5, -1, 2.0, "2", True, None):
            with self.assertRaises(ValueError):
                Kitchen(chefs=chefs)

    def test_task_gets_first_free_chef_and_releases_only_it(self):
        kitchen = kitchen_with(2, orders=2)
        first = kitchen.start_task("order_1", "collect_ingredients")
        second = kitchen.start_task("order_2", "collect_ingredients")
        self.assertEqual((first["chef"], second["chef"]), ("chef", "chef_2"))
        self.assertEqual(kitchen.state.events[-1]["chef"], "chef_2")
        self.assertEqual([t.resources for t in kitchen.state.running_tasks], [["chef"], ["chef_2"]])
        self.assertEqual(kitchen.state.resources["chef_2"], ("order_2", "collect_ingredients"))
        self.assertFalse(build_observation(kitchen.state)["chef_available"])
        kitchen.add_order("lemon_pasta")
        before = json.dumps(build_observation(kitchen.state))
        with self.assertRaisesRegex(ValueError, "Resource unavailable: chef"):
            kitchen.start_task("order_3", "collect_ingredients")
        self.assertEqual(json.dumps(build_observation(kitchen.state)), before)
        kitchen.advance_to_next_event()
        self.assertIsNone(kitchen.state.resources["chef"])
        self.assertIsNone(kitchen.state.resources["chef_2"])
        self.assertTrue(build_observation(kitchen.state)["chef_available"])

    def test_chef_field_only_with_several_chefs_and_only_on_chef_tasks(self):
        one = kitchen_with(1)
        self.assertNotIn("chef", one.start_task("order_1", "collect_ingredients"))
        two = kitchen_with(2)
        two.start_task("order_1", "collect_ingredients")
        two.advance_to_next_event()
        self.assertNotIn("chef", two.start_task("order_1", "boil_water"))
        self.assertEqual(two.start_task("order_1", "prepare_mint")["chef"], "chef")
        self.assertEqual(two.start_task("order_1", "crush_garlic")["chef"], "chef_2")

    def test_chat_owner_without_an_order_breaks_nothing(self):
        kitchen = kitchen_with(2)
        kitchen.state.resources["chef"] = ("customer", "chat")
        self.assertTrue(build_observation(kitchen.state)["chef_available"])
        self.assertEqual(kitchen.start_task("order_1", "collect_ingredients")["chef"], "chef_2")
        kitchen.advance_to_next_event()
        self.assertEqual(kitchen.state.resources["chef"], ("customer", "chat"))
        kitchen.state.resources["chef_2"] = ("customer", "chat")
        observation = build_observation(kitchen.state)
        self.assertFalse(observation["chef_available"])
        self.assertEqual(observation["available_tasks"]["order_1"], ["boil_water"])

    def test_recipes_and_holds_never_name_a_concrete_chef(self):
        for menu in ("lemon_pasta", "seafood_tomato"):
            for task in load_recipe(menu)["tasks"]:
                self.assertFalse(set(task["resources"]) & {"chef_2", "chef_3", "chef_4"})
                self.assertNotIn("chef", task.get("holds", {}).get("resources", []))

    def test_every_policy_finishes_and_releases_everything(self):
        for chefs in (1, 2, 3, 4):
            for menus in (["lemon_pasta"] * 4, ["seafood_tomato", "lemon_pasta", "seafood_tomato"]):
                for run in (run_priority_episode, run_scripted_episode):
                    kitchen = Kitchen(chefs=chefs)
                    for menu in menus:
                        kitchen.add_order(menu, 900)
                    outcome = run(kitchen, max_simulated_time=6000)
                    self.assertEqual(outcome["termination_reason"], "completed", (chefs, menus, run))
                    self.assertTrue(all(owner is None for owner in kitchen.state.resources.values()))
                    self.assertEqual(kitchen.state.running_tasks, [])

    def test_chefs_work_at_once_and_each_does_one_task_at_a_time(self):
        kitchen = kitchen_with(2, orders=2)
        run_priority_episode(kitchen)
        starts = [e for e in kitchen.state.events if e["action"] == "task_started" and "chef" in e]
        self.assertEqual(len([e for e in starts if e["time"] == 0]), 2)
        for name in ("chef", "chef_2"):
            own = [e for e in starts if e["chef"] == name]
            self.assertTrue(own)
            for before, after in zip(own, own[1:]):
                self.assertLessEqual(before["finishes_at"], after["time"])

    def test_prompt_is_unchanged_for_one_chef_and_explains_several(self):
        self.assertEqual(get_chef_instruction("original"), get_chef_instruction("original", chefs=1))
        self.assertIn("single chef", get_chef_instruction("original"))
        prompt = get_chef_instruction("deadline", chefs=3)
        self.assertNotIn("single chef", prompt)
        self.assertIn("direct 3 chefs", prompt)


class ChefApiTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.client = TestClient(self.app)

    def test_runs_accept_a_chef_count_and_default_to_one(self):
        for kwargs, names in (({}, ["chef"]), ({"json": {}}, ["chef"]), ({"json": {"chefs": 1}}, ["chef"]),
                              ({"json": {"chefs": 4}}, ["chef", "chef_2", "chef_3", "chef_4"])):
            response = self.client.post("/runs", **kwargs)
            self.assertEqual(response.status_code, 201, response.text)
            state = self.client.get(f"/runs/{response.json()['run_id']}/state").json()
            self.assertEqual([r for r in state["resources"] if r.startswith("chef")], names)
            self.assertTrue(state["chef_available"])

    def test_invalid_counts_return_422_in_the_error_format(self):
        for path in ("/runs", "/sessions"):
            for chefs in (0, 5, -1, 1.5, "2", True, None):
                response = self.client.post(path, json={"chefs": chefs})
                self.assertEqual(response.status_code, 422, (path, chefs))
                self.assertEqual(list(response.json()), ["detail"])
                self.assertIsInstance(response.json()["detail"], str)

    def test_replay_records_each_assigned_chef(self):
        run_id = self.client.post("/runs", json={"chefs": 2}).json()["run_id"]
        for _ in range(2):
            self.client.post(f"/runs/{run_id}/orders", json={"menu": "lemon_pasta", "time_limit": 900})
        replay = self.client.post(f"/runs/{run_id}/execute", json={"policy": "priority"}).json()
        self.assertTrue(replay["result"]["completed"])
        self.assertIn("chef_2", replay["initial_conditions"]["resources"])
        self.assertIn("chef_2", replay["final_state"]["resources"])
        started = [e for e in replay["events"] if e["action"] == "task_started"]
        self.assertEqual({e["chef"] for e in started if "chef" in e}, {"chef", "chef_2"})
        self.assertEqual(self.client.get(f"/runs/{run_id}/replay").json(), replay)

    def test_sessions_accept_chefs_next_to_speed(self):
        self.assertEqual(self.client.post("/sessions").status_code, 201)
        created = self.client.post("/sessions", json={"speed": 5, "chefs": 3})
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["speed"], 5)
        session = created.json()["session_id"]
        state = self.client.get(f"/sessions/{session}/state").json()
        self.assertEqual([r for r in state["resources"] if r.startswith("chef")], ["chef", "chef_2", "chef_3"])

    def test_live_kitchen_dispatches_to_every_chef(self):
        live = LiveKitchen(chefs=2)
        live.add_orders(0, [("lemon_pasta", 900), ("lemon_pasta", 900)])
        self.assertEqual(sorted(t.resources[0] for t in live.kitchen.state.running_tasks), ["chef", "chef_2"])
        store = SessionStore(clock=lambda: 0)
        self.assertEqual(chef_names(store.get(store.create(10, 2)).live.kitchen.state), ["chef", "chef_2"])


if __name__ == "__main__":
    unittest.main()
