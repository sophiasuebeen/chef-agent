"""Live kitchen sessions: orders can arrive while cooking runs.

Only this module maps wall-clock time to simulated time; the simulator stays clock-free.
There is no background task. Every read or write first catches the simulation up to
the current time, so idle sessions cost nothing. Callers must stay on one event loop
and not await between catching up and using the result, which makes each call atomic.
"""
import asyncio
from copy import deepcopy
from dataclasses import asdict
import json
import time
from uuid import uuid4

from pasta_chef.simulation.kitchen import Kitchen, chef_names, free_chef
from pasta_chef.simulation.recipes import load_recipe
from pasta_chef.simulation.scheduler import Dispatcher

# Rehearsals run a copied kitchen forward to see the future. Simulated seconds.
REHEARSAL_STEP_SECONDS = 3600
REHEARSAL_LIMIT_SECONDS = 10 ** 7


def rehearse_until(rehearsal, finished, *, error="Orders would not finish."):
    """Advance `rehearsal` (a copied LiveKitchen) one step at a time until finished() is True.

    rehearsal: a LiveKitchen copy. Its .now is the start; .advance_to(t) moves it to t.
    finished:  a function with no arguments returning True when the rehearsal can stop.
               It is checked BEFORE every step, so an already-finished rehearsal never moves.
    error:     message of the RuntimeError raised when the next step would pass the limit.

    Steps go to start + 3600, start + 7200, ... and never beyond start + REHEARSAL_LIMIT_SECONDS.
    Returns None; read results from the rehearsal itself afterwards.
    """
    start = horizon = rehearsal.now
    while not finished():
        horizon += REHEARSAL_STEP_SECONDS
        if horizon - start > REHEARSAL_LIMIT_SECONDS:  # Check before moving: never pass the limit.
            raise RuntimeError(error)
        rehearsal.advance_to(horizon)


class LiveKitchen:
    """Dispatch up to a given simulated time. Knows nothing about real time."""

    def __init__(self, *, rule=None, ema=None, duration_sampler=None, chefs=1, equipment=None):
        self.kitchen = Kitchen(duration_sampler=duration_sampler, chefs=chefs, equipment=equipment)
        self.dispatcher = Dispatcher(self.kitchen, rule=rule, ema=ema)
        self.now = 0
        self._hold_wanted = None  # Seconds, once the chef is free.
        self.held_chef = None
        self._hold_until = None

    def _update_hold(self):
        """End a finished hold, and take the chef before new hand work can."""
        state = self.kitchen.state
        if self._hold_until is not None and state.time >= self._hold_until:
            self.kitchen.release_chef()
            self._hold_until = None
        if self._hold_wanted is not None and free_chef(state) is not None:
            self.held_chef = self.kitchen.hold_chef()["chef"]
            self._hold_until = state.time + self._hold_wanted
            self._hold_wanted = None

    def _dispatch(self):
        while True:
            self.dispatcher.learn()
            self._update_hold()
            if not (self.dispatcher.serve_one() or self.dispatcher.start_one()):
                return

    def _complete_through(self, target, *, settle):
        """Complete tasks finishing by target. Without settle, leave target's own results
        undispatched so orders arriving at that moment are considered with them."""
        self._dispatch()
        state = self.kitchen.state
        while True:
            finish = min((t.finishes_at for t in state.running_tasks), default=None)
            hold_end = self._hold_until if self._hold_until is not None and self._hold_until > state.time else None
            if finish is not None and finish <= target and (hold_end is None or finish <= hold_end):
                self.kitchen.advance_to_next_event()
            elif hold_end is not None and hold_end <= target:
                self.kitchen.advance_to_next_event(until=hold_end)
            else:
                return
            if settle or state.time < target:
                self._dispatch()

    def _move_to(self, at):
        """Bring the kitchen to exactly this moment, for something happening at it."""
        if type(at) is not int or at < self.now:
            raise ValueError("Actions must happen at or after the current time.")
        self._complete_through(at, settle=False)
        if self.kitchen.state.time < at:
            self.kitchen.advance_to_next_event(until=at)

    def advance_to(self, target):
        """Logs nothing unless something happens, however often it is called."""
        if target > self.now:
            self._complete_through(target, settle=True)
            self.now = target

    def add_orders(self, at, orders):
        """Accept (menu, time_limit) pairs together at one moment; all or none."""
        if type(at) is not int or at < self.now:
            raise ValueError("Actions must happen at or after the current time.")
        for menu, time_limit in orders:
            if not isinstance(menu, str):
                raise ValueError("Menu must be a string.")
            load_recipe(menu.strip().lower())
            if type(time_limit) is not int or time_limit <= 0:
                raise ValueError("Time limit must be a positive integer.")
        self._move_to(at)
        accepted = [self.kitchen.add_order(menu, time_limit) for menu, time_limit in orders]
        self._dispatch()
        self.now = at
        return accepted

    def hold_chef(self, at, seconds):
        """Keep the chef for a customer. Running work is never interrupted: the hold starts
        when the chef is next free. A request during a hold can only extend it."""
        if type(seconds) is not int or seconds <= 0:
            raise ValueError("Hold seconds must be a positive integer.")
        self._move_to(at)
        if self._hold_until is not None:
            self._hold_until = max(self._hold_until, at + seconds)
        else:
            self._hold_wanted = max(self._hold_wanted or 0, seconds)
        self._dispatch()
        self.now = at

    def free_helper(self, excluding=None):
        """A free chef other than the one named: someone actually on a break."""
        state = self.kitchen.state
        return next((name for name in chef_names(state)
                     if state.resources[name] is None and name != excluding), None)

    def transfer_hold(self, at, seconds, *, excluding=None):
        """Give the conversation to another free chef and send this one back to work.

        Returns that chef's name, or None if nobody else is free."""
        self._move_to(at)
        helper = self.free_helper(excluding)
        if helper is None:
            self.now = at
            return None
        self._hold_wanted = None
        if self._hold_until is not None:
            self.kitchen.release_chef()
        self.held_chef = self.kitchen.hold_chef(helper)["chef"]
        self._hold_until = at + seconds
        self._dispatch()
        self.now = at
        return helper

    def release_chef(self, at):
        """Stop holding now, or drop a hold still waiting. Harmless with no hold."""
        self._move_to(at)
        self._hold_wanted = None
        if self._hold_until is not None:
            self.kitchen.release_chef()
            self._hold_until = None
        self._dispatch()
        self.now = at

    @property
    def chef_hold(self):
        if self._hold_until is not None:
            return dict(status="active", seconds=self._hold_until - self.now, until=self._hold_until)
        if self._hold_wanted is not None:
            return dict(status="waiting", seconds=self._hold_wanted, until=None)
        return dict(status="none", seconds=None, until=None)


