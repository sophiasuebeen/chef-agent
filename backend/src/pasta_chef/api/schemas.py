"""HTTP request and response formats. Simulator rules stay in simulation/."""
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr

from pasta_chef.simulation.kitchen import MAX_CHEFS


# Largest integer JavaScript clients can represent exactly. A transport limit, not a cooking rule.
MAX_JSON_SAFE_INT = 2**53 - 1


class ErrorResponse(BaseModel):
    detail: str


# Shared by run and session creation. The simulator validates the same range.
ChefCount = Annotated[StrictInt, Field(ge=1, le=MAX_CHEFS, description="Number of chefs in the kitchen.")]


class RunCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    chefs: ChefCount = 1


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


class ExecuteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    policy: Literal["scripted", "priority"] = "scripted"
    max_actions: Annotated[StrictInt, Field(gt=0, le=10000)] = 1000
    max_simulated_time: Annotated[StrictInt, Field(gt=0, le=86400)] = 1800


class ReplayState(BaseModel):
    """Full state for replay; unlike observations, orders includes served orders."""
    time: int
    orders: list[OrderResponse]
    resources: dict[str, list[str] | None]
    running_tasks: list[RunningTaskResponse]


class ReplayEvent(BaseModel):
    model_config = ConfigDict(extra="allow")
    sequence: int
    time: int
    action: Literal["order_accepted", "task_started", "tasks_completed", "time_advanced", "order_served",
                    "chef_held", "chef_released"]
    ok: bool


class SchedulingPolicy(BaseModel):
    name: Literal["scripted", "priority"]
    version: str
    rule: dict[str, str] | None = None
    model: str | None = None


class FinalOrder(OrderResponse):
    # For unserved orders this is overdue time at the stop, not eventual service lateness.
    lateness: int


class ExecutionResult(BaseModel):
    status: Literal["completed", "stopped", "failed"]
    completed: bool
    termination_reason: str
    finished_at: int
    total_lateness: int
    max_lateness: int
    unserved_order_ids: list[str]
    model_calls: int
    tool_calls: int
    error: str | None = None


class ReplayResponse(BaseModel):
    schema_version: Literal["1.0"]
    run_id: str
    initial_conditions: ReplayState
    recipes: dict[str, dict[str, Any]]
    scheduling_policy: SchedulingPolicy
    limits: dict[str, int]
    events: list[ReplayEvent]
    final_state: ReplayState
    final_orders: list[FinalOrder]
    result: ExecutionResult
