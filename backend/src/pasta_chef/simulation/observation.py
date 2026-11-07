from copy import deepcopy
from dataclasses import asdict

from .kitchen import free_chef, validate_task
from .models import KitchenState
from .recipes import load_recipe


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
        "resources": {r: list(owner) if owner else None for r, owner in state.resources.items()},
        "chef_available": free_chef(state) is not None,
        "running_tasks": [dict(asdict(t), remaining_time=t.finishes_at - state.time)
                          for t in state.running_tasks],
        "completed_tasks": {o.id: list(o.completed_tasks) for o in state.orders.values()},
        "available_tasks": available,
        "recent_events": state.events[-20:],
        "last_action_result": state.last_action_result,
    })
