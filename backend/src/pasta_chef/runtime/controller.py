"""Bounded terminal episode. The kitchen, not ADK session state, owns progress."""
import asyncio

from pasta_chef.agents.tools.kitchen import EpisodeLimit, KitchenTools
from pasta_chef.config import ConfigurationError
from pasta_chef.simulation.observation import build_observation
from pasta_chef.simulation.recipes import load_recipe


def forced_action(state, observation):
    """Return the (tool, args) that involves no choice, or None to ask the chef.

    A finished dish loses nothing by being served now. With one order left, no
    other order can compete for resources, so a lone startable task is not a
    decision either. Anything with a real alternative stays with the chef.
    """
    active = [order for order in state.orders.values() if order.status != "served"]
    running = {task.order_id for task in state.running_tasks}
    for order in active:
        completion = set(load_recipe(order.menu)["completion_tasks"])
        if order.id not in running and completion.issubset(order.completed_tasks):
            return "serve_order", {"order_id": order.id}
    if len(active) == 1:
        available = observation["available_tasks"][active[0].id]
        if len(available) == 1:
            return "start_task", {"order_id": active[0].id, "task_id": available[0]}
    return None


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
        handled = []
        async with Runner(app_name="pasta_chef", agent=chef, session_service=sessions) as runner:
            while any(o.status != "served" for o in kitchen.state.orders.values()):
                observation = build_observation(kitchen.state)
                forced = forced_action(kitchen.state, observation) if settings.skip_forced_moves else None
                if forced:
                    tool, args = forced
                    tools.log_tool_call(tool, args, getattr(tools, tool)(**args), source="controller")
                    handled.append(f"{tool}({', '.join(args.values())})")
                    continue
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
                # Forced moves are not in the chef's history, so say they happened.
                note = f"The controller already did: {'; '.join(handled)}. " if handled else ""
                handled.clear()
                message = types.Content(role="user", parts=[types.Part(
                    text=note + "Choose your next cooking tool.")])
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
