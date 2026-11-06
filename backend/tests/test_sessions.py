"""Live kitchen sessions on an injected clock: no real waiting, provider calls or credentials."""
import asyncio
from copy import deepcopy
from dataclasses import asdict
import hashlib
import json
import random
import unittest

from fastapi.testclient import TestClient

from pasta_chef.main import create_app
from pasta_chef.runtime.sessions import LiveKitchen, LiveSession, SessionStore, event_stream
from pasta_chef.simulation.kitchen import Kitchen
from pasta_chef.simulation.observation import build_observation
from pasta_chef.simulation.scheduler import run_priority_episode


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def noisy(seed):
    def sample(order, task):
        digest = hashlib.sha256(f"{seed}:{order.id}:{task['id']}".encode()).hexdigest()
        return max(1, round(task["duration"] * random.Random(digest).uniform(0.8, 1.3)))
    return sample


def generated_arrivals(seed):
    rng = random.Random(seed)
    # 20 and 140 are task completion times, which exercises same-moment ordering.
    moments = [0, 0, 20, 140, 380] + [rng.randint(0, 3000) for _ in range(3)]
    return sorted((dict(at=at, menu="lemon_pasta", time_limit=rng.randint(300, 3000))
                   for at in rng.sample(moments, rng.randint(1, len(moments)))), key=lambda a: a["at"])


def live_run(arrivals, *, sampler=None, ticks=()):
    """Feed arrivals the way a session would, optionally reading at extra moments first."""
    live = LiveKitchen(duration_sampler=sampler)
    moments = sorted({a["at"] for a in arrivals} | set(ticks))
    for moment in moments:
        batch = [(a["menu"], a["time_limit"]) for a in arrivals if a["at"] == moment]
        if batch:
            live.add_orders(moment, batch)
        else:
            live.advance_to(moment)
    live.advance_to(10 ** 7)
    return live


class LiveKitchenTests(unittest.TestCase):
    def test_matches_the_batch_scheduler_for_the_same_arrivals(self):
        for seed in range(15):
            arrivals = generated_arrivals(seed)
            for sampler in (None, noisy(seed)):
                with self.subTest(seed=seed, noisy=sampler is not None):
                    batch = Kitchen(duration_sampler=sampler)
                    result = run_priority_episode(batch, arrivals=arrivals, max_actions=2000,
                                                  max_simulated_time=10 ** 7)
                    self.assertTrue(result["ok"])
                    live = live_run(arrivals, sampler=sampler)
                    self.assertEqual(live.kitchen.state.events, batch.state.events)
                    self.assertEqual({k: asdict(v) for k, v in live.kitchen.state.orders.items()},
                                     {k: asdict(v) for k, v in batch.state.orders.items()})
                    self.assertEqual(live.dispatcher.ema.values, result["ema"])

    def test_how_often_time_is_read_does_not_change_the_kitchen(self):
        arrivals = [dict(at=0, menu="lemon_pasta", time_limit=900),
                    dict(at=75, menu="lemon_pasta", time_limit=900)]
        once = live_run(arrivals)
        often = live_run(arrivals, ticks=range(1, 3000, 7))
        self.assertEqual(often.kitchen.state.events, once.kitchen.state.events)

    def test_idle_time_logs_nothing_until_something_happens(self):
        live = LiveKitchen()
        live.advance_to(500)
        live.advance_to(900)
        self.assertEqual(live.kitchen.state.events, [])
        self.assertEqual(live.now, 900)
        order = live.add_orders(1000, [("lemon_pasta", 900)])[0]
        self.assertEqual((order.created_at, order.deadline), (1000, 1900))
        self.assertEqual([e["action"] for e in live.kitchen.state.events][:3],
                         ["time_advanced", "order_accepted", "task_started"])

    def test_an_order_placed_during_cooking_is_cooked_too(self):
        live = LiveKitchen()
        first = live.add_orders(0, [("lemon_pasta", 900)])[0]
        live.advance_to(200)
        self.assertEqual(first.status, "cooking")
        second = live.add_orders(200, [("lemon_pasta", 2000)])[0]
        live.advance_to(5000)
        self.assertEqual((first.served_at, second.served_at), (710, 1370))
        self.assertEqual(second.created_at, 200)
        self.assertFalse(live.kitchen.state.running_tasks)
        self.assertTrue(all(owner is None for owner in live.kitchen.state.resources.values()))

    def test_plates_ordered_together_are_ranked_together(self):
        live = LiveKitchen()
        later, sooner = live.add_orders(0, [("lemon_pasta", 1500), ("lemon_pasta", 900)])
        first_start = next(e for e in live.kitchen.state.events if e["action"] == "task_started")
        self.assertEqual(first_start["order_id"], sooner.id)
        live.advance_to(5000)
        self.assertLess(sooner.served_at, later.served_at)

    def test_invalid_orders_change_nothing(self):
        live = LiveKitchen()
        live.add_orders(0, [("lemon_pasta", 900)])
        live.advance_to(50)
        before = (list(live.kitchen.state.events), live.now)
        for at, orders in ((60, [("lemon_pasta", 900), ("pizza", 900)]),
                           (60, [("lemon_pasta", 0)]),
                           (60, [("lemon_pasta", True)]),
                           (60, [(7, 900)]),
                           (49, [("lemon_pasta", 900)]),
                           (60.5, [("lemon_pasta", 900)])):
            with self.subTest(at=at, orders=orders), self.assertRaises(ValueError):
                live.add_orders(at, orders)
            self.assertEqual((list(live.kitchen.state.events), live.now), before)
            self.assertEqual(len(live.kitchen.state.orders), 1)


