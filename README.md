# Pasta Chef terminal demo

One lemon-pasta order, one Google ADK ChefAgent, one chef, one burner, pot and
pan. The simulator owns all rules. Inventory is assumed sufficient; vessel
contents, cooling and overcooking are not modeled.

Python 3.12+ is required. Run commands from this repository root.

The simulator and scripted baseline need no packages or credentials:

```bash
PYTHONPATH=backend/src python3 scripts/run_local.py
```

The action log shows water heating overlapping mint and garlic preparation.
The scripted dish is served at simulated second 710 against a 900-second deadline.
`--menu lemon_pasta` and `--time-limit 900` configure order intake.

Install the optional ADK extra once (versions are pinned in backend/uv.lock):

```bash
uv sync --project backend --extra agent --locked
```

Use existing `GOOGLE_API_KEY` / `GEMINI_API_KEY` environment credentials or a
local `.env` at the repository root or in backend. Existing shell variables win;
root `.env` takes precedence over backend/.env. `.env.example` documents model
and episode limits. For Gemini, the terminal demo sets `GOOGLE_GENAI_USE_VERTEXAI=false`
before initializing ADK and uses the Gemini Developer API with the existing key.
For OpenAI models, set `OPENAI_API_KEY` and `CHEF_MODEL=openai/gpt-4o`, or use
`--model openai/gpt-4o` to override the model from `.env`. ADK uses its LiteLLM
adapter for OpenAI. Google Cloud authentication is not used. No key is required for offline tests.

Run the live agent demo with one terminal command:

```bash
PYTHONPATH=backend/src backend/.venv/bin/python scripts/run_local.py --mode agent --model openai/gpt-4o
```

This is also the **opt-in live smoke test**: it uses the configured model and
real credentials, can incur provider usage, and succeeds only when the simulator
records service. It is never run by unittest discovery. An exit code of 0 means
served; a deadline miss is reported as `on_time: false`. Exit code 1 means an
invalid order, missing configuration, provider failure or exhausted limit.
The terminal prints the successful simulator action log and final observation,
including model/tool counts. Network or model failures never invoke a scripted
fallback. No credentials are printed.

Offline verification (no provider requests):

```bash
PYTHONPATH=backend/src python3 -m unittest discover -s tests -v
PYTHONPATH=backend/src backend/.venv/bin/python -m unittest discover -s tests -v
```

The first command runs simulator/wrapper checks and skips ADK checks if that
optional package is absent. With the extra installed, tests/test_agent_workflow.py
runs the real ADK Runner and tool dispatch using a mocked BaseLlm. Those checks
prove local orchestration, tool schemas, validation and limits, not Gemini
availability or live model performance. Claude owns tests/test_kitchen_contract.py;
this implementation does not modify it.

See [the stable public contract](docs/backend-contract.md) and
[the execution path](docs/architecture.md).

Verified live smoke run: `openai/gpt-4o` served order_1 on time at simulated
second 710, with 9 model calls and 20 tool attempts. All resources were released.
The separate offline workflow suite passed 22 tests. A live run's decisions and
call counts can vary.

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

Deadline prompt comparison (minimal evaluation)

`evaluation/scenarios/two_orders.json` fixes one chef, the existing four
resources, both orders accepted at time zero, deadlines 1500/900, and simulated
time cap 1800. The model/tool-call limits and wall-clock timeout come unchanged
from the existing Settings / `.env`. Every agent episode gets a fresh Kitchen,
ChefAgent, in-memory session service and ADK session. Agent execution always
uses `runtime/controller.py:run_agent_episode`; evaluation has no action loop.

The `original` variant preserves the previous prompt exactly. `deadline` only
appends the explicit deadline objective. The same model, temperature, scenario
and limits are used for both variants, alternating them three times each.
The baseline runs once, reusing `scripts/run_local.py:run_scripted` in earliest
deadline order. It uses no model/tools from ADK, so both call counts are zero.

Run only the credential-free scripted baseline:

```bash
PYTHONPATH=backend/src python3 -m evaluation.run --baseline-only --model openai/gpt-4o
```

Start the full comparison explicitly (six real model episodes plus baseline):

```bash
PYTHONPATH=backend/src backend/.venv/bin/python -m evaluation.run --live --model openai/gpt-4o --repetitions 3
```

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
