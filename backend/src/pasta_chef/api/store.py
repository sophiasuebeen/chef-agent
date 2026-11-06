"""In-memory, development-only run registry. Restarting the server clears every run."""
from dataclasses import dataclass, field
from threading import Lock
from uuid import uuid4

from fastapi import HTTPException, Request

from pasta_chef.simulation.kitchen import Kitchen
from pasta_chef.api.schemas import ReplayResponse
from pasta_chef.api.events import replay_state


@dataclass
class Run:
    kitchen: Kitchen = field(default_factory=Kitchen)
    # Sync routes run in a thread pool: hold this for every read or write of kitchen.
    lock: Lock = field(default_factory=Lock)
    replay: ReplayResponse | None = None
    initial_conditions: dict = field(init=False)

    def __post_init__(self):
        self.initial_conditions = replay_state(self.kitchen.state)


class RunStore:
    def __init__(self) -> None:
        self._runs: dict[str, Run] = {}

    def create(self, chefs: int = 1) -> str:
        run_id = uuid4().hex
        self._runs[run_id] = Run(kitchen=Kitchen(chefs=chefs))
        return run_id

    def get(self, run_id: str) -> Run:
        return self._runs[run_id]


def get_run(run_id: str, request: Request) -> Run:
    """Route dependency that resolves a path's run_id or returns 404."""
    try:
        return request.app.state.runs.get(run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown run: {run_id}") from None