class KitchenChefHoldTests(unittest.TestCase):
    def setUp(self):
        self.kitchen = Kitchen()
        self.order = self.kitchen.add_order("lemon_pasta", 900)

    def test_held_chef_blocks_hand_work_but_not_background_cooking(self):
        self.kitchen.start_task(self.order.id, "collect_ingredients")
        self.kitchen.advance_to_next_event()
        self.kitchen.hold_chef()
        self.assertEqual(self.kitchen.state.events[-1]["action"], "chef_held")
        observation = build_observation(self.kitchen.state)
        self.assertFalse(observation["chef_available"])
        self.assertEqual(observation["available_tasks"][self.order.id], ["boil_water"])
        before = deepcopy(self.kitchen.state)
        with self.assertRaisesRegex(ValueError, "Resource unavailable: chef"):
            self.kitchen.start_task(self.order.id, "prepare_mint")
        self.assertEqual(self.kitchen.state, before)
        self.kitchen.start_task(self.order.id, "boil_water")
        self.kitchen.advance_to_next_event()
        self.assertIn("boil_water", self.order.completed_tasks)
        self.kitchen.release_chef()
        self.kitchen.start_task(self.order.id, "prepare_mint")

    def test_hold_and_release_are_validated_and_change_nothing_when_rejected(self):
        with self.assertRaisesRegex(ValueError, "not held"):
            self.kitchen.release_chef()
        self.kitchen.start_task(self.order.id, "collect_ingredients")
        before = deepcopy(self.kitchen.state)
        with self.assertRaisesRegex(ValueError, "Resource unavailable: chef"):
            self.kitchen.hold_chef()
        with self.assertRaisesRegex(ValueError, "not held"):
            self.kitchen.release_chef()
        self.assertEqual(self.kitchen.state, before)


