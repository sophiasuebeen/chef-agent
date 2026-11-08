"""OrderDesk exercise: validated order tools with a real LiveSession and no SDK or provider."""
import unittest

from pasta_chef.agents.host import available_menus
from pasta_chef.agents.orders import ACCEPTED_REMINDER, MAX_QUANTITY, OrderDesk
from pasta_chef.runtime.sessions import LiveSession


class OrderDeskTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.session = LiveSession(speed=10, clock=lambda: self.now)
        self.desk = OrderDesk(self.session)

    def kitchen_orders(self):
        return self.session.snapshot()["orders"]

    # --- __init__ and start_turn -------------------------------------------------------

    def test_starts_empty_with_every_registered_menu(self):
        self.assertIs(self.desk.session, self.session)
        self.assertEqual(set(self.desk.menus), set(available_menus()))
        self.assertEqual(self.desk._actions, [])
        self.assertEqual(self.desk._placed_this_turn, {})

    def test_two_desks_do_not_share_mutable_state(self):
        other = OrderDesk(LiveSession())
        self.desk.place_order("lemon_pasta", 1)
        self.assertEqual(other._actions, [])
        self.assertEqual(other._placed_this_turn, {})

    def test_custom_menus_limit_what_can_be_ordered(self):
        desk = OrderDesk(self.session, menus={"fig_pasta": available_menus()["fig_pasta"]})
        self.assertFalse(desk.place_order("lemon_pasta", 1)["ok"])
        self.assertTrue(desk.place_order("fig_pasta", 1)["ok"])

    # --- place_order: accepted ---------------------------------------------------------

    def test_accepted_order_reaches_the_kitchen_and_is_recorded_by_code(self):
        result = self.desk.place_order("lemon_pasta", 1)
        self.assertEqual(result, dict(ok=True, order_ids=["order_1"],
                                      ready_in_seconds=self.session.ready_in_seconds(["order_1"]),
                                      reminder=ACCEPTED_REMINDER))
        self.assertGreater(result["ready_in_seconds"], 0)
        self.assertEqual([o["menu"] for o in self.kitchen_orders()], ["lemon_pasta"])
        self.assertEqual(self.desk._actions, [dict(type="order_accepted", menu="lemon_pasta", quantity=1,
                                                   order_ids=["order_1"],
                                                   ready_in_seconds=result["ready_in_seconds"])])

    def test_quantity_creates_one_order_per_plate(self):
        result = self.desk.place_order("seafood_tomato", 3)
        self.assertEqual(result["order_ids"], ["order_1", "order_2", "order_3"])
        self.assertEqual(len(self.kitchen_orders()), 3)

    def test_quantity_limits_are_inclusive(self):
        self.assertTrue(self.desk.place_order("lemon_pasta", 1)["ok"])
        self.assertTrue(self.desk.place_order("fig_pasta", MAX_QUANTITY)["ok"])

    # --- place_order: rejected ---------------------------------------------------------

    def test_off_menu_is_refused_and_lists_what_exists(self):
        result = self.desk.place_order("pizza", 1)
        self.assertEqual(result, dict(ok=False, reason="unsupported_menu",
                                      available_menu_ids=sorted(available_menus())))
        self.assertEqual(self.kitchen_orders(), [])
        self.assertEqual(self.desk._actions, [dict(type="order_rejected", menu="pizza", quantity=1,
                                                   reason="unsupported_menu")])

    def test_bad_quantities_are_refused_without_touching_the_kitchen(self):
        for quantity in (0, -1, MAX_QUANTITY + 1, True, 1.0, "2", None):
            with self.subTest(quantity=quantity):
                result = self.desk.place_order("lemon_pasta", quantity)
                self.assertEqual(result, dict(ok=False, reason="invalid_quantity", max_quantity=MAX_QUANTITY))
        self.assertEqual(self.kitchen_orders(), [])

    def test_rejected_action_hides_non_integer_quantity_and_truncates_menu(self):
        self.desk.place_order("x" * 500, "lots")
        action = self.desk._actions[0]
        self.assertEqual(action["menu"], "x" * 100)
        self.assertIsNone(action["quantity"])

    # --- repeated calls and turns ------------------------------------------------------

    def test_a_repeated_call_in_one_turn_orders_once(self):
        first = self.desk.place_order("lemon_pasta", 2)
        again = self.desk.place_order("lemon_pasta", 2)
        self.assertEqual(again, first)
        self.assertEqual(len(self.kitchen_orders()), 2)
        self.assertEqual(len(self.desk._actions), 1)

    def test_several_dishes_in_one_turn_are_ordered_separately(self):
        self.desk.place_order("lemon_pasta", 1)
        self.desk.place_order("fig_pasta", 1)
        self.desk.place_order("lemon_pasta", 2)  # Same dish, different quantity: a new request.
        self.assertEqual(len(self.kitchen_orders()), 4)

    def test_the_same_dish_in_a_later_turn_is_a_new_order(self):
        self.desk.place_order("lemon_pasta", 1)
        old_actions = self.desk._actions
        self.desk.start_turn()
        self.assertEqual(self.desk._actions, [])
        self.assertEqual(len(old_actions), 1, "start_turn must not empty a list someone already holds")
        self.assertEqual(self.desk.place_order("lemon_pasta", 1)["order_ids"], ["order_2"])

    # --- get_order_status --------------------------------------------------------------

    def test_status_with_no_orders(self):
        self.assertEqual(self.desk.get_order_status(), dict(orders=[], all_ready_in_seconds=0))

    def test_status_comes_from_the_kitchen(self):
        self.desk.place_order("lemon_pasta", 1)
        status = self.desk.get_order_status()
        self.assertEqual(status["orders"], [dict(id="order_1", menu="lemon_pasta", status="cooking")])
        self.assertEqual(status["all_ready_in_seconds"], self.session.ready_in_seconds(["order_1"]))

    def test_served_orders_add_no_remaining_time(self):
        self.desk.place_order("lemon_pasta", 1)
        self.now = 10_000  # Real seconds; at speed 10 the dish is long finished.
        status = self.desk.get_order_status()
        self.assertEqual(status["orders"][0]["status"], "served")
        self.assertEqual(status["all_ready_in_seconds"], 0)


if __name__ == "__main__":
    unittest.main()
