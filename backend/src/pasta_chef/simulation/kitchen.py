from copy import deepcopy

from .models import KitchenState, Order, RunningTask
from .recipes import get_task, load_recipe

MAX_CHEFS = 4
# Order intake rules shared by the HTTP API and the staff tools; both import them from here.
MAX_QUANTITY = 20  # Plates per order request.
DEFAULT_TIME_LIMIT = 900  # Simulated seconds from acceptance to deadline.


def chef_names(state: KitchenState) -> list[str]:
    """Every chef resource, in order: chef, chef_2, ..."""
    return [name for name in state.resources if name == "chef" or name.startswith("chef_")]


def free_chef(state: KitchenState) -> str | None:
    """The first unowned chef, or None. Owners are not always orders: see KitchenState."""
    return next((name for name in chef_names(state) if state.resources[name] is None), None)


# Resource owner while the chef talks with a customer. Order IDs never take this form.
CUSTOMER_CHAT = ("customer", "chat")


def resource_kind(name: str) -> str:
    """Recipes name a resource pool; running tasks name a concrete unit."""
    base, _, suffix = name.rpartition("_")
    return base if suffix.isdigit() else name


def _held_for(state: KitchenState, order_id: str, task_id: str) -> set[str]:
    """Equipment this order kept from an earlier step, waiting for this task."""
    owned = {resource: owner[1] for resource, owner in state.resources.items()
             if owner and owner[0] == order_id}
    if not owned:  # Validation runs constantly, so skip reading the recipe when possible.
        return set()
    recipe = load_recipe(state.orders[order_id].menu)
    held = set()
    for resource, owner_task in owned.items():
        hold = get_task(recipe, owner_task).get("holds")
        if hold and hold["until"] == task_id and resource_kind(resource) in hold["resources"]:
            held.add(resource)
    return held


def validate_task(state: KitchenState, order_id: str, task_id: str) -> dict:
    """Shared read-only validation used by actions and observations."""
    return _validate_task(state, order_id, task_id)[0]


def _validate_task(state: KitchenState, order_id: str, task_id: str) -> tuple[dict, set[str]]:
    """Validate, returning the task and the equipment this order holds for it.

    The held set reflects ownership before this task starts, so start_task reuses it
    rather than recomputing (and reloading the recipe) after validation.
    """
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
    held = _held_for(state, order_id, task_id)
    _assign_resources(state, task, held)
    return task, held


def _assign_resources(state: KitchenState, task: dict, held: set[str]) -> list[str]:
    assigned = []
    for resource in task["resources"]:
        candidates = chef_names(state) if resource == "chef" else [
            name for name in state.resources if resource_kind(name) == resource]
        if not candidates:
            raise ValueError(f"Unknown resource: {resource}")
        selected = next((name for name in candidates if name in held), None)
        selected = selected or next((name for name in candidates if state.resources[name] is None and name not in assigned), None)
        if selected is None:
            raise ValueError(f"Resource unavailable: {resource}")
        assigned.append(selected)
    return assigned


def is_complete(order: Order, recipe: dict) -> bool:
    """True when every completion task of the recipe is done for this order. Serving is separate."""
    return set(recipe["completion_tasks"]).issubset(order.completed_tasks)


