"""Bounded terminal episode. The kitchen, not ADK session state, owns progress."""
import asyncio

from pasta_chef.agents.tools.kitchen import EpisodeLimit, KitchenTools
from pasta_chef.config import ConfigurationError
from pasta_chef.simulation.observation import build_observation
from pasta_chef.simulation.recipes import load_recipe


async def run_agent_episode(kitchen, settings, *, model=None, prompt_variant="original") -> dict:
    """Use one real ADK Runner; tests may inject a credential-free BaseLlm."""
    from google.adk.agents.invocation_context import LlmCallsLimitExceededError
    from google.adk.agents.run_config import RunConfig
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types
    from pasta_chef.agents.chef import create_chef_agent

    tools = KitchenTools(kitchen, settings)

    async def episode():
        if model is None:
            from pasta_chef.config import require_model_credentials
            require_model_credentials(settings.model)
        if not kitchen.state.orders:
            raise ValueError("Accept an order before starting the chef.")
        sessions = InMemorySessionService()
        session = await sessions.create_session(app_name="pasta_chef", user_id="terminal")
        chef = create_chef_agent(
            tools, settings.model if model is None else model, prompt_variant=prompt_variant
        )
        async with Runner(app_name="pasta_chef", agent=chef, session_service=sessions) as runner:
            while any(o.status != "served" for o in kitchen.state.orders.values()):
                observation = build_observation(kitchen.state)
                can_serve = any(
                    o.status != "served"
                    and set(load_recipe(o.menu)["completion_tasks"]).issubset(o.completed_tasks)
                    for o in kitchen.state.orders.values()
                )
                if not any(observation["available_tasks"].values()) and not can_serve:
                    if not kitchen.state.running_tasks:
                        raise EpisodeLimit("Kitchen cannot make progress.", "no_progress")
                    tools.log_tool_call("advance_to_next_event", {}, tools.advance_to_next_event(),
                                        source="controller")
                    continue
                if tools.model_calls >= settings.max_model_calls:
                    raise EpisodeLimit("Model call limit reached.", "model_call_limit")
                if tools.tool_calls >= settings.max_tool_calls:
                    raise EpisodeLimit("Tool call limit reached.", "tool_call_limit")
                # The before_model callback appends the current observation.
                message = types.Content(role="user", parts=[types.Part(
                    text="Choose your next cooking tool.")])
                # A tool round ends the invocation via skip_summarization. A
                # parallel batch can contain several actions, all individually
                # checked by the wrappers. Counts persist across invocations.
                async for event in runner.run_async(
                    user_id="terminal", session_id=session.id, new_message=message,
                    run_config=RunConfig(max_llm_calls=settings.max_model_calls - tools.model_calls),
                ):
                    if event.error_code:
                        raise RuntimeError(f"Model response failed ({event.error_code}).")
        return {"ok": True, "status": "served", "termination_reason": "completed"}

    heartbeat = asyncio.create_task(tools.progress.run_heartbeat())
    try:
        result = await asyncio.wait_for(episode(), timeout=settings.timeout_seconds)
    except asyncio.TimeoutError:
        result = {"ok": False, "status": "stopped", "error": "Wall-clock time limit reached.",
                  "termination_reason": "wall_clock_limit"}
    except EpisodeLimit as error:
        result = {"ok": False, "status": "stopped", "error": str(error),
                  "termination_reason": error.reason}
    except LlmCallsLimitExceededError:
        result = {"ok": False, "status": "stopped", "error": "Model call limit reached.",
                  "termination_reason": "model_call_limit"}
    except ConfigurationError as error:
        result = {"ok": False, "status": "failed", "error": str(error),
                  "termination_reason": "configuration_error"}
    except Exception as error:
        # Provider exception strings can contain request details. Keep secrets
        # out of the terminal while still identifying the failure class.
        result = {"ok": False, "status": "failed", "error": type(error).__name__,
                  "termination_reason": "api_error"}
    finally:
        heartbeat.cancel()
        await asyncio.gather(heartbeat, return_exceptions=True)
    tools.progress.finished(result["termination_reason"], result.get("error"))
    return dict(result, model_calls=tools.model_calls, tool_calls=tools.tool_calls,
                **tools.usage(), decision_log=tools.decision_log,
                observation=build_observation(kitchen.state))
