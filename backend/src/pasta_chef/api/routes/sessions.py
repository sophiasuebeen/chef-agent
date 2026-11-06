"""Live kitchen routes. All async, so they share one event loop; see runtime/sessions.py."""
from json import JSONDecodeError
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from pasta_chef.api.errors import error_responses, safe_text
from pasta_chef.api.schemas import OrderCreate, OrderResponse, RunningTaskResponse
from pasta_chef.runtime.sessions import LiveSession, event_stream

router = APIRouter()


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    speed: Annotated[float, Field(gt=0, le=1000, allow_inf_nan=False,
                                  description="Simulated seconds per real second.")] = 10


class SessionCreated(BaseModel):
    session_id: str
    speed: float


class SessionOrderCreate(OrderCreate):
    model_config = ConfigDict(extra="forbid")
    quantity: Annotated[StrictInt, Field(ge=1, le=20)] = 1


class SessionOrdersCreated(BaseModel):
    time: int
    orders: list[OrderResponse]


class SessionState(BaseModel):
    time: int
    idle: bool
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
    return dict(session_id=request.app.state.sessions.create(body.speed), speed=body.speed)


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
