"""Offline configuration checks: environment loading and credential selection."""
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from pasta_chef.config import Settings


class ConfigurationTests(unittest.TestCase):
    def test_root_env_loaded_and_gemini_api_selected_for_genai(self):
        try:
            import dotenv  # noqa: F401
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


if __name__ == "__main__":
    unittest.main()
