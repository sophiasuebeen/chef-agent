from dataclasses import asdict
from json import JSONDecodeError
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from pasta_chef.api.errors import error_responses, safe_text
from pasta_chef.api.schemas import OrderCreate, OrderResponse
from pasta_chef.api.store import Run, get_run

router = APIRouter()


@router.post("/runs/{run_id}/orders", status_code=status.HTTP_201_CREATED,
             response_model=OrderResponse, responses=error_responses(400, 404, 422))
def create_order(body: OrderCreate, run: Annotated[Run, Depends(get_run)]) -> dict:
    """Accept an order into this run. This does not start cooking or run an agent."""
    with run.lock:
        try:
            return asdict(run.kitchen.add_order(body.menu, body.time_limit))
        except (JSONDecodeError, UnicodeDecodeError):
            raise  # An unreadable recipe file is a server fault, despite subclassing ValueError.
        except ValueError as error:
            raise HTTPException(status_code=422, detail=safe_text(str(error))) from error


@router.get("/runs/{run_id}/orders/{order_id}", response_model=OrderResponse,
            responses=error_responses(404, 422))
def get_order(order_id: str, run: Annotated[Run, Depends(get_run)]) -> dict:
    """Return one order from this run, including after it has been served."""
    with run.lock:
        try:
            return asdict(run.kitchen.get_order(order_id))
        except KeyError:
            raise HTTPException(status_code=404, detail=f"Unknown order: {order_id}") from None
