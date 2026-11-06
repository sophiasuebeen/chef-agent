"""Live kitchen sessions on an injected clock: no real waiting, provider calls or credentials."""
import asyncio
from dataclasses import asdict
import hashlib
import json
import random
import unittest

from fastapi.testclient import TestClient

from pasta_chef.main import create_app
from pasta_chef.runtime.sessions import LiveKitchen, LiveSession, SessionStore, event_stream
from pasta_chef.simulation.kitchen import Kitchen
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
