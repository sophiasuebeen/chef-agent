"""rehearse_until exercise: one loop for every 'run a kitchen copy forward' estimate."""
from copy import deepcopy
import unittest

from pasta_chef.runtime.sessions import (REHEARSAL_LIMIT_SECONDS, REHEARSAL_STEP_SECONDS, LiveKitchen,
                                         LiveSession, rehearse_until)

MAX_STEPS = REHEARSAL_LIMIT_SECONDS // REHEARSAL_STEP_SECONDS  # 2777 steps fit inside the limit.


def after_calls(n):
    """A finished() that answers False n times, then True. Also counts how often it was asked."""
    def finished():
        finished.calls += 1
        return finished.calls > n
    finished.calls = 0
    return finished


class RehearseUntilTests(unittest.TestCase):
    def setUp(self):
        self.kitchen = LiveKitchen()

    def test_already_finished_does_not_move(self):
        self.kitchen.advance_to(100)
        rehearse_until(self.kitchen, lambda: True)
        self.assertEqual(self.kitchen.now, 100)

    def test_steps_are_one_hour_from_the_start(self):
        self.kitchen.advance_to(100)
        finished = after_calls(2)
        rehearse_until(self.kitchen, finished)
        self.assertEqual(self.kitchen.now, 100 + 2 * REHEARSAL_STEP_SECONDS)
        self.assertEqual(finished.calls, 3, "checked before each of 2 steps, then once more")

    def test_runs_until_a_real_order_is_served(self):
        order = self.kitchen.add_orders(0, [("lemon_pasta", 900)])[0]
        rehearse_until(self.kitchen, lambda: order.served_at is not None)
        self.assertIsNotNone(order.served_at)
        self.assertEqual(self.kitchen.now % REHEARSAL_STEP_SECONDS, 0)

    def test_finishing_on_the_last_allowed_step_is_fine(self):
        rehearse_until(self.kitchen, after_calls(MAX_STEPS))
        self.assertEqual(self.kitchen.now, MAX_STEPS * REHEARSAL_STEP_SECONDS)

    def test_never_finishing_raises_instead_of_looping_forever(self):
        finished = after_calls(10 ** 9)
        with self.assertRaisesRegex(RuntimeError, "Kitchen estimate did not finish."):
            rehearse_until(self.kitchen, finished, error="Kitchen estimate did not finish.")
        self.assertEqual(self.kitchen.now, MAX_STEPS * REHEARSAL_STEP_SECONDS, "never passes the limit")

    def test_default_error_message(self):
        with self.assertRaisesRegex(RuntimeError, "Orders would not finish."):
            rehearse_until(self.kitchen, lambda: False)


class EstimatesStillMatchTests(unittest.TestCase):
    """Behavior callers rely on. These pass before AND after the migration: that is the point."""

    def test_ready_in_seconds_matches_what_the_kitchen_then_does(self):
        now = [0]
        session = LiveSession(speed=1, clock=lambda: now[0])
        ids = [o.id for o in session.add_orders([("lemon_pasta", 900), ("seafood_tomato", 900)])]
        estimate = session.ready_in_seconds(ids)
        before = deepcopy(session.snapshot())
        now[0] = estimate
        served = {o["id"]: o["served_at"] for o in session.snapshot()["orders"]}
        self.assertEqual(max(served[i] for i in ids), estimate)
        self.assertEqual(before["time"], 0, "estimating did not move the real kitchen")


if __name__ == "__main__":
    unittest.main()
