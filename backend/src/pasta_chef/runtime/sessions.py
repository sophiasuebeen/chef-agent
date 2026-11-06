"""Live kitchen sessions: orders can arrive while cooking runs.

Only this module maps wall-clock time to simulated time; the simulator stays clock-free.
There is no background task. Every read or write first catches the simulation up to
the current time, so idle sessions cost nothing. Callers must stay on one event loop
and not await between catching up and using the result, which makes each call atomic.
"""
import asyncio
from dataclasses import asdict
import json
import time
from uuid import uuid4

from pasta_chef.simulation.kitchen import Kitchen
from pasta_chef.simulation.recipes import load_recipe
from pasta_chef.simulation.scheduler import Dispatcher


class LiveKitchen:
    """Dispatch up to a given simulated time. Knows nothing about real time."""

    def __init__(self, *, rule=None, ema=None, duration_sampler=None, chefs=1):
        self.kitchen = Kitchen(duration_sampler=duration_sampler, chefs=chefs)
        self.dispatcher = Dispatcher(self.kitchen, rule=rule, ema=ema)
        self.now = 0

    def _dispatch(self):
        while True:
            self.dispatcher.learn()
            if not (self.dispatcher.serve_one() or self.dispatcher.start_one()):
                return

    def _complete_through(self, target, *, settle):
        """Complete tasks finishing by target. Without settle, leave target's own results
        undispatched so orders arriving at that moment are considered with them."""
        self._dispatch()
        state = self.kitchen.state
        while state.running_tasks and min(t.finishes_at for t in state.running_tasks) <= target:
            self.kitchen.advance_to_next_event()
            if settle or state.time < target:
                self._dispatch()

    def advance_to(self, target):
        """Logs nothing unless something happens, however often it is called."""
        if target > self.now:
            self._complete_through(target, settle=True)
            self.now = target

    def add_orders(self, at, orders):
        """Accept (menu, time_limit) pairs together at one moment; all or none."""
        if type(at) is not int or at < self.now:
            raise ValueError("Orders must arrive at or after the current time.")
        for menu, time_limit in orders:
            if not isinstance(menu, str):
                raise ValueError("Menu must be a string.")
            load_recipe(menu.strip().lower())
            if type(time_limit) is not int or time_limit <= 0:
                raise ValueError("Time limit must be a positive integer.")
        self._complete_through(at, settle=False)
        if self.kitchen.state.time < at:
            self.kitchen.advance_to_next_event(until=at)
        accepted = [self.kitchen.add_order(menu, time_limit) for menu, time_limit in orders]
        self._dispatch()
        self.now = at
        return accepted


class LiveSession:
    def __init__(self, *, speed=10, clock=time.monotonic, **kitchen_options):
        if speed <= 0:
            raise ValueError("Speed must be positive.")
        self.speed = speed
        self.live = LiveKitchen(**kitchen_options)
        self._clock = clock
        self._started_at = clock()

    def sync(self):
        self.live.advance_to(int((self._clock() - self._started_at) * self.speed))
        return self.live.now

    def add_orders(self, orders):
        return self.live.add_orders(self.sync(), orders)

    def snapshot(self):
        now = self.sync()
        state = self.live.kitchen.state
        return dict(
            time=now,
            idle=not state.running_tasks,
            orders=[asdict(order) for order in state.orders.values()],
            resources={name: list(owner) if owner else None for name, owner in state.resources.items()},
            running_tasks=[dict(asdict(task), remaining_time=task.finishes_at - now)
                           for task in state.running_tasks],
        )

    def events_after(self, cursor):
        """Events past a position, each with its 1-based position as sequence."""
        self.sync()
        events = self.live.kitchen.state.events[cursor:]
        return [dict(event, sequence=cursor + index) for index, event in enumerate(events, 1)]


class SessionStore:
    """In-memory and development-only, like RunStore."""

    def __init__(self, *, clock=time.monotonic):
        self._clock = clock
        self._sessions = {}

    def create(self, speed, chefs=1):
        session_id = uuid4().hex
        self._sessions[session_id] = LiveSession(speed=speed, clock=self._clock, chefs=chefs)
        return session_id

    def get(self, session_id):
        return self._sessions[session_id]


async def event_stream(session, after=0, *, poll_seconds=0.2, keep_alive_seconds=15, sleep=asyncio.sleep):
    """Server-sent events for this session, without end. Resume by passing the last id."""
    cursor, quiet = after, 0
    while True:
        events = session.events_after(cursor)
        for event in events:
            cursor = event["sequence"]
            yield f"id: {cursor}\ndata: {json.dumps(event)}\n\n"
        quiet = 0 if events else quiet
        if quiet >= keep_alive_seconds:
            yield ": keep-alive\n\n"
            quiet = 0
        await sleep(poll_seconds)
        quiet += poll_seconds
