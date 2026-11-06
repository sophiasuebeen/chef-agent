"""Immediate episode progress on stderr, so stdout stays parseable.

Silent unless enable_progress_logs() is called. The heartbeat shows which phase is
waiting: if heartbeats stop, the event loop itself is blocked. Never log provider
error text here; it can contain organization or request details.
"""
import asyncio
import logging
import sys
import time

logger = logging.getLogger("pasta_chef.progress")
HEARTBEAT_SECONDS = 10.0

WAITING_ON = {
    "model_request": "MODEL RESPONSE",
    "retry_backoff": "RETRY BACKOFF",
    "starting": "EPISODE SETUP",
    "working": "LOCAL WORK (tools/ADK)",
}


def enable_progress_logs() -> None:
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)  # Flushes after every record.
        handler.setFormatter(logging.Formatter("%(asctime)s %(message)s", "%H:%M:%S"))
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


class EpisodeProgress:
    def __init__(self, timeout_seconds: float, clock=time.monotonic):
        self.timeout_seconds = timeout_seconds
        self.clock = clock
        self.started_at = clock()
        self.model_call = 0
        self.backoff_seconds = None
        self._enter("starting")

    def _enter(self, phase: str) -> None:
        self.phase = phase
        self.phase_started_at = self.clock()

    def _log(self, message: str) -> None:
        elapsed = self.clock() - self.started_at
        logger.info("[%4.0fs/%.0fs] %s", elapsed, self.timeout_seconds, message)

    def request_sent(self, model_call: int, sim_time: int) -> None:
        self.model_call = model_call
        self._enter("model_request")
        self._log(f"model_call {model_call}: request sent (sim_t={sim_time})")

    def response_received(self, input_tokens, output_tokens, calls, text) -> None:
        waited = self.clock() - self.phase_started_at
        self._enter("working")
        actions = ", ".join(
            f"{c['tool']}({', '.join(str(v) for v in c['args'].values())})" for c in calls
        ) or ("text only, no tool call" if text else "empty response")
        self._log(f"model_call {self.model_call}: response in {waited:.1f}s "
                  f"tokens={input_tokens}/{output_tokens} -> {actions}")

    def tool_finished(self, source, tool, args, ok, error, sim_time) -> None:
        values = ", ".join(str(v) for v in args.values())
        outcome = "ok" if ok else f"REJECTED: {error}"
        self._log(f"{source} {tool}({values}) {outcome} (sim_t={sim_time})")

    def backoff_started(self, status_code, delay, retry_number, details) -> None:
        self.backoff_seconds = delay
        self._enter("retry_backoff")
        info = " ".join(f"{key}={value}" for key, value in details.items())
        self._log(f"model_call {self.model_call}: provider {status_code}, BACKOFF {delay:.0f}s "
                  f"(retry {retry_number}) {info}".rstrip())

    def provider_failed(self, status_code, retries, details) -> None:
        self._enter("working")
        info = " ".join(f"{key}={value}" for key, value in details.items())
        self._log(f"model_call {self.model_call}: provider {status_code}, "
                  f"GAVE UP after {retries} retries {info}".rstrip())

    def request_resent(self) -> None:
        self._enter("model_request")
        self._log(f"model_call {self.model_call}: request resent")

    def heartbeat(self) -> None:
        waited = self.clock() - self.phase_started_at
        over = self.clock() - self.started_at - self.timeout_seconds
        if over > 0:
            self._log(f"OVER TIMEOUT by {over:.0f}s: waiting for cancellation to finish")
        elif self.phase == "retry_backoff":
            self._log(f"alive: in RETRY BACKOFF {waited:.0f}s of {self.backoff_seconds:.0f}s")
        else:
            self._log(f"alive: waiting on {WAITING_ON[self.phase]} for {waited:.0f}s "
                      f"(model_call {self.model_call})")

    async def run_heartbeat(self) -> None:
        while True:
            await asyncio.sleep(HEARTBEAT_SECONDS)
            self.heartbeat()

    def finished(self, reason, error=None) -> None:
        self._log(f"episode stopped: {reason}" + (f" ({error})" if error else ""))