class LiveSession:
    def __init__(self, *, speed=10, clock=time.monotonic, **kitchen_options):
        if speed <= 0:
            raise ValueError("Speed must be positive.")
        self.speed = speed
        self.live = LiveKitchen(**kitchen_options)
        self._clock = clock
        self._started_at = clock()
        self.host = None
        self.host_busy = False
        from pasta_chef.runtime.restaurant import RestaurantRuntime
        self.restaurant = RestaurantRuntime(self)

    def sync(self):
        self.live.advance_to(int((self._clock() - self._started_at) * self.speed))
        return self.live.now

    def add_orders(self, orders):
        return self.live.add_orders(self.sync(), orders)

    def ready_in_seconds(self, order_ids):
        """Simulated seconds until these orders are served, if nothing else changes.

        Rehearses the rest of the service on a copy, using the same rules the kitchen will."""
        now = self.sync()
        rehearsal = deepcopy(self.live)
        state = rehearsal.kitchen.state
        # Stop when THESE orders are served; others may still be cooking.
        rehearse_until(rehearsal, lambda: all(state.orders[i].served_at is not None for i in order_ids))
        return max(state.orders[order_id].served_at for order_id in order_ids) - now

    def hold_chef(self, seconds):
        self.live.hold_chef(self.sync(), seconds)
        return self.live.chef_hold

    def release_chef(self):
        self.live.release_chef(self.sync())
        return self.live.chef_hold

    def snapshot(self):
        now = self.sync()
        state = self.live.kitchen.state
        return dict(
            time=now,
            idle=not state.running_tasks,
            chef_hold=self.live.chef_hold,
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

    def create(self, speed, chefs=1, equipment="standard"):
        session_id = uuid4().hex
        self._sessions[session_id] = LiveSession(speed=speed, clock=self._clock, chefs=chefs,
                                                     equipment={"burner": 6, "pot": 3, "pan": 3} if equipment == "expanded" else None)
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