class LiveChefHoldTests(unittest.TestCase):
    def starts(self, live):
        return {(e["order_id"], e["task_id"]): e["time"] for e in live.kitchen.state.events
                if e["action"] == "task_started"}

    def actions(self, live, *names):
        return [(e["action"], e["time"]) for e in live.kitchen.state.events if e["action"] in names]

    def order_then_hold(self, seconds, at=25):
        live = LiveKitchen()
        self.order = live.add_orders(0, [("lemon_pasta", 900)])[0]
        live.hold_chef(at, seconds)
        return live

    def test_running_hand_work_finishes_first_then_the_chef_talks(self):
        live = self.order_then_hold(60)  # prepare_mint runs from 20 to 40.
        self.assertEqual(live.chef_hold, dict(status="waiting", seconds=60, until=None))
        live.advance_to(50)
        self.assertEqual(live.chef_hold, dict(status="active", seconds=50, until=100))
        self.assertEqual(self.actions(live, "chef_held"), [("chef_held", 40)])
        live.advance_to(5000)
        self.assertEqual(self.actions(live, "chef_released"), [("chef_released", 100)])
        starts = self.starts(live)
        self.assertEqual(starts[(self.order.id, "crush_garlic")], 100)
        self.assertEqual(live.chef_hold["status"], "none")

    def test_background_cooking_continues_and_a_short_chat_costs_nothing(self):
        live = self.order_then_hold(60)
        live.advance_to(5000)
        starts = self.starts(live)
        self.assertEqual(starts[(self.order.id, "cook_pasta_halfway")], 140)
        self.assertEqual(self.order.served_at, 710)

    def test_a_long_chat_delays_the_dish_while_it_keeps_its_equipment(self):
        live = self.order_then_hold(400)  # Chef held from 40 to 440; pasta is done at 380.
        live.advance_to(400)
        resources = live.kitchen.state.resources
        self.assertEqual(resources["chef"], ("customer", "chat"))
        self.assertEqual(resources["pot"], (self.order.id, "cook_pasta_halfway"))
        self.assertEqual(resources["burner"], (self.order.id, "cook_pasta_halfway"))
        live.advance_to(5000)
        # At 440 garlic and draining are both ready; the sauce needs both, so order is free.
        self.assertEqual(self.starts(live)[(self.order.id, "crush_garlic")], 440)
        self.assertEqual(self.starts(live)[(self.order.id, "reserve_water_and_drain")], 460)
        self.assertEqual(self.order.served_at, 790)

    def test_a_request_during_a_hold_only_extends_it(self):
        live = self.order_then_hold(60)
        live.advance_to(50)
        live.hold_chef(50, 200)
        self.assertEqual(live.chef_hold["until"], 250)
        live.hold_chef(60, 10)
        self.assertEqual(live.chef_hold["until"], 250)
        live.advance_to(5000)
        self.assertEqual(self.actions(live, "chef_held", "chef_released"),
                         [("chef_held", 40), ("chef_released", 250)])

    def test_release_goes_back_to_cooking_or_drops_a_waiting_hold(self):
        live = self.order_then_hold(600)
        live.advance_to(60)
        live.release_chef(60)
        self.assertEqual(self.starts(live)[(self.order.id, "crush_garlic")], 60)
        self.assertEqual(live.chef_hold["status"], "none")
        waiting = self.order_then_hold(600)
        waiting.release_chef(30)
        waiting.advance_to(5000)
        self.assertEqual(self.actions(waiting, "chef_held"), [])
        waiting.release_chef(5000)  # Harmless with no hold.
        self.assertEqual(self.order.served_at, 710)

    def test_an_order_arriving_as_a_hold_ends_starts_right_away(self):
        live = LiveKitchen()
        live.hold_chef(0, 100)
        self.assertEqual(self.actions(live, "chef_held"), [("chef_held", 0)])
        order = live.add_orders(100, [("lemon_pasta", 900)])[0]
        self.assertEqual(self.actions(live, "chef_released"), [("chef_released", 100)])
        self.assertEqual(self.starts(live)[(order.id, "collect_ingredients")], 100)

    def test_an_order_during_a_hold_waits_for_hand_work(self):
        live = LiveKitchen()
        live.hold_chef(0, 100)
        order = live.add_orders(30, [("lemon_pasta", 900)])[0]
        self.assertEqual(order.status, "pending")
        live.advance_to(99)
        self.assertEqual(self.starts(live), {})
        live.advance_to(5000)
        self.assertEqual(order.served_at, 810)

    def test_how_often_time_is_read_does_not_change_a_held_kitchen(self):
        def run(step):
            live = LiveKitchen()
            live.add_orders(0, [("lemon_pasta", 900)] * 2)
            live.hold_chef(25, 300)
            for moment in range(26, 3000, step):
                live.advance_to(moment)
            live.advance_to(5000)
            return live.kitchen.state.events
        self.assertEqual(run(1), run(1000))

    def test_invalid_holds_change_nothing(self):
        live = self.order_then_hold(60)
        live.advance_to(50)
        before = list(live.kitchen.state.events)
        for at, seconds in ((60, 0), (60, -5), (60, 1.5), (60, True), (40, 10), (60.5, 10)):
            with self.subTest(at=at, seconds=seconds), self.assertRaises(ValueError):
                live.hold_chef(at, seconds)
            self.assertEqual(live.kitchen.state.events, before)
        with self.assertRaises(ValueError):
            live.release_chef(40)


