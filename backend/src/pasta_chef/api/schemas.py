"""HTTP request and response formats. Simulator rules stay in simulation/."""
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, field_validator

from pasta_chef.simulation.kitchen import MAX_CHEFS, MAX_QUANTITY


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


# Live session models, used by routes/sessions.py.

class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    speed: Annotated[float, Field(gt=0, le=1000, allow_inf_nan=False,
                                  description="Simulated seconds per real second.")] = 10
    chefs: ChefCount = 1
    equipment: Literal["standard", "expanded"] = "standard"


class InitialKitchen(BaseModel):
    """A session's starting point, so clients can rebuild state from its events."""
    time: int
    orders: list[OrderResponse]
    resources: dict[str, list[str] | None]
    running_tasks: list[RunningTaskResponse]


class SessionCreated(BaseModel):
    session_id: str
    speed: float
    initial_state: InitialKitchen
    recipes: dict[str, dict[str, Any]]


class MessageCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: Annotated[StrictStr, Field(min_length=1, max_length=500)]
    language: Literal["ko", "en"] | None = None

    @field_validator("text")
    @classmethod
    def not_blank(cls, text):
        if not text.strip():
            raise ValueError("Message must not be blank.")
        return text


class HostAction(BaseModel):
    """What actually happened, reported by code rather than by the model."""
    type: Literal["order_accepted", "order_rejected", "manager_called", "waiter_reassigned", "kitchen_consulted"]
    table_id: str | None = None
    waiter_id: str | None = None
    menu: str | None = None
    quantity: int | None = None
    order_ids: list[str] = []
    ready_in_seconds: int | None = None
    reason: str | None = None


class StaffProgress(BaseModel):
    turn: int
    phase: Literal["checking", "checked", "unavailable"]
    speaker: str


class MessageProgress(BaseModel):
    busy: bool
    progress: StaffProgress | None = None


class MessageReply(BaseModel):
    reply: str
    actions: list[HostAction]
    failed: bool
    speaker: str = "chef"
    progress: StaffProgress | None = None


class SessionOrderCreate(OrderCreate):
    model_config = ConfigDict(extra="forbid")
    quantity: Annotated[StrictInt, Field(ge=1, le=MAX_QUANTITY)] = 1


class SessionOrdersCreated(BaseModel):
    time: int
    orders: list[OrderResponse]


class ChefHoldCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    seconds: Annotated[StrictInt, Field(gt=0, le=3600, description="Simulated seconds.")]


class ChefHoldState(BaseModel):
    status: Literal["none", "waiting", "active"]
    seconds: int | None
    until: int | None


class SessionState(BaseModel):
    time: int
    idle: bool
    chef_hold: ChefHoldState
    orders: list[OrderResponse]
    resources: dict[str, list[str] | None]
    running_tasks: list[RunningTaskResponse]


class SeatCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    seat_id: Annotated[StrictStr, Field(max_length=40)]


class StaffArrival(BaseModel):
    model_config = ConfigDict(extra="forbid")
    waiter_id: Literal["waiter_a", "waiter_b"]
    task_id: Annotated[StrictInt, Field(gt=0)]
    language: Literal["ko", "en"] = "ko"
