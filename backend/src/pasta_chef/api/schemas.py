"""HTTP request and response formats. Simulator rules stay in simulation/."""
from typing import Annotated, Any

from pydantic import BaseModel, Field, StrictInt, StrictStr


# Largest integer JavaScript clients can represent exactly. A transport limit, not a cooking rule.
MAX_JSON_SAFE_INT = 2**53 - 1


class ErrorResponse(BaseModel):
    detail: str


class RunCreated(BaseModel):
    run_id: str


class OrderCreate(BaseModel):
    menu: StrictStr
    time_limit: Annotated[StrictInt, Field(
        gt=0, le=MAX_JSON_SAFE_INT, description="Simulated seconds until the deadline.")]


class OrderResponse(BaseModel):
    id: str
    menu: str
    created_at: int
    deadline: int
    status: str
    completed_tasks: list[str]
    served_at: int | None
    on_time: bool | None


class RunningTaskResponse(BaseModel):
    order_id: str
    task_id: str
    finishes_at: int
    resources: list[str]
    remaining_time: int


class StateResponse(BaseModel):
    """The dict returned by build_observation(). Served orders are not listed in orders."""
    time: int
    orders: list[OrderResponse]
    resources: dict[str, list[str] | None]
    chef_available: bool
    running_tasks: list[RunningTaskResponse]
    completed_tasks: dict[str, list[str]]
    available_tasks: dict[str, list[str]]
    recent_events: list[dict[str, Any]]
    last_action_result: dict[str, Any] | None