class LiveSessionTests(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.session = LiveSession(speed=10, clock=self.clock)

    def test_speed_maps_real_time_to_whole_simulated_seconds(self):
        self.clock.now += 2.59
        self.assertEqual(self.session.sync(), 25)

    def test_speed_must_be_positive(self):
        with self.assertRaises(ValueError):
            LiveSession(speed=0, clock=self.clock)

    def test_state_catches_up_and_counts_down_from_the_current_time(self):
        self.session.add_orders([("lemon_pasta", 900)])
        self.clock.now += 5  # 50 simulated seconds: boiling, garlic running.
        state = self.session.snapshot()
        self.assertEqual(state["time"], 50)
        self.assertFalse(state["idle"])
        boil = next(t for t in state["running_tasks"] if t["task_id"] == "boil_water")
        self.assertEqual(boil["remaining_time"], 140 - 50)
        self.assertEqual(state["resources"]["pot"], ["order_1", "boil_water"])
        self.clock.now += 100
        state = self.session.snapshot()
        self.assertTrue(state["idle"])
        self.assertEqual(state["orders"][0]["served_at"], 710)

    def test_events_after_resume_from_a_position(self):
        self.session.add_orders([("lemon_pasta", 900)])
        self.clock.now += 100
        events = self.session.events_after(0)
        self.assertEqual([e["sequence"] for e in events], list(range(1, len(events) + 1)))
        self.assertEqual(self.session.events_after(5), events[5:])
        self.assertEqual(self.session.events_after(len(events)), [])
        self.assertEqual(self.session.events_after(len(events) + 9), [])


class EventStreamTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.session = LiveSession(speed=10, clock=self.clock)

    async def sleep(self, seconds):
        self.clock.now += seconds

    def stream(self, after=0, **options):
        return event_stream(self.session, after, sleep=self.sleep, **options)

    @staticmethod
    def parse(message):
        lines = message.strip().split("\n")
        return int(lines[0].removeprefix("id: ")), json.loads(lines[1].removeprefix("data: "))

    async def test_delivers_events_as_they_happen_including_new_orders(self):
        self.session.add_orders([("lemon_pasta", 900)])
        stream = self.stream(poll_seconds=1)
        seen = []
        added = False
        async for message in stream:
            if message.startswith("id:"):
                seen.append(self.parse(message))
            if not added and any(e["action"] == "order_served" for _, e in seen):
                self.session.add_orders([("lemon_pasta", 900)])
                added = True
            if sum(e["action"] == "order_served" for _, e in seen) == 2:
                break
        await stream.aclose()
        self.assertEqual([number for number, _ in seen], list(range(1, len(seen) + 1)))
        self.assertTrue(all(number == event["sequence"] for number, event in seen))

    async def test_resuming_skips_events_already_seen(self):
        self.session.add_orders([("lemon_pasta", 900)])
        stream = self.stream(after=1)
        number, event = self.parse(await anext(stream))
        await stream.aclose()
        self.assertEqual((number, event["action"]), (2, "task_started"))

    async def test_sends_keep_alive_only_when_quiet(self):
        stream = self.stream(poll_seconds=1, keep_alive_seconds=3)
        self.assertEqual(await asyncio.wait_for(anext(stream), 1), ": keep-alive\n\n")
        self.session.add_orders([("lemon_pasta", 900)])
        self.assertTrue((await anext(stream)).startswith("id: 1\n"))
        await stream.aclose()


class SessionApiTests(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.app = create_app()
        self.app.state.sessions = SessionStore(clock=self.clock)
        self.client = TestClient(self.app)

    def new_session(self, **body):
        response = self.client.post("/sessions", json=body)
        self.assertEqual(response.status_code, 201)
        return response.json()["session_id"]

    def order(self, session_id, **body):
        return self.client.post(f"/sessions/{session_id}/orders",
                                json=dict(menu="lemon_pasta", time_limit=900) | body)

    def test_order_while_cooking_without_blocking_and_finish(self):
        session_id = self.new_session(speed=10)
        first = self.order(session_id)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.json()["orders"][0]["status"], "cooking")
        self.clock.now += 20
        second = self.order(session_id, quantity=2)
        self.assertEqual(second.status_code, 201)
        body = second.json()
        self.assertEqual(body["time"], 200)
        self.assertEqual([o["id"] for o in body["orders"]], ["order_2", "order_3"])
        self.assertEqual({o["created_at"] for o in body["orders"]}, {200})
        self.clock.now += 1000
        state = self.client.get(f"/sessions/{session_id}/state").json()
        self.assertTrue(state["idle"])
        self.assertEqual([o["status"] for o in state["orders"]], ["served"] * 3)

    def test_hold_the_chef_while_cooking_then_release(self):
        session_id = self.new_session(speed=10)
        self.order(session_id)
        self.clock.now += 2.5  # Simulated 25: prepare_mint is running.
        path = f"/sessions/{session_id}/chef-hold"
        response = self.client.post(path, json=dict(seconds=120))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), dict(status="waiting", seconds=120, until=None))
        self.clock.now += 2.5  # Simulated 50: holding since 40.
        state = self.client.get(f"/sessions/{session_id}/state").json()
        self.assertEqual(state["chef_hold"], dict(status="active", seconds=110, until=160))
        self.assertEqual(state["resources"]["chef"], ["customer", "chat"])
        self.assertEqual([t["task_id"] for t in state["running_tasks"]], ["boil_water"])
        self.assertEqual(self.client.delete(path).json()["status"], "none")
        state = self.client.get(f"/sessions/{session_id}/state").json()
        self.assertEqual(state["resources"]["chef"], [state["running_tasks"][-1]["order_id"], "crush_garlic"])

    def test_invalid_holds(self):
        session_id = self.new_session()
        path = f"/sessions/{session_id}/chef-hold"
        for body in (dict(seconds=0), dict(seconds=3601), dict(seconds=1.5), dict(), dict(seconds=1, extra=1)):
            with self.subTest(body):
                self.assertEqual(self.client.post(path, json=body).status_code, 422)
        self.assertEqual(self.client.post("/sessions/missing/chef-hold", json=dict(seconds=1)).status_code, 404)
        self.assertEqual(self.client.delete("/sessions/missing/chef-hold").status_code, 404)

    def test_session_body_is_optional_and_speed_is_reported(self):
        response = self.client.post("/sessions")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["speed"], 10)

    def test_sessions_are_isolated(self):
        first, second = self.new_session(), self.new_session()
        self.order(first)
        self.assertEqual(self.client.get(f"/sessions/{second}/state").json()["orders"], [])

    def test_invalid_requests(self):
        session_id = self.new_session()
        for body in (dict(menu="pizza"), dict(time_limit=0), dict(quantity=0), dict(quantity=21),
                     dict(quantity=1.5), dict(extra=1)):
            with self.subTest(body):
                response = self.order(session_id, **body)
                self.assertEqual(response.status_code, 422)
                self.assertIsInstance(response.json()["detail"], str)
        self.assertEqual(self.client.get(f"/sessions/{session_id}/state").json()["orders"], [])
        for body in (dict(speed=0), dict(speed=1001), dict(extra=1)):
            with self.subTest(body):
                self.assertEqual(self.client.post("/sessions", json=body).status_code, 422)
        for response in (self.order("missing"), self.client.get("/sessions/missing/state"),
                         self.client.get("/sessions/missing/events")):
            self.assertEqual(response.status_code, 404)
        self.assertEqual(self.client.get(f"/sessions/{session_id}/events?after=-1").status_code, 422)


if __name__ == "__main__":
    unittest.main()
