from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status

from pasta_chef.api.errors import error_responses
from pasta_chef.api.schemas import ExecuteRequest, ReplayResponse, RunCreated, StateResponse
from pasta_chef.api.events import execute
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


@router.post("/runs/{run_id}/execute", response_model=ReplayResponse,
             responses=error_responses(404, 409, 422))
def execute_run(run_id: str, run: Annotated[Run, Depends(get_run)],
                body: Annotated[ExecuteRequest, Body()] = ExecuteRequest()) -> ReplayResponse:
    """Execute once, synchronously. The response is also available from /replay."""
    if not run.lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Run is busy.")
    try:
        if run.replay is not None:
            raise HTTPException(status_code=409, detail="Run already executed; create a new run to compare policies.")
        if not run.kitchen.state.orders:
            raise HTTPException(status_code=409, detail="Accept an order before execution.")
        run.replay = execute(run.kitchen, run_id, run.initial_conditions, body)
        return run.replay
    finally:
        run.lock.release()


@router.get("/runs/{run_id}/replay", response_model=ReplayResponse,
            responses=error_responses(404, 409, 422))
def get_replay(run: Annotated[Run, Depends(get_run)]) -> ReplayResponse:
    """Read the complete, frozen replay, including served and unfinished orders."""
    with run.lock:
        if run.replay is None:
            raise HTTPException(status_code=409, detail="Run has not executed yet.")
        return run.replay
