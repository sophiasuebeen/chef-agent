"""Versioned, detached replay documents built from authoritative simulator events."""
import asyncio
from copy import deepcopy
from dataclasses import asdict, replace

from pasta_chef.api.schemas import ExecuteRequest, ReplayResponse
from pasta_chef.simulation.recipes import load_recipe
from pasta_chef.simulation.scheduler import PriorityRule, run_priority_episode
from pasta_chef.simulation.scripted import run_scripted_episode


def replay_state(state):
    return dict(time=state.time, orders=[asdict(o) for o in state.orders.values()],
                resources={name: list(owner) if owner else None
                           for name, owner in state.resources.items()},
                running_tasks=[dict(asdict(t), remaining_time=t.finishes_at - state.time)
                               for t in state.running_tasks])


def execute(kitchen, run_id: str, initial_conditions: dict, body: ExecuteRequest) -> ReplayResponse:
    """Called under the run lock. All modes share the same simulator and replay format."""
    recipes = {o.menu: load_recipe(o.menu) for o in kitchen.state.orders.values()}
    policy = dict(name=body.policy, version="1.0")
    limits = dict(max_actions=body.max_actions, max_simulated_time=body.max_simulated_time)
    try:
        if body.policy == "priority":
            rule = PriorityRule()
            policy["rule"] = dict(name=rule.name, expression=rule.expression)
            outcome = run_priority_episode(kitchen, rule=rule, **limits)
        elif body.policy == "scripted":
            outcome = run_scripted_episode(kitchen, **limits)
        else:
            # Importing/using the offline API never requires ADK or provider credentials.
            from pasta_chef.config import Settings
            from pasta_chef.runtime.controller import run_agent_episode
            settings = replace(Settings.from_env(), max_tool_calls=body.max_actions,
                               max_simulated_time=body.max_simulated_time)
            policy.update(model=settings.model, prompt_variant="original")
            limits.update(max_model_calls=settings.max_model_calls)
            outcome = asyncio.run(run_agent_episode(kitchen, settings))
    except Exception as error:
        # Never return provider exception messages, which can contain credentials.
        outcome = dict(ok=False, status="failed", termination_reason="execution_error",
                       error=type(error).__name__, model_calls=0, tool_calls=0)

    final_state = replay_state(kitchen.state)
    orders = [dict(o, lateness=max(0, (o["served_at"] if o["served_at"] is not None
                                     else kitchen.state.time) - o["deadline"]))
              for o in final_state["orders"]]
    completed = outcome["ok"] and all(o["status"] == "served" for o in orders)
    result = dict(status="completed" if completed else (
                      "failed" if outcome.get("status") == "failed" else "stopped"),
                  completed=completed, termination_reason=outcome["termination_reason"],
                  finished_at=kitchen.state.time,
                  total_lateness=sum(o["lateness"] for o in orders),
                  max_lateness=max((o["lateness"] for o in orders), default=0),
                  unserved_order_ids=[o["id"] for o in orders if o["status"] != "served"],
                  model_calls=outcome.get("model_calls", 0),
                  tool_calls=outcome.get("tool_calls", 0), error=outcome.get("error"))
    return ReplayResponse.model_validate(deepcopy(dict(
        schema_version="1.0", run_id=run_id, initial_conditions=initial_conditions,
        recipes=recipes, scheduling_policy=policy, limits=limits,
        events=kitchen.state.events, final_state=final_state, final_orders=orders, result=result,
    )))