class Kitchen:
    def __init__(self, *, duration_sampler=None, chefs=1, equipment=None):
        if type(chefs) is not int or not 1 <= chefs <= MAX_CHEFS:
            raise ValueError(f"Chefs must be an integer from 1 to {MAX_CHEFS}.")
        self.equipment = {"burner": 1, "pot": 1, "pan": 1} if equipment is None else dict(equipment)
        if set(self.equipment) != {"burner", "pot", "pan"} or any(
                type(count) is not int or not 1 <= count <= 6 for count in self.equipment.values()):
            raise ValueError("Equipment must specify burner, pot and pan counts from 1 to 6.")
        self.chefs = chefs
        self.reset()
        # Optional simulation-only uncertainty; planned recipe data stays intact.
        self.duration_sampler = duration_sampler

    def reset(self) -> None:
        extra = [f"chef_{number}" for number in range(2, self.chefs + 1)]
        equipment = [kind if number == 1 else f"{kind}_{number}"
                     for kind, count in self.equipment.items() for number in range(1, count + 1)]
        self.state = KitchenState(resources=dict.fromkeys(("chef", *extra, *equipment)))

    def _record(self, result: dict) -> dict:
        self.state.events.append(dict(deepcopy(result), sequence=len(self.state.events) + 1))
        self.state.last_action_result = deepcopy(result)
        return result

    def add_order(self, menu: str, time_limit: int = DEFAULT_TIME_LIMIT) -> Order:
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
        task, held = _validate_task(self.state, order_id, task_id)
        duration = task["duration"] if self.duration_sampler is None else self.duration_sampler(
            deepcopy(self.state.orders[order_id]), deepcopy(task))
        if type(duration) is not int or duration <= 0:
            raise ValueError("Sampled duration must be a positive integer.")
        chef = free_chef(self.state) if "chef" in task["resources"] else None
        running = RunningTask(order_id, task_id, self.state.time + duration,
                              _assign_resources(self.state, task, held))
        # A held resource this step does not use (the burner once draining starts) is now free.
        for resource in held:
            self.state.resources[resource] = None
        for resource in running.resources:
            self.state.resources[resource] = (order_id, task_id)
        self.state.running_tasks.append(running)
        self.state.orders[order_id].status = "cooking"
        result = dict(ok=True, action="task_started", time=self.state.time,
                      order_id=order_id, task_id=task_id, finishes_at=running.finishes_at)
        if any(count > 1 for count in self.equipment.values()):
            result["resources"] = list(running.resources)
        if chef is not None and self.chefs > 1:
            result["chef"] = chef
        return self._record(result)

    def advance_to_next_event(self, *, until: int | None = None) -> dict:
        """Optionally stop at an external arrival or episode time boundary."""
        if until is not None and (type(until) is not int or until < self.state.time):
            raise ValueError("until must be an integer at or after current time.")
        next_time = min((t.finishes_at for t in self.state.running_tasks), default=None)
        if until is not None and (next_time is None or until < next_time):
            if until == self.state.time:
                return dict(ok=True, action="no_op", time=self.state.time, completed=[])
            self.state.time = until
            return self._record(dict(ok=True, action="time_advanced", time=until))
        if not self.state.running_tasks:
            return dict(ok=True, action="no_op", time=self.state.time, completed=[])
        self.state.time = min(t.finishes_at for t in self.state.running_tasks)
        finished = [t for t in self.state.running_tasks if t.finishes_at == self.state.time]
        for task in finished:
            order = self.state.orders[task.order_id]
            order.completed_tasks.append(task.task_id)
            hold = get_task(load_recipe(order.menu), task.task_id).get("holds")
            kept = hold["resources"] if hold else ()
            for resource in task.resources:
                if self.state.resources[resource] == (task.order_id, task.task_id) and resource_kind(resource) not in kept:
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
        if not is_complete(order, recipe):
            raise ValueError("Order is incomplete.")
        if any(t.order_id == order_id for t in self.state.running_tasks):
            raise ValueError("Order still has running tasks.")
        order.status = "served"
        order.served_at = self.state.time
        order.on_time = self.state.time <= order.deadline
        return self._record(dict(ok=True, action="order_served", time=self.state.time,
                                 order_id=order_id, on_time=order.on_time))

    def hold_chef(self, chef: str | None = None) -> dict:
        """Reserve a free chef for a customer. Background cooking and deadlines keep running."""
        chef = free_chef(self.state) if chef is None else chef
        if chef not in chef_names(self.state) or self.state.resources[chef] is not None:
            raise ValueError("Resource unavailable: chef")
        self.state.resources[chef] = CUSTOMER_CHAT
        return self._record(dict(ok=True, action="chef_held", time=self.state.time, chef=chef))

    def release_chef(self) -> dict:
        chef = next((name for name in chef_names(self.state)
                     if self.state.resources[name] == CUSTOMER_CHAT), None)
        if chef is None:
            raise ValueError("Chef is not held for a customer.")
        self.state.resources[chef] = None
        return self._record(dict(ok=True, action="chef_released", time=self.state.time, chef=chef))
