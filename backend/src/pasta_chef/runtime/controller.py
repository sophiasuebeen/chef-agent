"""Bounded terminal episode. The kitchen, not ADK session state, owns progress."""
import asyncio
import json

from pasta_chef.agents.tools.kitchen import EpisodeLimit, KitchenTools
from pasta_chef.simulation.observation import build_observation
from pasta_chef.simulation.recipes import load_recipe


async def run_agent_episode(kitchen, settings, *, model=None) -> dict:
    """Use one real ADK Runner; tests may inject a credential-free BaseLlm."""
    from google.adk.agents.run_config import RunConfig
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types
    from pasta_chef.agents.chef import create_chef_agent

    tools = KitchenTools(kitchen, settings)

    async def episode():
        if not kitchen.state.orders:
            raise ValueError("Accept an order before starting the chef.")
        sessions = InMemorySessionService()
        session = await sessions.create_session(app_name="pasta_chef", user_id="terminal")
        chef = create_chef_agent(tools, settings.model if model is None else model)
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
                        raise EpisodeLimit("Kitchen cannot make progress.")
                    tools.advance_to_next_event()
                    continue
                if tools.model_calls >= settings.max_model_calls:
                    raise EpisodeLimit("Model call limit reached.")
                if tools.tool_calls >= settings.max_tool_calls:
                    raise EpisodeLimit("Tool call limit reached.")
                message = types.Content(role="user", parts=[types.Part(
                    text="Choose your next cooking tool. " + json.dumps(observation))])
                # A tool round ends the invocation via skip_summarization. A
                # parallel batch can contain several actions, all individually
                # checked by the wrappers. Counts persist across invocations.
                async for event in runner.run_async(
                    user_id="terminal", session_id=session.id, new_message=message,
                    run_config=RunConfig(max_llm_calls=settings.max_model_calls - tools.model_calls),
                ):
                    if event.error_code:
                        raise RuntimeError(f"Model response failed ({event.error_code}).")
        return {"ok": True, "status": "served"}

    try:
        result = await asyncio.wait_for(episode(), timeout=settings.timeout_seconds)
    except asyncio.TimeoutError:
        result = {"ok": False, "status": "stopped", "error": "Wall-clock time limit reached."}
    except (EpisodeLimit, ValueError) as error:
        result = {"ok": False, "status": "stopped", "error": str(error)}
    except Exception as error:
        # Provider exception strings can contain request details. Keep secrets
        # out of the terminal while still identifying the failure class.
        result = {"ok": False, "status": "failed", "error": type(error).__name__}
    return dict(result, model_calls=tools.model_calls, tool_calls=tools.tool_calls,
                observation=build_observation(kitchen.state))
