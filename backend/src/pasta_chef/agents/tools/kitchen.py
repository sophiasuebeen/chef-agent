"""Per-episode adapters: rules remain in simulation/kitchen.py."""
from time import monotonic

from pasta_chef.simulation.observation import build_observation
from pasta_chef.simulation.recipes import load_recipe


class EpisodeLimit(RuntimeError):
    def __init__(self, message: str, reason: str = "episode_limit"):
        super().__init__(message)
        self.reason = reason


class KitchenTools:
    def __init__(self, kitchen, settings):
        self.kitchen = kitchen
        self.settings = settings
        self.tool_calls = 0
        self.model_calls = 0
        self.deadline = monotonic() + settings.timeout_seconds

    def _check_wall_clock(self):
        if monotonic() >= self.deadline:
            raise EpisodeLimit("Wall-clock time limit reached.", "wall_clock_limit")

    def before_model(self):
        self._check_wall_clock()
        if self.model_calls >= self.settings.max_model_calls:
            raise EpisodeLimit("Model call limit reached.", "model_call_limit")
        self.model_calls += 1

    def _call(self, operation, *args):
        self._check_wall_clock()
        if self.tool_calls >= self.settings.max_tool_calls:
            raise EpisodeLimit("Tool call limit reached.", "tool_call_limit")
        self.tool_calls += 1
        if self.kitchen.state.time > self.settings.max_simulated_time:
            raise EpisodeLimit("Simulated time limit reached.", "simulated_time_limit")
        try:
            result = operation(*args)
        except (KeyError, ValueError) as error:
            result = {"ok": False, "error": {
                "type": type(error).__name__, "message": str(error)}}
        return dict(result, observation=build_observation(self.kitchen.state))

    def get_recipe(self, menu: str) -> dict:
        """Read the recipe definition for a supported menu, such as lemon_pasta."""
        return self._call(lambda: {"ok": True, "recipe": load_recipe(menu)})

    def get_kitchen_state(self) -> dict:
        """Observe time, orders, resource ownership, and available cooking tasks."""
        return self._call(lambda: {"ok": True})

    def start_task(self, order_id: str, task_id: str) -> dict:
        """Start an available recipe task without advancing simulated time."""
        return self._call(self.kitchen.start_task, order_id, task_id)

    def advance_to_next_event(self) -> dict:
        """Advance simulated time and complete all tasks at the next event."""
        def advance():
            running = self.kitchen.state.running_tasks
            if running and min(t.finishes_at for t in running) > self.settings.max_simulated_time:
                raise EpisodeLimit("Next event exceeds simulated time limit.", "simulated_time_limit")
            return self.kitchen.advance_to_next_event()
        return self._call(advance)

    def serve_order(self, order_id: str) -> dict:
        """Serve a completed order and record whether its deadline was met."""
        return self._call(self.kitchen.serve_order, order_id)

    def functions(self):
        return [self.get_recipe, self.get_kitchen_state, self.start_task,
                self.advance_to_next_event, self.serve_order]
