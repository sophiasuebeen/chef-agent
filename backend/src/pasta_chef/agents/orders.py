"""OrderDesk: the validated order tools that staff agents call. No model or SDK here.

Each call is validated against the live session when it runs, so a customer's words cannot
change cooking any other way. What actually happened is reported as `actions`, built by
code, and never inferred from the model's reply.
"""
from pasta_chef.agents.host import available_menus

MAX_QUANTITY = 20
DEFAULT_TIME_LIMIT = 900
ACCEPTED_REMINDER = ("Tell the customer the wait in minutes. If they also asked for anything you "
                     "did not order, say by name that you cannot make it.")


class OrderDesk:
    """One conversation's order desk for a live session.

    Attributes after __init__:
        session: the LiveSession (kitchen) that orders go to.
        menus: menu_id -> recipe dict. Defaults to available_menus().
        _actions: list of dicts recording what code actually did this turn.
        _placed_this_turn: (menu_id, quantity) -> the result already returned this turn.
    """

    def __init__(self, session, *, menus=None):
        self.session = session
        # `menus or ...` would also replace an intentionally empty {}; only None means "default".
        self.menus = available_menus() if menus is None else menus
        self._actions = []
        self._placed_this_turn = {}

    def start_turn(self) -> None:
        """Forget this turn's actions and repeated-call memory before a new customer message."""
        # New containers, not .clear(): a caller may still hold last turn's actions list.
        self._actions = []
        self._placed_this_turn = {}

    def place_order(self, menu_id: str, quantity: int) -> dict:
        """Send plates of one dish to the kitchen, which starts cooking on its own.

        Args:
            menu_id: The menu_id of a dish on the menu.
            quantity: How many plates, from 1 to 20.

        Accepted  -> {"ok": True, "order_ids": [...], "ready_in_seconds": int, "reminder": ACCEPTED_REMINDER}
                     and append {"type": "order_accepted", "menu", "quantity", "order_ids", "ready_in_seconds"}.
        Rejected  -> see _reject. Nothing reaches the kitchen.
        Repeated  -> the same (menu_id, quantity) in one turn returns the first result again.
        """
        # 1) Validate first. Each rejection returns early, before the kitchen is touched.
        key = (menu_id, quantity)
        if key in self._placed_this_turn:  # Models sometimes repeat a call; never double an order.
            return self._placed_this_turn[key]
        if menu_id not in self.menus:
            return self._reject(menu_id, quantity, "unsupported_menu",
                                available_menu_ids=sorted(self.menus))
        # `type(x) is int` rejects True/False, which isinstance(x, int) would accept.
        if type(quantity) is not int or not 1 <= quantity <= MAX_QUANTITY:
            return self._reject(menu_id, quantity, "invalid_quantity", max_quantity=MAX_QUANTITY)

        # 2) Only now change state: one order per plate, all in one call.
        orders = self.session.add_orders([(menu_id, DEFAULT_TIME_LIMIT)] * quantity)
        order_ids = [order.id for order in orders]
        ready = self.session.ready_in_seconds(order_ids)

        # 3) Record what code did, and remember the result for a repeated call this turn.
        self._actions.append(dict(type="order_accepted", menu=menu_id, quantity=quantity,
                                  order_ids=order_ids, ready_in_seconds=ready))
        result = dict(ok=True, order_ids=order_ids, ready_in_seconds=ready, reminder=ACCEPTED_REMINDER)
        self._placed_this_turn[key] = result
        return result

    def _reject(self, menu_id, quantity, reason: str, **details) -> dict:
        """Record a refusal and return {"ok": False, "reason": reason, **details}.

        The action is {"type": "order_rejected", "menu": str(menu_id)[:100],
        "quantity": quantity if it is an int else None, "reason": reason}.
        """
        # The action is visible to the client, so cap untrusted text and drop non-int quantities.
        self._actions.append(dict(type="order_rejected", menu=str(menu_id)[:100],
                                  quantity=quantity if type(quantity) is int else None, reason=reason))
        return {"ok": False, "reason": reason, **details}

    def get_order_status(self) -> dict:
        """List orders with their status and remaining kitchen time.

        -> {"orders": [{"id", "menu", "status"}, ...], "all_ready_in_seconds": int}
        all_ready_in_seconds covers unserved orders only, and is 0 when there are none.
        """
        orders = self.session.snapshot()["orders"]
        unserved = [order["id"] for order in orders if order["status"] != "served"]
        ready = self.session.ready_in_seconds(unserved) if unserved else 0
        # Pick only the fields the model needs, instead of exposing the whole snapshot.
        return dict(orders=[dict(id=order["id"], menu=order["menu"], status=order["status"])
                            for order in orders], all_ready_in_seconds=ready)

