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
    timeout_seconds: float = 120

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
        return cls(
            model=os.getenv("CHEF_MODEL", "gemini-2.5-flash"),
            max_model_calls=int(os.getenv("CHEF_MAX_MODEL_CALLS", "40")),
            max_tool_calls=int(os.getenv("CHEF_MAX_TOOL_CALLS", "80")),
            max_simulated_time=int(os.getenv("CHEF_MAX_SIMULATED_TIME", "1200")),
            timeout_seconds=float(os.getenv("CHEF_TIMEOUT_SECONDS", "120")),
        )
