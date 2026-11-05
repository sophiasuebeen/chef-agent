from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Order:
    id: str
    menu: str
    created_at: int
    deadline: int
    status: str = "pending"
    completed_tasks: list[str] = field(default_factory=list)
    served_at: int | None = None
    on_time: bool | None = None


@dataclass
class RunningTask:
    order_id: str
    task_id: str
    finishes_at: int
    resources: list[str]


@dataclass
class KitchenState:
    time: int = 0
    orders: dict[str, Order] = field(default_factory=dict)
    next_order_number: int = 1
    running_tasks: list[RunningTask] = field(default_factory=list)
    resources: dict[str, tuple[str, str] | None] = field(
        default_factory=lambda: dict.fromkeys(("chef", "burner", "pot", "pan"))
    )
    events: list[dict] = field(default_factory=list)
    last_action_result: dict | None = None
