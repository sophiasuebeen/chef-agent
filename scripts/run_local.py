"""Terminal entry point. Default mode is credential-free scripted cooking."""
import argparse
import json

from pasta_chef.simulation.kitchen import Kitchen


def run_scripted(kitchen: Kitchen, order_id: str) -> dict:
    """Explicit baseline: preparation overlaps background water heating."""
    def cook(task_id):
        kitchen.start_task(order_id, task_id)
        kitchen.advance_to_next_event()

    cook("collect_ingredients")
    kitchen.start_task(order_id, "boil_water")
    cook("prepare_mint")
    cook("crush_garlic")
    kitchen.advance_to_next_event()
    for task_id in ("cook_pasta_halfway", "reserve_water_and_drain", "prepare_sauce",
                    "finish_pasta", "finish_off_heat"):
        cook(task_id)
    return kitchen.serve_order(order_id)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("scripted", "agent", "priority"), default="scripted")
    parser.add_argument("--rule", help="Priority rule JSON or evolution report (priority mode)")
    parser.add_argument("--ema", help="Load/save completed-duration EMA JSON (priority mode)")
    parser.add_argument("--menu", default="lemon_pasta")
    parser.add_argument("--time-limit", type=int, default=900)
    parser.add_argument("--model", help="Override CHEF_MODEL, e.g. openai/gpt-4o")
    args = parser.parse_args()
    kitchen = Kitchen()
    try:
        order = kitchen.add_order(args.menu, args.time_limit)
        if args.mode == "scripted":
            result = run_scripted(kitchen, order.id)
        elif args.mode == "priority":
            from pathlib import Path
            from pasta_chef.simulation.scheduler import DurationEMA, PriorityRule, run_priority_episode
            rule = PriorityRule()
            if args.rule:
                data = json.loads(Path(args.rule).read_text())
                rule = PriorityRule(**data.get("rule", data))
            ema_path = Path(args.ema) if args.ema else None
            ema = DurationEMA(json.loads(ema_path.read_text())) if ema_path and ema_path.exists() else DurationEMA()
            result = run_priority_episode(kitchen, rule=rule, ema=ema)
            if ema_path:
                ema_path.write_text(json.dumps(ema.values, indent=2) + "\n")
        else:
            import asyncio
            from pasta_chef.config import Settings
            settings = Settings.from_env()
            if args.model:
                from dataclasses import replace
                settings = replace(settings, model=args.model)
            from pasta_chef.runtime.controller import run_agent_episode
            from pasta_chef.runtime.progress import enable_progress_logs
            enable_progress_logs()
            result = asyncio.run(run_agent_episode(kitchen, settings))
        for event in kitchen.state.events:
            print(json.dumps(event))
        print(json.dumps(result, indent=2))
        return 0 if result["ok"] else 1
    except (ValueError, KeyError, ImportError, RuntimeError) as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
