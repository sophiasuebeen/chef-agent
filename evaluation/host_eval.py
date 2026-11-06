"""Live evaluation of the host LLM on evaluation/host_cases.json. Calls the provider and costs money.

PYTHONPATH=backend/src backend/.venv/bin/python -m evaluation.host_eval --output /tmp/host-eval.json

A pass means the kitchen received exactly the expected orders, the model answered, and the
reply passed its simple word checks. The word checks are rough, so read failures yourself.
"""
import argparse
import asyncio
from collections import Counter
import json
from pathlib import Path

CASES = Path(__file__).parent / "host_cases.json"


def score_case(case, outcome):
    """Problems with one case, empty when it passed."""
    problems = []
    if Counter(outcome["orders"]) != Counter(case["expect_orders"]):
        problems.append(f"orders {dict(Counter(outcome['orders']))} != {case['expect_orders']}")
    if outcome["failed"]:
        problems.append("the model did not answer")
    noted = [action for action in outcome.get("actions", []) if action["type"] == "small_talk"]
    if "expect_small_talk" in case and bool(noted) != case["expect_small_talk"]:
        problems.append(f"small talk noted: {bool(noted)}, expected {case['expect_small_talk']}")
    decisions = [action["decision"] for action in noted]
    expected = case.get("expect_decisions")
    if expected and decisions != expected:
        problems.append(f"decisions {decisions} != {expected}")
    reply = outcome["replies"][-1]
    wanted = case.get("reply_must_include_any")
    if wanted and not any(word in reply for word in wanted):
        problems.append(f"reply has none of {wanted}")
    for word in case.get("reply_must_not_include", []):
        if word in reply:
            problems.append(f"reply includes {word!r}")
    return problems


async def run_case(case):
    from pasta_chef.agents.host import create_host
    from pasta_chef.runtime.sessions import LiveSession
    session = LiveSession(speed=10, chefs=case.get("chefs", 1))
    host = create_host(session)
    replies, failed, actions = [], False, []
    for message in case["messages"]:
        result = await host.reply(message)
        replies.append(result["reply"])
        failed = failed or result["failed"]
        actions += result["actions"]
    orders = [order["menu"] for order in session.snapshot()["orders"]]
    outcome = dict(orders=orders, replies=replies, failed=failed, actions=actions)
    return dict(id=case["id"], messages=case["messages"], problems=score_case(case, outcome), **outcome)


async def evaluate(cases):
    results = []
    for case in cases:
        result = await run_case(case)
        results.append(result)
        print(("PASS " if not result["problems"] else "FAIL ") + case["id"], *result["problems"], flush=True)
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Write full results to this JSON file.")
    parser.add_argument("--only", nargs="*", help="Run only these case IDs.")
    args = parser.parse_args()
    cases = json.loads(CASES.read_text(encoding="utf-8"))
    if args.only:
        cases = [case for case in cases if case["id"] in args.only]
    results = asyncio.run(evaluate(cases))
    passed = sum(not result["problems"] for result in results)
    print(f"{passed} / {len(results)} passed")
    if args.output:
        args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
