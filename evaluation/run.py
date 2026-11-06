"""Small two-prompt comparison. Use --live explicitly to call the provider."""
import argparse
import asyncio
from copy import deepcopy
from dataclasses import asdict, replace
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
from uuid import uuid4

from evaluation.metrics import calculate_metrics
from pasta_chef.agents.chef import get_chef_instruction
from pasta_chef.config import Settings
from pasta_chef.runtime.progress import enable_progress_logs, logger as progress
from pasta_chef.simulation.kitchen import Kitchen
from scripts.run_local import run_scripted

SCENARIO_PATH = Path(__file__).parent / "scenarios" / "two_orders.json"


def load_scenario(path=SCENARIO_PATH) -> dict:
    scenario = json.loads(Path(path).read_text(encoding="utf-8"))
    if scenario["chef_count"] != 1:
        raise ValueError("This evaluation supports one ChefAgent.")
    cap = scenario["max_simulated_time"]
    if type(cap) is not int or cap <= 0:
        raise ValueError("Scenario simulated-time cap must be a positive integer.")
    if len(scenario["orders"]) < 2:
        raise ValueError("A prompt comparison needs at least two competing orders.")
    for order in scenario["orders"]:
        if order["menu"] != "lemon_pasta":
            raise ValueError("This evaluation supports lemon_pasta only.")
        if type(order["deadline"]) is not int or order["deadline"] <= 0:
            raise ValueError("Deadlines must be positive integers.")
    return scenario


def initialize_kitchen(scenario: dict) -> Kitchen:
    """Each run starts at t=0 with default resources and independent orders."""
    kitchen = Kitchen()
    if set(kitchen.state.resources) != set(scenario["resources"]):
        raise ValueError("Scenario resources must match the existing kitchen.")
    for order in scenario["orders"]:
        kitchen.add_order(order["menu"], time_limit=order["deadline"])
    return kitchen


def run_baseline(kitchen, settings) -> dict:
    """Reuse the previously verified urgency-first scripted cooking sequence."""
    for order in sorted(kitchen.state.orders.values(), key=lambda order: order.deadline):
        run_scripted(kitchen, order.id)
    within_cap = kitchen.state.time <= settings.max_simulated_time
    return {
        "ok": within_cap, "status": "served" if within_cap else "stopped",
        "termination_reason": "completed" if within_cap else "simulated_time_limit",
        "model_calls": 0, "tool_calls": 0,
    }


def build_report(scenario, settings, kitchen, result, variant, repetition):
    prompt = get_chef_instruction(variant) if variant != "scripted" else None
    return {
        "variant": variant, "repetition": repetition,
        "scenario": deepcopy(scenario), "settings": asdict(settings),
        "prompt": prompt,
        "prompt_sha256": sha256(prompt.encode()).hexdigest() if prompt else None,
        "baseline": "scripts.run_local.run_scripted; earliest deadline first" if prompt is None else None,
        "metrics": calculate_metrics(kitchen.state, result),
        "controller_result": deepcopy(result),
        "events": deepcopy(kitchen.state.events),
    }


def comparison_table(reports) -> str:
    lines = [
        "# Exploratory prompt comparison", "",
        "Small per-prompt samples are exploratory, not evidence of a confirmed performance improvement.",
        "Unserved orders are separate from served-order tardiness. A stopped run with zero tardiness is not a success.",
        "finished_at is the last observed simulated time, including stopped episodes.", "",
        "| variant | run | all_served | all_on_time | unserved | late | tardiness (s) | finished_at | model/tool calls | termination | success |",
        "|---|---:|---|---|---:|---:|---:|---:|---|---|---|",
    ]
    for report in reports:
        m = report["metrics"]
        lines.append(
            f"| {report['variant']} | {report['repetition']} | {m['all_served']} | {m['all_on_time']} "
            f"| {m['unserved_orders']} | {m['late_orders']} | {m['total_tardiness']} "
            f"| {m['finished_at']} | {m['model_calls']}/{m['tool_calls']} "
            f"| {m['termination_reason']} | {m['run_success']} |"
        )
    return "\n".join(lines) + "\n"


