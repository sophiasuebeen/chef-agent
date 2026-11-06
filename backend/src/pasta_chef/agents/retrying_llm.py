"""Bounded provider retries. Separate from chef.py because it needs ADK at import
time, while evaluation imports chef.py without the SDK installed."""
from asyncio import sleep
import re
from typing import Callable, Optional

from google.adk.models.base_llm import BaseLlm

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
LIMIT_KIND = re.compile(r"\((TPM|RPM|TPD|RPD)\)|\b(\w*Per(?:Minute|Day)\w*)")
GOOGLE_RETRY_DELAY = re.compile(r"retryDelay['\"]?\s*:\s*['\"]?(\d+(?:\.\d+)?)s")
SAFE_HEADERS = ("retry-after", "x-ratelimit-limit-requests", "x-ratelimit-remaining-requests",
                "x-ratelimit-reset-requests", "x-ratelimit-limit-tokens",
                "x-ratelimit-remaining-tokens", "x-ratelimit-reset-tokens")


def status_code_of(error: Exception):
    """LiteLLM errors use status_code; google.genai errors use code."""
    return getattr(error, "status_code", None) or getattr(error, "code", None)


def is_retryable(error: Exception) -> bool:
    """Rate limits and transient outages; an exhausted quota also arrives as 429."""
    if status_code_of(error) not in RETRYABLE_STATUS_CODES:
        return False
    # Waiting cannot fix an account with no credit or a used-up daily quota. Google
    # uses the same "exceeded your current quota" wording for per-minute limits, but
    # says when to retry. Other 429s retry: bounded wait versus a lost episode.
    message = str(error).lower()
    if "insufficient_quota" in message or ("perday" in message and "perminute" not in message):
        return False
    if "exceeded your current quota" in message:
        return retry_after_seconds(error) is not None
    return True


def _headers(error: Exception):
    return (getattr(getattr(error, "response", None), "headers", None)
            or getattr(error, "litellm_response_headers", None) or {})


def retry_details(error: Exception) -> dict:
    """Allowlisted diagnostics only; the provider's message can hold account details."""
    headers = _headers(error)
    details = {name.removeprefix("x-ratelimit-"): headers.get(name)
               for name in SAFE_HEADERS if headers.get(name) is not None}
    kind = LIMIT_KIND.search(str(error))
    return {"limit": (kind.group(1) or kind.group(2)) if kind else "unknown", **details}


def retry_after_seconds(error: Exception) -> Optional[float]:
    headers = _headers(error)
    try:
        return max(0.0, float(headers.get("retry-after")))
    except (TypeError, ValueError):
        pass
    google_delay = GOOGLE_RETRY_DELAY.search(str(error))
    return float(google_delay.group(1)) if google_delay else None


class RetryingLlm(BaseLlm):
    """Retries a failed request before any response was received, then re-raises.

    A retried request is one model decision, so it does not consume the episode's
    model-call budget. Waiting counts against the wall-clock limit.
    """
    inner: BaseLlm
    max_retries: int = 5
    base_delay: float = 2.0
    max_delay: float = 60.0
    on_retry: Optional[Callable[[int, float, dict], None]] = None
    on_resend: Optional[Callable[[], None]] = None
    on_give_up: Optional[Callable[[object, int, dict], None]] = None

    async def generate_content_async(self, llm_request, stream=False):
        attempt = 0
        while True:
            received = False
            try:
                async for response in self.inner.generate_content_async(llm_request, stream):
                    received = True
                    yield response
                return
            except Exception as error:
                if received or attempt >= self.max_retries or not is_retryable(error):
                    if self.on_give_up:
                        self.on_give_up(status_code_of(error), attempt, retry_details(error))
                    raise
                delay = retry_after_seconds(error)
                if delay is None:
                    delay = self.base_delay * 2 ** attempt
                delay = min(delay, self.max_delay)
                status_code, details = status_code_of(error), retry_details(error)
            attempt += 1
            if self.on_retry:
                self.on_retry(status_code, delay, details)
            await sleep(delay)
            if self.on_resend:
                self.on_resend()
