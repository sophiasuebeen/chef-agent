"""Bounded retries for the customer-facing model clients."""
from asyncio import sleep
import re
from typing import Optional

from google.adk.models.base_llm import BaseLlm

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
GOOGLE_RETRY_DELAY = re.compile(r"retryDelay['\"]?\s*:\s*['\"]?(\d+(?:\.\d+)?)s")


def status_code_of(error: Exception):
    """LiteLLM errors use status_code; google.genai errors use code."""
    return getattr(error, "status_code", None) or getattr(error, "code", None)


def is_retryable(error: Exception) -> bool:
    """Rate limits and transient outages; an exhausted quota also arrives as 429."""
    if status_code_of(error) not in RETRYABLE_STATUS_CODES:
        return False
    # Waiting cannot fix an account with no credit or a used-up daily quota. Google
    # uses the same "exceeded your current quota" wording for per-minute limits, but
    # says when to retry. Other 429s retry: bounded wait versus a lost reply.
    message = str(error).lower()
    if "insufficient_quota" in message or ("perday" in message and "perminute" not in message):
        return False
    if "exceeded your current quota" in message:
        return retry_after_seconds(error) is not None
    return True


def _headers(error: Exception):
    return (getattr(getattr(error, "response", None), "headers", None)
            or getattr(error, "litellm_response_headers", None) or {})


def retry_after_seconds(error: Exception) -> Optional[float]:
    headers = _headers(error)
    try:
        return max(0.0, float(headers.get("retry-after")))
    except (TypeError, ValueError):
        pass
    google_delay = GOOGLE_RETRY_DELAY.search(str(error))
    return float(google_delay.group(1)) if google_delay else None


class RetryingLlm(BaseLlm):
    """Retry transient failures only before any response has been yielded."""
    inner: BaseLlm
    max_retries: int = 5
    base_delay: float = 2.0
    max_delay: float = 60.0

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
                    raise
                delay = retry_after_seconds(error)
                if delay is None:
                    delay = self.base_delay * 2 ** attempt
                delay = min(delay, self.max_delay)
            attempt += 1
            await sleep(delay)