def terminal_table(reports) -> str:
    """Aligned plain-text view of the same rows; comparison.md stays markdown."""
    headers = ("variant", "run", "served", "on_time", "unserved", "late", "tardy_s",
               "end_s", "model/tool", "in_tokens", "rejects", "retries", "stop_reason", "success")
    numeric = {"run", "unserved", "late", "tardy_s", "end_s", "model/tool",
               "in_tokens", "rejects", "retries"}
    yes_no = lambda value: "yes" if value else "no"
    rows = []
    for report in reports:
        m = report["metrics"]
        rows.append((
            report["variant"], report["repetition"], yes_no(m["all_served"]),
            yes_no(m["all_on_time"]), m["unserved_orders"], m["late_orders"],
            m["total_tardiness"], m["finished_at"], f"{m['model_calls']}/{m['tool_calls']}",
            m["input_tokens"], m["rejected_tool_calls"], m["provider_retries"],
            m["termination_reason"], yes_no(m["run_success"]),
        ))
    rows = [tuple(str(cell) for cell in row) for row in rows]
    widths = [max(len(row[i]) for row in [headers, *rows]) for i in range(len(headers))]

    def line(cells):
        return "  ".join(
            cell.rjust(width) if header in numeric else cell.ljust(width)
            for cell, width, header in zip(cells, widths, headers)
        ).rstrip()

    return "\n".join([
        "Exploratory prompt comparison (small sample; not a confirmed improvement)",
        "A stopped run with zero tardiness is not a success. end_s includes stopped runs.",
        "",
        line(headers),
        "  ".join("-" * width for width in widths),
        *(line(row) for row in rows),
    ]) + "\n"


async def run_comparison(scenario, settings, output_dir, *, repetitions=3, live=False,
                         episode_runner=None):
    """Delegate every agent episode to controller; no agent action loop here.

    episode_runner is an offline test seam. Production uses run_agent_episode,
    which creates a new in-memory session service and ADK session on each call.
    """
    if type(repetitions) is not int or repetitions <= 0:
        raise ValueError("Repetitions must be a positive integer.")
    settings = replace(settings, max_simulated_time=scenario["max_simulated_time"],
                       skip_forced_moves=True)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=False)
    reports = []
    progress.info("Results directory: %s", output_dir.resolve())

    def save(kitchen, result, variant, repetition):
        report = build_report(scenario, settings, kitchen, result, variant, repetition)
        m = report["metrics"]
        progress.info(
            "Saved %s-%s: stop=%s served=%s on_time=%s model/tool=%s/%s in_tokens=%s retries=%s",
            variant, repetition, m["termination_reason"], m["all_served"], m["all_on_time"],
            m["model_calls"], m["tool_calls"], m["input_tokens"], m["provider_retries"])
        (output_dir / f"{variant}-{repetition}.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        reports.append(report)
        (output_dir / "comparison.md").write_text(comparison_table(reports), encoding="utf-8")

    kitchen = initialize_kitchen(scenario)
    save(kitchen, run_baseline(kitchen, settings), "scripted", 1)
    if live:
        if episode_runner is None:
            from pasta_chef.runtime.controller import run_agent_episode
            episode_runner = run_agent_episode
        # Alternate variants each repetition; all other conditions are identical.
        total, number = repetitions * 2, 0
        for repetition in range(1, repetitions + 1):
            for variant in ("original", "deadline"):
                number += 1
                progress.info("Episode %s/%s started: %s-%s (timeout %.0fs)", number, total,
                              variant, repetition, settings.timeout_seconds)
                kitchen = initialize_kitchen(scenario)
                try:
                    result = await episode_runner(kitchen, settings, prompt_variant=variant)
                except Exception as error:
                    # Import/setup failures occur before controller accounting.
                    # Never serialize exception messages that could contain keys.
                    result = {"ok": False, "status": "failed", "error": type(error).__name__,
                              "termination_reason": "setup_error", "model_calls": 0, "tool_calls": 0}
                save(kitchen, result, variant, repetition)
                # Retries are already exhausted here, so more episodes would only
                # spend calls against a provider that is refusing them.
                if result["termination_reason"] == "api_error":
                    progress.info("Stopping after provider failure: %s of %s episodes not run.",
                                  total - number, total)
                    return reports
    return reports


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--live", action="store_true", help="Run live episodes per prompt plus baseline")
    mode.add_argument("--baseline-only", action="store_true", help="No SDK or credentials needed")
    parser.add_argument("--scenario", type=Path, default=SCENARIO_PATH)
    parser.add_argument("--model", help="Override CHEF_MODEL, e.g. openai/gpt-4o")
    parser.add_argument("--repetitions", type=int, default=1,
                        help="Episodes per prompt; each one spends model calls")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    enable_progress_logs()
    settings = Settings.from_env() if args.live else Settings()
    if args.model:
        settings = replace(settings, model=args.model)
    output = args.output or Path("evaluation/results") / (
        datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8])
    reports = asyncio.run(run_comparison(
        load_scenario(args.scenario), settings, output,
        repetitions=args.repetitions, live=args.live,
    ))
    print(terminal_table(reports))
    print(f"Results: {output.resolve()}")
    # Completed evaluation may include failed episodes; run_success in each row
    # is the outcome metric, distinct from this command's successful execution.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
