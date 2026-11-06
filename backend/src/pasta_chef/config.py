"""Local configuration; importing the simulator never loads credentials or ADK."""
from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    model: str = "gemini-2.5-flash"
    max_model_calls: int = 40
    max_tool_calls: int = 80
    max_simulated_time: int = 1200
    timeout_seconds: float = 300
    # Let the controller take actions with no real choice instead of asking the model.
    skip_forced_moves: bool = False

    def __post_init__(self):
        if not self.model.strip():
            raise ValueError("CHEF_MODEL must not be empty.")
        for name in ("max_model_calls", "max_tool_calls", "max_simulated_time"):
            value = getattr(self, name)
            if type(value) is not int or value <= 0:
                raise ValueError(f"{name} must be a positive integer.")
        import math
        if not math.isfinite(self.timeout_seconds) or self.timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be finite and positive.")

    @classmethod
    def from_env(cls):
        from dotenv import load_dotenv
        root = Path(__file__).resolve().parents[3]
        # Shell environment wins, then root .env, then backend/.env.
        load_dotenv(root / ".env", override=False)
        load_dotenv(root / "backend" / ".env", override=False)
        # This terminal demo uses the Gemini Developer API, even if the shell
        # was previously configured for Vertex AI. Do this before ADK starts.
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "false"
        return cls(
            model=os.getenv("CHEF_MODEL", "gemini-2.5-flash"),
            max_model_calls=int(os.getenv("CHEF_MAX_MODEL_CALLS", "40")),
            max_tool_calls=int(os.getenv("CHEF_MAX_TOOL_CALLS", "80")),
            max_simulated_time=int(os.getenv("CHEF_MAX_SIMULATED_TIME", "1200")),
            timeout_seconds=float(os.getenv("CHEF_TIMEOUT_SECONDS", "300")),
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
