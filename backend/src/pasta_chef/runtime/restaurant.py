"""Deterministic dining-room work. The kitchen remains the authority on cooking.

The renderer acknowledges completed walks; task IDs reject stale acknowledgements.
`served` in the kitchen means ready at the pass. Delivery is tracked separately here.
"""
from copy import deepcopy
import re

WAITER_IDS = ("waiter_a", "waiter_b")
TABLE_COUNTS = {"hall": 10, "terrace": 6}
SEAT_LETTERS = "abcd"
PLATES_PER_TABLE = len(SEAT_LETTERS)  # One plate per physical seat.

# Only an explicit "ko" gets Korean; None or anything else falls back to English.
NOTICES = {
    "ko": dict(greet="어서 오세요! 메뉴를 천천히 보세요. 준비되시면 주문을 도와드릴게요.",
               deliver="맛있게 드세요! 더 필요한 게 있으면 불러 주세요."),
    "en": dict(greet="Welcome! Take your time with the menu. I'll help when you're ready to order.",
               deliver="Enjoy your meal! Call me if you need anything else."),
}


def _notice_text(kind, language):
    return NOTICES["ko" if language == "ko" else "en"][kind]


class RestaurantRuntime:
    def __init__(self, session):
        self.session = session
        self.active_table = None
        self.tables = {}
        self.waiters = {name: dict(id=name, task=None, carrying=None) for name in WAITER_IDS}
        self.delivered = {}
        self._sequence = 0
        self._next_waiter = 0

    def seat(self, seat_id):
        match = re.fullmatch(r"seat\.(hall|terrace)\.([1-9][0-9]?)\.([a-d])", seat_id)
        if not match or int(match[2]) > TABLE_COUNTS[match[1]]:
            raise ValueError("Unknown restaurant seat.")
        table_id = f"table.{match[1]}.{match[2]}"
        self.leave()
        if table_id not in self.tables:
            loads = {name: sum(t["waiter_id"] == name for t in self.tables.values()) for name in WAITER_IDS}
            waiter = min(WAITER_IDS, key=lambda name: (loads[name], (WAITER_IDS.index(name) - self._next_waiter) % 2))
            self._next_waiter = (WAITER_IDS.index(waiter) + 1) % 2
            self.tables[table_id] = dict(id=table_id, seat_id=seat_id, waiter_id=waiter,
                                        seated=True, greeted=False, order_ids=[])
        table = self.tables[table_id]
        table.update(seat_id=seat_id, seated=True)
        self.active_table = table_id
        self.sync()
        return self.snapshot()

    def leave(self):
        if self.active_table:
            table = self.tables[self.active_table]
            table["seated"] = False
            for waiter in self.waiters.values():
                task = waiter["task"]
                if task and task["kind"] == "greet" and task["table_id"] == self.active_table:
                    waiter["task"] = None
        self.active_table = None

    def remember_orders(self, table_id, order_ids):
        if table_id is not None:
            self.tables[table_id]["order_ids"].extend(order_ids)
        self.sync()

    def reassign(self, table_id, waiter_id):
        if table_id not in self.tables or waiter_id not in self.waiters:
            return dict(ok=False, reason="unknown_table_or_waiter")
        if any(w["task"] and w["task"]["table_id"] == table_id and w["task"]["kind"] != "greet"
               for w in self.waiters.values()):
            return dict(ok=False, reason="delivery_in_progress")
        for waiter in self.waiters.values():
            if waiter["task"] and waiter["task"]["table_id"] == table_id:
                waiter["task"] = None
        self.tables[table_id]["waiter_id"] = waiter_id
        self.sync()
        return dict(ok=True, table_id=table_id, waiter_id=waiter_id)

    def _task(self, kind, table_id, order_id=None):
        self._sequence += 1
        return dict(id=self._sequence, kind=kind, table_id=table_id, order_id=order_id)

    def sync(self):
        self.session.sync()
        reserved = {w["task"]["order_id"] for w in self.waiters.values() if w["task"]}
        for name, waiter in self.waiters.items():
            if waiter["task"]:
                continue
            assigned = [t for t in self.tables.values() if t["waiter_id"] == name]
            ready = self._next_pickup(name, reserved)
            if ready:
                table, order_id = ready
                waiter["task"] = self._task("pickup", table["id"], order_id)
                reserved.add(order_id)
                continue
            table = next((t for t in assigned if t["seated"] and not t["greeted"]), None)
            if table:
                waiter["task"] = self._task("greet", table["id"])

    def _next_pickup(self, waiter_name, reserved):
        """First (table, order_id) this waiter can carry, in table then order sequence.

        Full tables leave additional plates at the pass.
        """
        orders = self.session.live.kitchen.state.orders
        for table in self.tables.values():
            if table["waiter_id"] != waiter_name:
                continue
            if sum(d["table_id"] == table["id"] for d in self.delivered.values()) >= PLATES_PER_TABLE:
                continue
            for order_id in table["order_ids"]:
                if (order_id not in self.delivered and order_id not in reserved
                        and orders[order_id].status == "served"):
                    return table, order_id
        return None

    def arrive(self, waiter_id, task_id, language="ko"):
        self.sync()
        waiter = self.waiters.get(waiter_id)
        if not waiter or not waiter["task"] or waiter["task"]["id"] != task_id:
            raise ValueError("This waiter task is no longer active.")
        task = waiter["task"]
        table = self.tables[task["table_id"]]
        notice = None
        if task["kind"] == "pickup":
            order_id = task["order_id"]
            if self.session.live.kitchen.state.orders[order_id].status != "served":
                raise ValueError("The dish is not ready at the pass.")
            waiter["carrying"] = order_id
            waiter["task"] = self._task("deliver", table["id"], order_id)
        elif task["kind"] == "deliver":
            order_id = task["order_id"]
            if waiter["carrying"] != order_id or order_id in self.delivered:
                raise ValueError("This dish cannot be delivered twice.")
            used = {d["seat_id"] for d in self.delivered.values() if d["table_id"] == table["id"]}
            prefix = table["seat_id"].rsplit(".", 1)[0]
            seat = next((s for s in [table["seat_id"], *[f"{prefix}.{letter}" for letter in SEAT_LETTERS]]
                         if s not in used), None)
            if seat is None:
                raise ValueError("The table has no free plate space.")
            self.delivered[order_id] = dict(table_id=table["id"], seat_id=seat, waiter_id=waiter_id)
            waiter.update(task=None, carrying=None)
            notice = _notice_text("deliver", language)
        else:
            table["greeted"] = True
            waiter["task"] = None
            notice = _notice_text("greet", language)
        self.sync()
        return dict(restaurant=self.snapshot(), notice=dict(speaker=waiter_id, text=notice,
                    table_id=table["id"], kind=task["kind"]) if notice else None)

    def snapshot(self):
        self.sync()
        return deepcopy(dict(active_table=self.active_table, tables=list(self.tables.values()),
                             waiters=list(self.waiters.values()), delivered=self.delivered))
