"""Terminal entry point. Default mode is credential-free scripted cooking."""
import argparse
import json

from pasta_chef.simulation.kitchen import Kitchen
from pasta_chef.simulation.scripted import run_scripted


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("scripted", "priority"), default="scripted")
    parser.add_argument("--rule", help="Priority rule JSON or evolution report (priority mode)")
    parser.add_argument("--ema", help="Load/save completed-duration EMA JSON (priority mode)")
    parser.add_argument("--menu", default="lemon_pasta")
    parser.add_argument("--time-limit", type=int, default=900)
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
        for event in kitchen.state.events:
            print(json.dumps(event))
        print(json.dumps(result, indent=2))
        return 0 if result["ok"] else 1
    except (ValueError, KeyError, ImportError, RuntimeError) as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
