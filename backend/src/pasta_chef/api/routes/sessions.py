"""Live kitchen routes. All async, so they share one event loop; see runtime/sessions.py."""
from json import JSONDecodeError
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from pasta_chef.agents.host import MessageLimitReached, available_menus, create_host, fallback_reply
from pasta_chef.api.errors import error_responses, safe_text
from pasta_chef.config import ConfigurationError
from pasta_chef.api.schemas import (ChefHoldCreate, ChefHoldState, MessageCreate, MessageProgress, MessageReply,
                                    SeatCreate, SessionCreate, SessionCreated, SessionOrderCreate,
                                    SessionOrdersCreated, SessionState, StaffArrival)
from pasta_chef.runtime.sessions import LiveSession, event_stream

router = APIRouter()


async def get_session(session_id: str, request: Request) -> LiveSession:
    try:
        return request.app.state.sessions.get(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown session: {session_id}") from None


Session = Annotated[LiveSession, Depends(get_session)]


@router.get("/sessions/{session_id}/restaurant", responses=error_responses(404, 422))
async def get_restaurant(session: Session) -> dict:
    """Dining-room assignments, movement tasks and actual table deliveries."""
    return session.restaurant.snapshot()


@router.post("/sessions/{session_id}/restaurant/seat", responses=error_responses(404, 409, 422))
async def seat_customer(body: SeatCreate, session: Session) -> dict:
    if session.host_busy:
        raise HTTPException(status_code=409, detail="Please wait until the staff finishes answering.")
    try:
        return session.restaurant.seat(body.seat_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None


@router.delete("/sessions/{session_id}/restaurant/seat", responses=error_responses(404, 409, 422))
async def leave_seat(session: Session) -> dict:
    if session.host_busy:
        raise HTTPException(status_code=409, detail="Please wait until the staff finishes answering.")
    session.restaurant.leave()
    return session.restaurant.snapshot()


@router.post("/sessions/{session_id}/restaurant/arrivals", responses=error_responses(404, 409, 422))
async def staff_arrived(body: StaffArrival, session: Session) -> dict:
    try:
        return session.restaurant.arrive(body.waiter_id, body.task_id, body.language)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from None


@router.post("/sessions", status_code=status.HTTP_201_CREATED, response_model=SessionCreated,
             responses=error_responses(422))
async def create_session(request: Request,
                         body: Annotated[SessionCreate, Body()] = SessionCreate()) -> dict:
    """Start a kitchen whose clock runs from now."""
    session_id = request.app.state.sessions.create(body.speed, body.chefs, body.equipment)
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
    session.restaurant.remember_orders(session.restaurant.active_table, [order.id for order in accepted])
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


@router.get("/sessions/{session_id}/messages/progress", response_model=MessageProgress,
            responses=error_responses(404, 422))
async def message_progress(session: Session) -> dict:
    """Actual kitchen consultation progress, readable while a reply is running."""
    return dict(busy=session.host_busy, progress=getattr(session.host, "progress", None))


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
                return dict(reply=fallback_reply([], body.language), actions=[], failed=True)
        if body.language is not None:
            return await session.host.reply(body.text, language=body.language)
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
