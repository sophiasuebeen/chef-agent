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

    def test_staff_model_name_keeps_openai_names_and_falls_back_otherwise(self):
        from pasta_chef.agents.team import STAFF_FALLBACK_MODEL, staff_model_name
        self.assertEqual(STAFF_FALLBACK_MODEL, "gpt-4o")
        self.assertEqual(staff_model_name("openai/gpt-4o-mini"), "gpt-4o-mini")
        self.assertEqual(staff_model_name("gpt-4.1"), "gpt-4.1")
        self.assertEqual(staff_model_name("o3-mini"), "o3-mini")
        self.assertEqual(staff_model_name(Settings().model), "gpt-4o")
        self.assertEqual(staff_model_name("openai/gemini-2.5-flash"), "gpt-4o")

    def test_create_team_model_precedence_is_unchanged(self):
        from pasta_chef.agents import team
        cases = [({"RESTAURANT_MODEL": "gpt-4.1", "CHEF_HOST_MODEL": "gpt-4o-mini", "CHEF_MODEL": "o3"}, "gpt-4.1"),
                 ({"CHEF_HOST_MODEL": "openai/gpt-4o-mini", "CHEF_MODEL": "o3"}, "gpt-4o-mini"),
                 ({"CHEF_MODEL": "o3"}, "o3"),
                 ({}, "gpt-4o")]
        for env, expected in cases:
            with self.subTest(env=env), patch.dict(os.environ, {**env, "OPENAI_API_KEY": "x"}, clear=True), \
                    patch("pasta_chef.config.Settings.from_env",
                          lambda: Settings(model=os.getenv("CHEF_MODEL", "gemini-2.5-flash"))), \
                    patch.object(team, "RestaurantTeam", lambda session, model: model):
                self.assertEqual(team.create_team(None), expected)


if __name__ == "__main__":
    unittest.main()
