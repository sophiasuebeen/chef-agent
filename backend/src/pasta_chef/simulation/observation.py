from copy import deepcopy
from dataclasses import asdict

from .kitchen import free_chef, validate_task
from .models import KitchenState
from .recipes import load_recipe


def serialize_resources(state: KitchenState) -> dict:
    """Resource name -> owner as a JSON list, or None when free."""
    return {name: list(owner) if owner else None for name, owner in state.resources.items()}


def serialize_running_tasks(state: KitchenState, now: int) -> list[dict]:
    """Detached running tasks, each with remaining_time measured from now."""
    return [dict(asdict(task), remaining_time=task.finishes_at - now) for task in state.running_tasks]


def build_observation(state: KitchenState) -> dict:
    """Return a detached JSON snapshot, using the simulator's validation rules."""
    available = {}
    for order in state.orders.values():
        if order.status == "served":
            continue
        available[order.id] = []
        for task in load_recipe(order.menu)["tasks"]:
            try:
                validate_task(state, order.id, task["id"])
            except (KeyError, ValueError):
                continue
            available[order.id].append(task["id"])
    return deepcopy({
        "time": state.time,
        "orders": [asdict(o) for o in state.orders.values() if o.status != "served"],
        "resources": serialize_resources(state),
        "chef_available": free_chef(state) is not None,
        "running_tasks": serialize_running_tasks(state, state.time),
        "completed_tasks": {o.id: list(o.completed_tasks) for o in state.orders.values()},
        "available_tasks": available,
        "recent_events": state.events[-20:],
        "last_action_result": state.last_action_result,
    })
