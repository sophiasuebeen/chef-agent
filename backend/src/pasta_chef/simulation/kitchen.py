from copy import deepcopy

from .models import KitchenState, Order, RunningTask
from .recipes import get_task, load_recipe


def validate_task(state: KitchenState, order_id: str, task_id: str) -> dict:
    """Shared read-only validation used by actions and observations."""
    if order_id not in state.orders:
        raise KeyError(f"Unknown order: {order_id}")
    order = state.orders[order_id]
    task = get_task(load_recipe(order.menu), task_id)
    if order.status == "served":
        raise ValueError("Order has already been served.")
    if task_id in order.completed_tasks:
        raise ValueError("Task has already completed.")
    if any(t.order_id == order_id and t.task_id == task_id for t in state.running_tasks):
        raise ValueError("Task is already running.")
    if not set(task["requires"]).issubset(order.completed_tasks):
        raise ValueError("Task dependencies are incomplete.")
    duration = task["duration"]
    if type(duration) is not int or duration <= 0:
        raise ValueError("Task duration must be a positive integer.")
    for resource in task["resources"]:
        if resource not in state.resources:
            raise ValueError(f"Unknown resource: {resource}")
        if state.resources[resource] is not None:
            raise ValueError(f"Resource unavailable: {resource}")
    return task


class Kitchen:
    def __init__(self):
        self.state = KitchenState()

    def reset(self) -> None:
        self.state = KitchenState()

    def _record(self, result: dict) -> dict:
        self.state.events.append(deepcopy(result))
        self.state.last_action_result = deepcopy(result)
        return result

    def add_order(self, menu: str, time_limit: int = 900) -> Order:
        if not isinstance(menu, str):
            raise ValueError("Menu must be a string.")
        menu = menu.strip().lower()
        if type(time_limit) is not int or time_limit <= 0:
            raise ValueError("Time limit must be a positive integer.")
        load_recipe(menu)
        order = Order(
            id=f"order_{self.state.next_order_number}", menu=menu,
            created_at=self.state.time, deadline=self.state.time + time_limit,
        )
        self.state.orders[order.id] = order
        self.state.next_order_number += 1
        self._record(dict(ok=True, action="order_accepted", time=self.state.time,
                          order_id=order.id, menu=menu, deadline=order.deadline))
        return order

    def get_order(self, order_id: str) -> Order:
        if order_id not in self.state.orders:
            raise KeyError(f"Unknown order: {order_id}")
        return self.state.orders[order_id]

    def validate_task(self, order_id: str, task_id: str) -> dict:
        return validate_task(self.state, order_id, task_id)

    def start_task(self, order_id: str, task_id: str) -> dict:
        task = self.validate_task(order_id, task_id)
        running = RunningTask(order_id, task_id, self.state.time + task["duration"],
                              list(task["resources"]))
        for resource in running.resources:
            self.state.resources[resource] = (order_id, task_id)
        self.state.running_tasks.append(running)
        self.state.orders[order_id].status = "cooking"
        return self._record(dict(ok=True, action="task_started", time=self.state.time,
                                 order_id=order_id, task_id=task_id,
                                 finishes_at=running.finishes_at))

    def advance_to_next_event(self) -> dict:
        if not self.state.running_tasks:
            return dict(ok=True, action="no_op", time=self.state.time, completed=[])
        self.state.time = min(t.finishes_at for t in self.state.running_tasks)
        finished = [t for t in self.state.running_tasks if t.finishes_at == self.state.time]
        for task in finished:
            self.state.orders[task.order_id].completed_tasks.append(task.task_id)
            for resource in task.resources:
                if self.state.resources[resource] == (task.order_id, task.task_id):
                    self.state.resources[resource] = None
        self.state.running_tasks = [t for t in self.state.running_tasks if t not in finished]
        return self._record(dict(ok=True, action="tasks_completed", time=self.state.time,
                                 completed=[dict(order_id=t.order_id, task_id=t.task_id)
                                            for t in finished]))

    def serve_order(self, order_id: str) -> dict:
        order = self.get_order(order_id)
        if order.status == "served":
            raise ValueError("Order has already been served.")
        recipe = load_recipe(order.menu)
        if not set(recipe["completion_tasks"]).issubset(order.completed_tasks):
            raise ValueError("Order is incomplete.")
        if any(t.order_id == order_id for t in self.state.running_tasks):
            raise ValueError("Order still has running tasks.")
        order.status = "served"
        order.served_at = self.state.time
        order.on_time = self.state.time <= order.deadline
        return self._record(dict(ok=True, action="order_served", time=self.state.time,
                                 order_id=order_id, on_time=order.on_time))
