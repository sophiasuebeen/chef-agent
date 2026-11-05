"""Offline API checks: no model calls, API keys, or running server.

PYTHONPATH=backend/src backend/.venv/bin/python -m unittest discover -s backend/tests -v
"""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from json import JSONDecodeError
from threading import Thread
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from pasta_chef.api.schemas import MAX_JSON_SAFE_INT
from pasta_chef.main import create_app
from pasta_chef.simulation.observation import build_observation

LEMON = {"menu": "lemon_pasta", "time_limit": 900}


def cook_and_serve(kitchen, order_id: str) -> None:
    """Drive the simulator directly: the API has no cooking endpoints."""
    while True:
        available = build_observation(kitchen.state)["available_tasks"][order_id]
        if available:
            kitchen.start_task(order_id, available[0])
        elif kitchen.state.running_tasks:
            kitchen.advance_to_next_event()
        else:
            break
    kitchen.serve_order(order_id)


class ApiTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.client = TestClient(self.app)

    def new_run(self) -> str:
        response = self.client.post("/runs")
        self.assertEqual(response.status_code, 201)
        return response.json()["run_id"]

    def order(self, run_id: str, body: dict = LEMON):
        return self.client.post(f"/runs/{run_id}/orders", json=body)

    def state(self, run_id: str) -> dict:
        response = self.client.get(f"/runs/{run_id}/state")
        self.assertEqual(response.status_code, 200)
        return response.json()


class RunCreationTests(ApiTestCase):
    def test_each_run_gets_a_unique_id_and_an_empty_kitchen(self):
        first, second = self.new_run(), self.new_run()
        self.assertNotEqual(first, second)
        state = self.state(first)
        self.assertEqual(state["time"], 0)
        self.assertEqual(state["orders"], [])


class OrderAndStateTests(ApiTestCase):
    def test_accepted_order_is_returned_and_visible_in_state(self):
        run_id = self.new_run()
        response = self.order(run_id)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), {
            "id": "order_1", "menu": "lemon_pasta", "created_at": 0, "deadline": 900,
            "status": "pending", "completed_tasks": [], "served_at": None, "on_time": None,
        })
        self.assertEqual(self.state(run_id)["orders"], [response.json()])

    def test_state_is_exactly_the_simulator_observation(self):
        run_id = self.new_run()
        self.order(run_id)
        kitchen = self.app.state.runs.get(run_id).kitchen
        kitchen.start_task("order_1", "collect_ingredients")  # Covers running-task fields.
        self.assertEqual(self.state(run_id), build_observation(kitchen.state))

    def test_time_limit_sets_the_deadline_from_current_simulated_time(self):
        run_id = self.new_run()
        self.order(run_id)
        kitchen = self.app.state.runs.get(run_id).kitchen
        kitchen.start_task("order_1", "collect_ingredients")
        kitchen.advance_to_next_event()
        now = kitchen.state.time
        self.assertGreater(now, 0)
        order = self.order(run_id, {"menu": "lemon_pasta", "time_limit": 7}).json()
        self.assertEqual((order["created_at"], order["deadline"]), (now, now + 7))

    def test_time_limit_boundaries_are_accepted(self):
        run_id = self.new_run()
        for limit in (1, MAX_JSON_SAFE_INT):
            with self.subTest(limit):
                response = self.order(run_id, {"menu": "lemon_pasta", "time_limit": limit})
                self.assertEqual(response.status_code, 201)
                self.assertEqual(response.json()["deadline"], limit)

    def test_menu_is_normalized_by_the_simulator(self):
        response = self.order(self.new_run(), {"menu": "  LEMON_pasta\n", "time_limit": 1})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["menu"], "lemon_pasta")

    def test_accepting_an_order_does_not_start_cooking(self):
        run_id = self.new_run()
        self.order(run_id)
        state = self.state(run_id)
        self.assertEqual(state["time"], 0)
        self.assertEqual(state["running_tasks"], [])
        self.assertTrue(state["chef_available"])
        self.assertEqual(state["completed_tasks"], {"order_1": []})
        self.assertEqual(state["available_tasks"], {"order_1": ["collect_ingredients"]})


