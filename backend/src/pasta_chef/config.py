"""Local configuration; importing the simulator never loads credentials or provider SDKs."""
from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    # CHEF_MODEL: shared default for Gemini tooling. The OpenAI staff team prefers
    # RESTAURANT_MODEL / CHEF_HOST_MODEL and replaces non-OpenAI names (see agents.team).
    model: str = "gemini-2.5-flash"

    def __post_init__(self):
        if not self.model.strip():
            raise ValueError("CHEF_MODEL must not be empty.")

    @classmethod
    def from_env(cls):
        from dotenv import load_dotenv
        root = Path(__file__).resolve().parents[3]
        # Shell environment wins, then root .env, then backend/.env.
        load_dotenv(root / ".env", override=False)
        load_dotenv(root / "backend" / ".env", override=False)
        # Optional Gemini rule evolution uses the Gemini Developer API, even if the
        # shell was previously configured for Vertex AI.
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "false"
        return cls(
            model=os.getenv("CHEF_MODEL", "gemini-2.5-flash"),
        )


class ConfigurationError(RuntimeError):
    pass


def require_google_credentials() -> None:
    """Fail before creating a provider client; never print credential values."""
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "false"
    if not (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")):
        raise ConfigurationError(
            "Google credentials unavailable: set GOOGLE_API_KEY or GEMINI_API_KEY in the "
            "shell or project .env for the Gemini API."
        )


def require_model_credentials(model: str) -> None:
    """Select credentials for the configured model without displaying secrets."""
    if model.startswith(("openai/", "gpt-")):
        if not os.getenv("OPENAI_API_KEY"):
            raise ConfigurationError(
                "OpenAI credentials unavailable: set OPENAI_API_KEY in the shell or project .env."
            )
    else:
        require_google_credentials()
