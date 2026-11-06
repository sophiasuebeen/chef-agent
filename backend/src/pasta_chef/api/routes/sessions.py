"""Live kitchen routes. All async, so they share one event loop; see runtime/sessions.py."""
from json import JSONDecodeError
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, field_validator

from pasta_chef.agents.host import FALLBACK_REPLY, MessageLimitReached, available_menus, create_host
from pasta_chef.api.errors import error_responses, safe_text
from pasta_chef.config import ConfigurationError
from pasta_chef.api.schemas import ChefCount, OrderCreate, OrderResponse, RunningTaskResponse
from pasta_chef.runtime.sessions import LiveSession, event_stream

router = APIRouter()


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    speed: Annotated[float, Field(gt=0, le=1000, allow_inf_nan=False,
                                  description="Simulated seconds per real second.")] = 10
    chefs: ChefCount = 1


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

    @field_validator("text")
    @classmethod
    def not_blank(cls, text):
        if not text.strip():
            raise ValueError("Message must not be blank.")
        return text


class HostAction(BaseModel):
    """What actually happened, reported by code rather than by the model."""
    type: Literal["order_accepted", "order_rejected", "small_talk"]
    menu: str | None = None
    quantity: int | None = None
    decision: Literal["chat", "hand_off", "end"] | None = None
    chef: str | None = None
    order_ids: list[str] = []
    ready_in_seconds: int | None = None
    reason: str | None = None


class MessageReply(BaseModel):
    reply: str
    actions: list[HostAction]
    failed: bool
    speaker: str = "chef"


class SessionOrderCreate(OrderCreate):
    model_config = ConfigDict(extra="forbid")
    quantity: Annotated[StrictInt, Field(ge=1, le=20)] = 1


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


async def get_session(session_id: str, request: Request) -> LiveSession:
    try:
        return request.app.state.sessions.get(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown session: {session_id}") from None


Session = Annotated[LiveSession, Depends(get_session)]


@router.post("/sessions", status_code=status.HTTP_201_CREATED, response_model=SessionCreated,
             responses=error_responses(422))
async def create_session(request: Request,
                         body: Annotated[SessionCreate, Body()] = SessionCreate()) -> dict:
    """Start a kitchen whose clock runs from now."""
    session_id = request.app.state.sessions.create(body.speed, body.chefs)
    resources = request.app.state.sessions.get(session_id).snapshot()["resources"]
    return dict(session_id=session_id, speed=body.speed, recipes=available_menus(),
                initial_state=dict(time=0, orders=[], resources=resources, running_tasks=[]))


@router.post("/sessions/{session_id}/orders", status_code=status.HTTP_201_CREATED,
             response_model=SessionOrdersCreated, responses=error_responses(400, 404, 422))
async def create_orders(body: SessionOrderCreate, session: Session) -> dict:
    """Accept plates now, including while cooking. Cooking schedules itself."""
    try:
        accepted = session.add_orders([(body.menu, body.time_limit)] * body.quantity)
    except (JSONDecodeError, UnicodeDecodeError):
        raise  # An unreadable recipe file is a server fault, despite subclassing ValueError.
    except ValueError as error:
        raise HTTPException(status_code=422, detail=safe_text(str(error))) from error
    state = session.snapshot()
    ids = {order.id for order in accepted}
    return dict(time=state["time"], orders=[o for o in state["orders"] if o["id"] in ids])


@router.post("/sessions/{session_id}/chef-hold", response_model=ChefHoldState,
             responses=error_responses(400, 404, 422))
async def hold_chef(body: ChefHoldCreate, session: Session) -> dict:
    """Reserve the chef for a customer, starting when the chef is next free."""
    return session.hold_chef(body.seconds)


@router.delete("/sessions/{session_id}/chef-hold", response_model=ChefHoldState,
               responses=error_responses(404, 422))
async def release_chef(session: Session) -> dict:
    """Send the chef back to cooking now."""
    return session.release_chef()


@router.post("/sessions/{session_id}/messages", response_model=MessageReply,
             responses=error_responses(400, 404, 409, 422, 429))
async def send_message(body: MessageCreate, session: Session, request: Request) -> dict:
    """Talk with the host, which can place orders. Calls the configured LLM provider."""
    if session.host_busy:
        raise HTTPException(status_code=409, detail="The host is still answering.")
    session.host_busy = True
    try:
        if session.host is None:
            factory = getattr(request.app.state, "host_factory", create_host)
            try:
                session.host = factory(session)
            except ConfigurationError:
                return dict(reply=FALLBACK_REPLY, actions=[], failed=True)
        return await session.host.reply(body.text)
    except MessageLimitReached:
        raise HTTPException(status_code=429, detail="Too many messages in this session.") from None
    finally:
        session.host_busy = False


@router.get("/sessions/{session_id}/state", response_model=SessionState, responses=error_responses(404, 422))
async def get_state(session: Session) -> dict:
    """Current kitchen, including served orders."""
    return session.snapshot()


@router.get("/sessions/{session_id}/events", responses=error_responses(404, 422))
async def stream_events(session: Session,
                        after: Annotated[int, Query(ge=0, description="Last sequence already seen.")] = 0,
                        last_event_id: Annotated[int | None, Header(ge=0)] = None) -> StreamingResponse:
    """Server-sent kitchen events. Browsers resume through Last-Event-ID."""
    start = after if last_event_id is None else last_event_id
    return StreamingResponse(event_stream(session, start), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache"})