class OrderRetrievalTests(ApiTestCase):
    def get(self, run_id: str, order_id: str = "order_1"):
        return self.client.get(f"/runs/{run_id}/orders/{order_id}")

    def kitchen(self, run_id: str):
        return self.app.state.runs.get(run_id).kitchen

    def test_pending_order_matches_the_created_order(self):
        run_id = self.new_run()
        created = self.order(run_id).json()
        response = self.get(run_id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), created)
        self.assertEqual(response.json()["status"], "pending")
        self.assertIsNone(response.json()["served_at"])
        self.assertIsNone(response.json()["on_time"])

    def test_cooking_order_shows_progress(self):
        run_id = self.new_run()
        self.order(run_id)
        self.kitchen(run_id).start_task("order_1", "collect_ingredients")
        self.kitchen(run_id).advance_to_next_event()
        order = self.get(run_id).json()
        self.assertEqual(order["status"], "cooking")
        self.assertEqual(order["completed_tasks"], ["collect_ingredients"])

    def test_served_order_stays_retrievable_after_leaving_state_orders(self):
        run_id = self.new_run()
        self.order(run_id)
        cook_and_serve(self.kitchen(run_id), "order_1")
        served_at = self.kitchen(run_id).state.time

        response = self.get(run_id)
        self.assertEqual(response.status_code, 200)
        order = response.json()
        self.assertEqual(order["id"], "order_1")
        self.assertEqual(order["menu"], "lemon_pasta")
        self.assertEqual(order["status"], "served")
        self.assertEqual((order["created_at"], order["deadline"]), (0, 900))
        self.assertEqual(order["served_at"], served_at)
        self.assertGreater(served_at, 0)
        self.assertIs(order["on_time"], True)

        state = self.state(run_id)
        self.assertEqual(state["orders"], [])  # The observation format is unchanged.
        self.assertEqual(state, build_observation(self.kitchen(run_id).state))

    def test_late_served_order_reports_not_on_time(self):
        run_id = self.new_run()
        self.order(run_id, {"menu": "lemon_pasta", "time_limit": 1})
        cook_and_serve(self.kitchen(run_id), "order_1")
        order = self.get(run_id).json()
        self.assertEqual(order["status"], "served")
        self.assertIs(order["on_time"], False)
        self.assertGreater(order["served_at"], order["deadline"])

    def test_retrieving_an_order_changes_nothing(self):
        run_id = self.new_run()
        self.order(run_id)
        before = self.state(run_id)
        self.get(run_id)
        self.get(run_id, "order_404")
        self.assertEqual(self.state(run_id), before)

    def test_unknown_run_or_order_returns_404(self):
        run_id = self.new_run()
        self.order(run_id)
        cases = {
            "unknown order": (run_id, "order_2", "Unknown order: order_2"),
            "unknown run": ("missing", "order_1", "Unknown run: missing"),
            "both unknown": ("missing", "order_2", "Unknown run: missing"),
        }
        for name, (run, order_id, detail) in cases.items():
            with self.subTest(name):
                response = self.get(run, order_id)
                self.assertEqual(response.status_code, 404)
                self.assertEqual(response.json(), {"detail": detail})

    def test_invalid_utf8_order_id_returns_404(self):
        self.assertEqual(self.get(self.new_run(), "%ED%A0%80").status_code, 404)

    def test_same_order_id_in_another_run_is_a_separate_order(self):
        served, pending, empty = self.new_run(), self.new_run(), self.new_run()
        self.order(served)
        self.order(served)
        self.order(pending, {"menu": "lemon_pasta", "time_limit": 7})
        cook_and_serve(self.kitchen(served), "order_1")

        self.assertEqual(self.get(served).json()["status"], "served")
        other = self.get(pending).json()
        self.assertEqual(other["status"], "pending")
        self.assertEqual(other["deadline"], 7)
        self.assertIsNone(other["served_at"])
        self.assertEqual(self.get(served, "order_2").status_code, 200)
        self.assertEqual(self.get(pending, "order_2").status_code, 404)
        self.assertEqual(self.get(empty).status_code, 404)


