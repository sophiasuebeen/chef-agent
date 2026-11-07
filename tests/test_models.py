"""Offline configuration and retry checks for the customer-facing models."""
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_response import LlmResponse
from google.genai import types
from pasta_chef.config import Settings

class ConfigurationTests(unittest.TestCase):
    def test_root_env_loaded_and_gemini_api_selected_before_adk(self):
        try:
            import dotenv
        except ImportError:
            self.skipTest("optional dotenv dependency is not installed")
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env").write_text(
                "GOOGLE_API_KEY=offline-test-value\nCHEF_MODEL=gemini-test\n"
            )
            module_path = root / "backend" / "src" / "pasta_chef" / "config.py"
            with patch("pasta_chef.config.__file__", str(module_path)), patch.dict(
                os.environ, {"GOOGLE_GENAI_USE_VERTEXAI": "true"}, clear=True
            ):
                settings = Settings.from_env()
                self.assertEqual(settings.model, "gemini-test")
                self.assertEqual(os.environ["GOOGLE_API_KEY"], "offline-test-value")
                self.assertEqual(os.environ["GOOGLE_GENAI_USE_VERTEXAI"], "false")

    def test_openai_credentials_do_not_require_google_auth(self):
        from pasta_chef.config import ConfigurationError, require_model_credentials
        with patch.dict(os.environ, {"OPENAI_API_KEY": "offline-test-value"}, clear=True):
            require_model_credentials("openai/gpt-4o")
            require_model_credentials("gpt-4o")
        with patch.dict(os.environ, {}, clear=True), self.assertRaises(ConfigurationError):
            require_model_credentials("openai/gpt-4o")

class ProviderError(Exception):
    def __init__(self, status_code, message="", headers=None):
        super().__init__(message)
        self.status_code = status_code
        self.response = type("Response", (), {"headers": headers or {}})()

class FlakyModel(BaseLlm):
    """Raises the queued errors in order, then returns a text response."""
    errors: list = []
    attempts: int = 0

    async def generate_content_async(self, llm_request, stream=False):
        self.attempts += 1
        if self.errors:
            raise self.errors.pop(0)
        yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text="ok")]))

class FailsAfterResponseModel(BaseLlm):
    attempts: int = 0

    async def generate_content_async(self, llm_request, stream=False):
        self.attempts += 1
        yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text="partial")]))
        raise ProviderError(429)

class ProviderRetryTests(unittest.IsolatedAsyncioTestCase):
    async def collect(self, inner, **fields):
        from pasta_chef.agents.retrying_llm import RetryingLlm
        model = RetryingLlm(model="mock", inner=inner, **fields)
        with patch("pasta_chef.agents.retrying_llm.sleep") as sleep:
            sleep.return_value = None
            responses = [r async for r in model.generate_content_async(None)]
        return responses, [call.args[0] for call in sleep.call_args_list]

    async def test_rate_limit_backs_off_exponentially_then_succeeds(self):
        inner = FlakyModel(model="mock", errors=[ProviderError(429), ProviderError(503)])
        responses, sleeps = await self.collect(inner)
        self.assertEqual(len(responses), 1)
        self.assertEqual(inner.attempts, 3)
        self.assertEqual(sleeps, [2.0, 4.0])

    async def test_retry_after_header_wins_but_is_capped(self):
        inner = FlakyModel(model="mock", errors=[
            ProviderError(429, headers={"retry-after": "7"}),
            ProviderError(429, headers={"retry-after": "9999"}),
            ProviderError(429, headers={"retry-after": "soon"}),
        ])
        _, sleeps = await self.collect(inner)
        self.assertEqual(sleeps, [7.0, 60.0, 8.0])

    async def test_retries_are_bounded_and_the_error_surfaces(self):
        inner = FlakyModel(model="mock", errors=[ProviderError(429) for _ in range(9)])
        with self.assertRaises(ProviderError):
            await self.collect(inner, max_retries=2)
        self.assertEqual(inner.attempts, 3)

    async def test_permanent_failures_are_not_retried(self):
        for error in (ProviderError(401), ProviderError(400), ConnectionError("no status"),
                      ProviderError(429, "You exceeded your quota: insufficient_quota"),
                      ProviderError(429, "You exceeded your current quota, check billing")):
            with self.subTest(error=error):
                inner = FlakyModel(model="mock", errors=[error])
                with self.assertRaises(type(error)):
                    await self.collect(inner)
                self.assertEqual(inner.attempts, 1)


    async def test_failure_after_a_response_is_not_replayed(self):
        inner = FailsAfterResponseModel(model="mock")
        with self.assertRaises(ProviderError):
            await self.collect(inner)
        self.assertEqual(inner.attempts, 1)

class ModelAdapterTests(unittest.TestCase):
    def test_gemini_client_keeps_the_requested_model_and_retry_limit(self):
        from pasta_chef.agents.models import resolve_model
        inner = FlakyModel(model="gemini-test")
        with patch("google.adk.models.google_llm.Gemini", return_value=inner) as client:
            wrapped = resolve_model("gemini-test", max_retries=1)
        client.assert_called_once_with(model="gemini-test")
        self.assertIs(wrapped.inner, inner)
        self.assertEqual(wrapped.max_retries, 1)

    def test_openai_client_disables_parallel_calls_only_when_tools_are_used(self):
        from pasta_chef.agents.models import resolve_model
        # Avoid remote LiteLLM metadata loading while importing its adapter.
        with patch.dict(os.environ, {"LITELLM_LOCAL_MODEL_COST_MAP": "True"}):
            for name, uses_tools in (("gpt-4o", True), ("openai/gpt-4o", False)):
                with self.subTest(model=name, tools=uses_tools):
                    inner = FlakyModel(model="offline")
                    with patch("google.adk.models.lite_llm.LiteLlm", return_value=inner) as client:
                        wrapped = resolve_model(name, uses_tools=uses_tools, max_retries=2)
                    options = {"parallel_tool_calls": False} if uses_tools else {}
                    client.assert_called_once_with(model="openai/gpt-4o", num_retries=0, **options)
                    self.assertIs(wrapped.inner, inner)
                    self.assertEqual(wrapped.max_retries, 2)

    def test_injected_model_is_not_replaced(self):
        from pasta_chef.agents.models import resolve_model
        inner = FlakyModel(model="offline")
        self.assertIs(resolve_model(inner), inner)
