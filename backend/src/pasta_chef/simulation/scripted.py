"""Reusable scripted baseline, with an optional bounded multi-order episode."""
from .kitchen import is_complete
from .recipes import load_recipe


def _next_task(kitchen, order_id, recipe):
    """First startable task in recipe order, background work before chef work."""
    tasks = sorted(recipe["tasks"], key=lambda task: "chef" in task["resources"])
    for task in tasks:
        try:
            kitchen.validate_task(order_id, task["id"])
        except (KeyError, ValueError):
            continue
        return task["id"]
    return None


def scripted_actions(kitchen, order_id):
    """Yield one action at a time; each choice reads the kitchen as it now stands."""
    order = kitchen.get_order(order_id)
    recipe = load_recipe(order.menu)
    while not is_complete(order, recipe):
        task_id = _next_task(kitchen, order_id, recipe)
        if task_id is not None:
            yield "start_task", (order_id, task_id)
        elif kitchen.state.running_tasks:
            yield "advance_to_next_event", ()
        else:
            raise ValueError(f"Order cannot make progress: {order_id}")
    yield "serve_order", (order_id,)


def run_scripted(kitchen, order_id):
    """Original terminal baseline: prep overlaps background water heating."""
    for action, args in scripted_actions(kitchen, order_id):
        result = getattr(kitchen, action)(*args)
    return result


def run_scripted_episode(kitchen, *, max_actions=1000, max_simulated_time=1800):
    """Cook complete orders in stable deadline order, stopping exactly at limits."""
    actions = 0

    def finish(reason):
        return dict(ok=reason == "completed", termination_reason=reason,
                    model_calls=0, tool_calls=actions)

    for order in sorted(kitchen.state.orders.values(), key=lambda o: o.deadline):
        if order.status == "served":
            continue
        for action, args in scripted_actions(kitchen, order.id):
            if actions >= max_actions:
                return finish("action_limit")
            if kitchen.state.time >= max_simulated_time and action != "serve_order":
                return finish("simulated_time_limit")
            if action == "advance_to_next_event":
                kitchen.advance_to_next_event(until=max_simulated_time)
            else:
                getattr(kitchen, action)(*args)
            actions += 1
    return finish("completed")
