from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from pasta_chef.api.errors import error_responses
from pasta_chef.api.schemas import RunCreated, StateResponse
from pasta_chef.api.store import Run, get_run
from pasta_chef.simulation.observation import build_observation

router = APIRouter()


@router.post("/runs", status_code=status.HTTP_201_CREATED, response_model=RunCreated)
def create_run(request: Request) -> dict:
    """Create an independent, empty kitchen. Runs are lost when the server restarts."""
    return {"run_id": request.app.state.runs.create()}


@router.get("/runs/{run_id}/state", response_model=StateResponse,
            responses=error_responses(404, 422))
def get_state(run: Annotated[Run, Depends(get_run)]) -> dict:
    """Return the current simulator observation for this run."""
    with run.lock:
        return build_observation(run.kitchen.state)
