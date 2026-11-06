"""Per-episode adapters: rules remain in simulation/kitchen.py."""
from pasta_chef.runtime.progress import EpisodeProgress
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
        self.input_tokens = 0
        self.output_tokens = 0
        self.rejected_tool_calls = 0
        self.provider_retries = 0
        self.decision_log = []
        self.progress = EpisodeProgress(settings.timeout_seconds)

    def before_model(self):
        if self.model_calls >= self.settings.max_model_calls:
            raise EpisodeLimit("Model call limit reached.", "model_call_limit")
        self.model_calls += 1
        self.progress.request_sent(self.model_calls, self.kitchen.state.time)

    def log_model_response(self, response):
        usage = response.usage_metadata
        input_tokens = usage.prompt_token_count if usage else None
        output_tokens = usage.candidates_token_count if usage else None
        self.input_tokens += input_tokens or 0
        self.output_tokens += output_tokens or 0
        parts = response.content.parts if response.content and response.content.parts else []
        calls = [{"tool": p.function_call.name, "args": dict(p.function_call.args or {})}
                 for p in parts if p.function_call]
        text = " ".join(p.text for p in parts if p.text)[:200] or None
        self.decision_log.append({
            "type": "model_call", "model_call": self.model_calls, "time": self.kitchen.state.time,
            "input_tokens": input_tokens, "output_tokens": output_tokens,
            "calls": calls, "text": text,
        })
        self.progress.response_received(input_tokens, output_tokens, calls, text)

    def log_tool_call(self, tool, args, response, source="chef"):
        ok = response.get("ok", True)
        self.rejected_tool_calls += not ok
        error = response.get("error")
        self.decision_log.append({
            "type": "tool_call", "source": source, "model_call": self.model_calls,
            "time": self.kitchen.state.time, "tool": tool, "args": dict(args), "ok": ok,
            "error": error["message"] if isinstance(error, dict) else None,
        })
        entry = self.decision_log[-1]
        self.progress.tool_finished(source, tool, entry["args"], ok, entry["error"], entry["time"])

    def log_retry(self, status_code, delay, details=None):
        """Allowlisted details only: provider error text can contain request details."""
        self.provider_retries += 1
        self.decision_log.append({
            "type": "provider_retry", "model_call": self.model_calls,
            "status_code": status_code, "delay_seconds": delay, "details": details or {},
        })
        self.progress.backoff_started(status_code, delay, self.provider_retries, details or {})

    def log_provider_failure(self, status_code, retries, details):
        self.decision_log.append({
            "type": "provider_failure", "model_call": self.model_calls,
            "status_code": status_code, "retries": retries, "details": details,
        })
        self.progress.provider_failed(status_code, retries, details)

    def usage(self) -> dict:
        return {
            "input_tokens": self.input_tokens, "output_tokens": self.output_tokens,
            "rejected_tool_calls": self.rejected_tool_calls,
            "provider_retries": self.provider_retries,
        }

    def _call(self, operation, *args):
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