class InvalidInputTests(ApiTestCase):
    def test_invalid_bodies_return_422_and_leave_state_unchanged(self):
        run_id = self.new_run()
        before = self.state(run_id)
        bodies = {
            "unknown menu": {"menu": "pizza", "time_limit": 900},
            "non-string menu": {"menu": 1, "time_limit": 900},
            "missing menu": {"time_limit": 900},
            "empty menu": {"menu": "", "time_limit": 900},
            "blank menu": {"menu": "   ", "time_limit": 900},
            "zero limit": {"menu": "lemon_pasta", "time_limit": 0},
            "negative limit": {"menu": "lemon_pasta", "time_limit": -1},
            "fractional limit": {"menu": "lemon_pasta", "time_limit": 1.5},
            "string limit": {"menu": "lemon_pasta", "time_limit": "900"},
            "boolean limit": {"menu": "lemon_pasta", "time_limit": True},
            "too large limit": {"menu": "lemon_pasta", "time_limit": MAX_JSON_SAFE_INT + 1},
            "null limit": {"menu": "lemon_pasta", "time_limit": None},
            "missing limit": {"menu": "lemon_pasta"},
        }
        for name, body in bodies.items():
            with self.subTest(name):
                self.assertEqual(self.order(run_id, body).status_code, 422)
        self.assertEqual(self.state(run_id), before)

    def test_inputs_json_cannot_echo_return_422_in_the_error_format(self):
        run_id = self.new_run()
        before = self.state(run_id)
        bodies = {
            "NaN limit": '{"menu":"lemon_pasta","time_limit":NaN}',
            "Infinity limit": '{"menu":"lemon_pasta","time_limit":Infinity}',
            "overflowing limit": '{"menu":"lemon_pasta","time_limit":1e999}',
            "NaN menu": '{"menu":NaN,"time_limit":1}',
            "bare NaN": "NaN",
            "surrogate limit": '{"menu":"lemon_pasta","time_limit":"\\ud800"}',
            "surrogate key": '{"\\ud800":1}',
            "surrogate menu": '{"menu":"\\ud800","time_limit":1}',
            "malformed JSON": "{bad",
        }
        client = TestClient(self.app, raise_server_exceptions=False)
        for name, body in bodies.items():
            with self.subTest(name):
                response = client.post(f"/runs/{run_id}/orders", content=body,
                                       headers={"content-type": "application/json"})
                self.assertEqual(response.status_code, 422)
                self.assertIsInstance(response.json()["detail"], str)
        self.assertEqual(self.state(run_id), before)

    def test_unparsable_number_returns_400_in_the_error_format(self):
        response = self.client.post(
            f"/runs/{self.new_run()}/orders",
            content='{"menu":"lemon_pasta","time_limit":1' + "0" * 5000 + "}",
            headers={"content-type": "application/json"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIsInstance(response.json()["detail"], str)

    def test_validation_errors_name_the_field(self):
        response = self.order(self.new_run(), {"menu": "lemon_pasta", "time_limit": 0})
        self.assertIn("body.time_limit", response.json()["detail"])

    def test_unknown_menu_error_comes_from_the_simulator(self):
        response = self.order(self.new_run(), {"menu": "pizza", "time_limit": 900})
        self.assertEqual(response.json(), {"detail": "Unknown menu: pizza"})

    def test_unknown_run_returns_404(self):
        for response in (self.order("missing"), self.client.get("/runs/missing/state")):
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json(), {"detail": "Unknown run: missing"})

    def test_unreadable_recipe_is_a_server_error_not_a_client_error(self):
        client = TestClient(self.app, raise_server_exceptions=False)
        run_id = self.new_run()
        for error in (JSONDecodeError("bad recipe", "", 0),
                      UnicodeDecodeError("utf-8", b"x", 0, 1, "bad recipe")):
            with self.subTest(type(error).__name__), \
                    patch("pasta_chef.simulation.kitchen.load_recipe", side_effect=error):
                response = client.post(f"/runs/{run_id}/orders", json=LEMON)
                self.assertEqual(response.status_code, 500)


class RunIsolationTests(ApiTestCase):
    def test_orders_and_progress_do_not_cross_runs(self):
        first, second = self.new_run(), self.new_run()
        self.order(first)
        self.order(first)
        self.assertEqual(self.state(second)["orders"], [])
        self.assertEqual(self.order(second).json()["id"], "order_1")

        kitchen = self.app.state.runs.get(first).kitchen
        kitchen.start_task("order_1", "collect_ingredients")
        kitchen.advance_to_next_event()
        self.assertGreater(self.state(first)["time"], 0)
        other = self.state(second)
        self.assertEqual(other["time"], 0)
        self.assertEqual(other["completed_tasks"], {"order_1": []})

    def test_apps_do_not_share_runs(self):
        run_id = self.new_run()
        other = TestClient(create_app())
        self.assertEqual(other.get(f"/runs/{run_id}/state").status_code, 404)


class ConcurrencyTests(ApiTestCase):
    def test_add_order_runs_while_holding_only_its_own_run_lock(self):
        target, other = self.new_run(), self.new_run()
        runs = self.app.state.runs
        real_add_order = runs.get(target).kitchen.add_order
        seen = {}

        def add_order(*args):
            seen.update(target=runs.get(target).lock.locked(), other=runs.get(other).lock.locked())
            return real_add_order(*args)

        with patch.object(runs.get(target).kitchen, "add_order", add_order):
            self.assertEqual(self.order(target).status_code, 201)
        self.assertEqual(seen, {"target": True, "other": False})
        self.assertFalse(runs.get(target).lock.locked())

    def test_get_order_runs_while_holding_only_its_own_run_lock(self):
        target, other = self.new_run(), self.new_run()
        self.order(target)
        runs = self.app.state.runs
        real_get_order = runs.get(target).kitchen.get_order
        seen = {}

        def get_order(order_id):
            seen.update(target=runs.get(target).lock.locked(), other=runs.get(other).lock.locked())
            return real_get_order(order_id)

        with patch.object(runs.get(target).kitchen, "get_order", get_order):
            response = self.client.get(f"/runs/{target}/orders/order_1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(seen, {"target": True, "other": False})
        self.assertFalse(runs.get(target).lock.locked())

    def test_an_unknown_order_releases_the_run_lock(self):
        run_id = self.new_run()
        self.assertEqual(self.client.get(f"/runs/{run_id}/orders/order_1").status_code, 404)
        self.assertFalse(self.app.state.runs.get(run_id).lock.locked())

    def test_retrieved_order_is_copied_while_holding_the_run_lock(self):
        run_id = self.new_run()
        self.order(run_id)
        lock = self.app.state.runs.get(run_id).lock
        seen = []

        def copy_order(order):
            seen.append(lock.locked())
            return asdict(order)

        with patch("pasta_chef.api.routes.orders.asdict", copy_order):
            self.client.get(f"/runs/{run_id}/orders/order_1")
        self.assertEqual(seen, [True])

    def test_state_is_built_while_holding_the_run_lock(self):
        run_id = self.new_run()
        lock = self.app.state.runs.get(run_id).lock
        seen = []

        def observe(state):
            seen.append(lock.locked())
            return build_observation(state)

        with patch("pasta_chef.api.routes.runs.build_observation", observe):
            self.state(run_id)
        self.assertEqual(seen, [True])
        self.assertFalse(lock.locked())

    def test_a_rejected_order_releases_the_run_lock(self):
        run_id = self.new_run()
        self.assertEqual(self.order(run_id, {"menu": "pizza", "time_limit": 1}).status_code, 422)
        self.assertFalse(self.app.state.runs.get(run_id).lock.locked())

    def test_a_held_run_lock_does_not_block_another_run(self):
        held, free = self.new_run(), self.new_run()
        results = {}
        thread = Thread(target=lambda: results.update(free=self.order(free)), daemon=True)
        with self.app.state.runs.get(held).lock:
            thread.start()
            thread.join(5)
            self.assertFalse(thread.is_alive(), "another run waited for this run's lock")
        self.assertEqual(results["free"].status_code, 201)

    def test_concurrent_orders_all_succeed_with_distinct_ids(self):
        # Smoke test only: races rarely appear here, so the lock tests above prove the locking.
        run_id = self.new_run()
        with ThreadPoolExecutor(max_workers=8) as pool:
            responses = list(pool.map(lambda _: self.order(run_id), range(40)))
        self.assertEqual({r.status_code for r in responses}, {201})
        self.assertEqual({r.json()["id"] for r in responses},
                         {f"order_{n}" for n in range(1, 41)})


class OpenApiTests(ApiTestCase):
    def test_declared_errors_match_the_error_format(self):
        paths = self.app.openapi()["paths"]
        routes = {("/runs/{run_id}/orders", "post"): {"400", "404", "422"},
                  ("/runs/{run_id}/orders/{order_id}", "get"): {"404", "422"},
                  ("/runs/{run_id}/state", "get"): {"404", "422"}}
        for (path, method), codes in routes.items():
            responses = paths[path][method]["responses"]
            for code in codes:
                with self.subTest(path=path, code=code):
                    schema = responses[code]["content"]["application/json"]["schema"]
                    self.assertEqual(schema, {"$ref": "#/components/schemas/ErrorResponse"})

    def test_order_endpoint_publishes_the_order_format(self):
        responses = self.app.openapi()["paths"]["/runs/{run_id}/orders/{order_id}"]["get"]["responses"]
        self.assertEqual(responses["200"]["content"]["application/json"]["schema"],
                         {"$ref": "#/components/schemas/OrderResponse"})

    def test_time_limit_bounds_are_published(self):
        field = self.app.openapi()["components"]["schemas"]["OrderCreate"]["properties"]["time_limit"]
        self.assertEqual(field["exclusiveMinimum"], 0)
        self.assertEqual(field["maximum"], MAX_JSON_SAFE_INT)


if __name__ == "__main__":
    unittest.main()
