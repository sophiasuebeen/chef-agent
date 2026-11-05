"""Opt-in live smoke test: one current ChefAgent, two different order deadlines.

Run from the repository root. Calls the real provider; never used by unittest.
"""
import argparse
import asyncio
from dataclasses import asdict, replace
import json
from pathlib import Path

from pasta_chef.config import Settings
from pasta_chef.simulation.kitchen import Kitchen
from pasta_chef.simulation.recipes import load_recipe


def summarize(kitchen, result):
    orders = list(kitchen.state.orders.values())
    expected_tasks = {task["id"] for task in load_recipe("lemon_pasta")["tasks"]}
    # Replay successful action events through a separate simulator. This checks
    # recorded dependencies, resource conflicts, timestamps and service results.
    replay = Kitchen()
    replay_ok = True
    for event in kitchen.state.events:
        action = event["action"]
        if action == "order_accepted":
            replay.add_order(event["menu"], event["deadline"] - event["time"])
            actual = replay.state.events[-1]
        elif action == "task_started":
            actual = replay.start_task(event["order_id"], event["task_id"])
        elif action == "tasks_completed":
            actual = replay.advance_to_next_event()
        elif action == "order_served":
            actual = replay.serve_order(event["order_id"])
        else:
            raise AssertionError(f"Unexpected successful action: {action}")
        replay_ok = replay_ok and actual == event
    checks = {
        "action_log_replays_exactly": replay_ok and replay.state == kitchen.state,
        "independent_progress_lists": orders[0].completed_tasks is not orders[1].completed_tasks,
        "no_duplicate_task_completions": all(
            len(o.completed_tasks) == len(set(o.completed_tasks)) for o in orders),
        "all_recipe_tasks_completed": all(set(o.completed_tasks) == expected_tasks for o in orders),
        "all_resources_released": all(owner is None for owner in kitchen.state.resources.values()),
        "no_running_tasks": not kitchen.state.running_tasks,
    }
    return {
        "episode_ok": result["ok"],
        "status": result["status"],
        "error": result.get("error"),
        "model_calls": result["model_calls"],
        "tool_calls": result["tool_calls"],
        "simulated_time": kitchen.state.time,
        "orders": [asdict(o) for o in orders],
        "all_served": all(o.status == "served" for o in orders),
        "all_on_time": all(o.on_time is True for o in orders),
        "checks": checks,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default="openai/gpt-4o")
    parser.add_argument("--max-simulated-time", type=int)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    # Load root .env before importing or initializing ADK.
    settings = replace(Settings.from_env(), model=args.model)
    if args.max_simulated_time is not None:
        settings = replace(settings, max_simulated_time=args.max_simulated_time)
    from pasta_chef.runtime.controller import run_agent_episode
    kitchen = Kitchen()
    kitchen.add_order("lemon_pasta", time_limit=1500)
    kitchen.add_order("lemon_pasta", time_limit=900)
    result = asyncio.run(run_agent_episode(kitchen, settings))
    summary = summarize(kitchen, result)
    report = {"settings": asdict(settings), "summary": summary, "events": kitchen.state.events}
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print(f"Report: {args.report}")
    return 0 if result["ok"] and summary["all_on_time"] and all(summary["checks"].values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
