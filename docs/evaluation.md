# Evaluation and experiment records

Results recorded before recipe `holds` (2026-11-06) let another order reuse a pot or
pan that still held food. Do not compare them with later runs; the prompt hash differs too.

Commands run from the repository root. Python 3.12+ is required. Scripted
baselines need no packages or credentials; live runs use the environment from
[the setup guide](../README.md#live-chefagent).

## Single-order smoke test

The explicit live smoke command is:

```bash
PYTHONPATH=backend/src backend/.venv/bin/python scripts/run_local.py --mode agent --model openai/gpt-4o
```

It makes real provider requests and can incur usage. It is never run by unittest
discovery. Exit code 0 means every accepted order was served; a missed deadline
is still reported as `on_time: false`. Exit code 1 means invalid input, missing
configuration, provider failure, or an exhausted episode limit. There is no
scripted fallback after model/network failure.

The terminal prints successful simulator actions and the final result, including
model/tool counts and `decision_log`. The log records model calls and tokens,
tool attempts and rejections, and retries. Progress appears on stderr; see
[the runtime architecture](architecture.md) for retry and heartbeat behavior.

A previously reported GPT-4o smoke run served order_1 on time at simulated second
710, with 9 model calls and 20 tool attempts and all resources released. This is
a historical observation, not a new run or a fixed performance guarantee. Offline
workflow tests use a mocked model with the real ADK Runner; they verify local
orchestration, schemas, validation and limits, not live provider performance.
Use the test command in [README](../README.md#offline-verification) for current
results rather than relying on a stored test count.

## Two-order smoke test

Two-order live smoke test (one ChefAgent, both orders accepted at time zero):

```bash
PYTHONPATH=backend/src backend/.venv/bin/python scripts/check_two_orders.py --max-simulated-time 1800 --report /tmp/pasta-chef-two-orders.json
```

This tests order_1 with deadline 1500 and order_2 with deadline 900. Omitting
`--max-simulated-time` uses the configured episode cap; the default 1200 is too
short for both orders (they need 1280 seconds of burner time alone). The script
writes settings, per-order outcomes, action events and replay checks. It exits
nonzero if an order is late, even if both dishes were served. It makes live
provider calls and is separate from unittest discovery.

Observed GPT-4o two-order run: order_1 served at 710 (on time), order_2 served at
1370 (470 seconds late), with 18 model calls and 45 tool attempts. All progress,
resource-release and action-replay checks passed. A separate scripted
urgency-first sequence served order_2 at 710 and order_1 at 1420, meeting both
deadlines. This exposes a deadline-prioritization issue in the current agent;
the test does not change the prompt or simulator rules.

## Deadline prompt comparison

`evaluation/scenarios/two_orders.json` fixes one chef, the existing four
resources, both orders accepted at time zero, deadlines 1500/900, and simulated
time cap 1800. The model/tool-call limits and wall-clock timeout come unchanged
from the existing Settings / `.env`. Every agent episode gets a fresh Kitchen,
ChefAgent, in-memory session service and ADK session. Agent execution always
uses `runtime/controller.py:run_agent_episode`; evaluation has no action loop.

The `original` variant preserves the previous prompt exactly. `deadline` only
appends the explicit deadline objective. The same model, temperature, scenario
and limits are used for both variants, alternating them once each by default.
Episodes set `skip_forced_moves`, so the model is only asked when a choice exists:
the controller serves finished orders and starts a lone task of the last active
order. A mocked earliest-deadline chef needs 13 model calls this way instead of
20, with identical service times. A provider failure that survives retries stops
the remaining episodes. The chef's next message names any forced moves. Select
another file in `evaluation/scenarios/` with `--scenario`. The baseline runs once, reusing `scripts/run_local.py:run_scripted` in earliest
deadline order. It uses no model/tools from ADK, so both call counts are zero.

Run only the credential-free scripted baseline:

```bash
PYTHONPATH=backend/src python3 -m evaluation.run --baseline-only --model openai/gpt-4o
```

Start the comparison explicitly (two real model episodes plus baseline):

```bash
PYTHONPATH=backend/src backend/.venv/bin/python -m evaluation.run --live --model openai/gpt-4o
```

Add `--repetitions 3` for six episodes.

Existing root/backend `.env` credentials are loaded before ADK is initialized;
keys are never included in reports. There is no live run during test discovery.
An explicit `--live` or `--baseline-only` is required. No experiment starts by
importing the evaluation modules.

Results go into a new `evaluation/results/<UTC timestamp>-<unique suffix>/`:
`scripted-1.json`, `original-1.json` through `original-3.json`,
`deadline-1.json` through `deadline-3.json`, and `comparison.md`.
Use `--output <new-directory>` to choose a path; existing output directories
are rejected to prevent mixing experiments. Files and the comparison table
are saved after each episode, including stopped/failed episodes.

Each JSON records the exact prompt and hash, scenario, non-secret settings and
limits, controller result, action log, per-order results and metrics:
`all_served`, `all_on_time`, integer counts `unserved_orders` / `late_orders`,
`total_tardiness`, `finished_at`, model/tool calls, and `termination_reason`.
`finished_at` is the final observed simulated timestamp, including a stopped
run. Tardiness is `sum(max(0, served_at - deadline))` for served orders only;
unserved orders have null service time/tardiness and are counted separately.
If an Order lacks served_at, the service event is used without changing state.
Missing all service-time evidence raises an error instead of inventing zero.
Any unserved order makes both all_served and all_on_time false.
`run_success` additionally requires completed execution and all_on_time, so a
stopped run with zero tardiness is never presented as a successful result.

Termination codes distinguish `completed`, `simulated_time_limit`,
`wall_clock_limit`, `model_call_limit`, `tool_call_limit`, `configuration_error`,
`api_error`, `no_progress`, and `setup_error`. Evaluation exit code 0 means the
comparison was saved; the rows' run_success fields describe cooking outcomes.
Three repetitions per prompt are exploratory and cannot establish a confirmed
performance improvement.

Live comparison executed on 2026-11-06 with `openai/gpt-4o`, three episodes per
prompt: [results and limitations](../evaluation/results/20261106T054509Z-f088d8e0/summary.md).
The original completed one episode with 470 seconds of tardiness; the other
five episodes stopped with provider `RateLimitError`. The deadline prompt
served the urgent order on time in its first episode before interruption,
but this incomplete sample does not establish an improvement.

A later run with the current controller compared both prompts across five
scenarios: [results and limitations](../evaluation/results/20261106-scenarios/summary.md).
