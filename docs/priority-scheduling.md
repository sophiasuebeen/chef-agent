# Priority scheduling and offline rule evolution

This is a small kitchen-specific adaptation of [Huang et al., arXiv:2410.22657](https://arxiv.org/pdf/2410.22657),
read as v2 (29 July 2026). The paper separates offline rule generation/evolution
from online dispatch, and uses completion-time deviations with smoothing
coefficient 0.2. This implementation adopts those ideas; it does not reproduce
the paper's benchmark, full reflection operator suite, or reported improvements.

## Runtime

From the repository root, no credentials or ADK required:

```bash
PYTHONPATH=backend/src python3 scripts/run_local.py --mode priority
```

`simulation/scheduler.py:run_priority_episode()` scores ready tasks across ALL
active orders. Higher scores win. It reserves all resources through the existing
`Kitchen.start_task()` validator, recomputes candidates after each start, and
starts compatible background work before advancing time. Finished dishes are
served immediately through the existing validator. Ties use stable order/recipe
insertion order. Invalid arithmetic candidates are skipped; if none can score,
the scheduler falls back to earliest deadline. Fallback selections remain logged.
Resource/dependency rules belong exclusively to the simulator.

The default rule is `-due - 0.001 * wkr + 0.00001 * background`: prioritize the
earliest absolute deadline. On equal deadlines, finish the order with the least
remaining work, so a nearly done dish is not delayed to start another. Background
heating only breaks ties within that. The weights assume a deadline gap of a second
outweighs a recipe's `wkr`; a recipe with over 1000 seconds of work would need new ones.
Rules are bounded arithmetic programs, not executable Python modules. Permitted
operators are `+ - * /` and unary signs; no imports, calls, loops, attributes, or
powers. This deliberately narrows the paper's unrestricted code-generation space.
Each JSON rule contains `name` and `expression`. Rules receive numeric features:

| Feature | Meaning |
|---|---|
| `now`, `due` | Simulated time and order deadline, absolute seconds |
| `pt` | Planned task duration adjusted by its historical EMA |
| `wkr` | Sum of remaining adjusted durations for this order |
| `steps` | Number of incomplete steps, including running steps |
| `slack` | `due - now - wkr` |
| `queue` | Other-order remaining work sharing any resource with this task |
| `ema_dev` | Historical relative duration deviation for this task/resource bundle |
| `background` | 1 if the task does not require `chef`, otherwise 0 |

`wkr` is a work sum, not a critical-path estimate; branches overlap, so slack is
an approximate heuristic. Queue is a work-load estimate, not just ready-task
queue length. Neither feature promises a feasible completion-time forecast.
For running operations, predicted remaining work subtracts elapsed time from
the EMA estimate, without reading hidden actual finish times.

## Historical uncertainty and dynamic arrivals

`DurationEMA` keys are `menu|task_id|sorted,resource,bundle`. Using one bundle
avoids multiplying a multi-resource task's duration once per resource. On each
completion, it applies:

```text
deviation = actual_duration / planned_duration - 1
ema = 0.2 * deviation + 0.8 * previous_ema
effective_duration = planned_duration * (1 + ema)
```

Only completed operations update history. Deadline lateness is an outcome metric,
not this duration-deviation EMA. New episodes use fresh history unless the caller
explicitly supplies one. The CLI optionally loads/saves history:

```bash
PYTHONPATH=backend/src python3 scripts/run_local.py --mode priority --ema /tmp/kitchen-ema.json
```

The base simulator still uses fixed recipe durations. For uncertain synthetic
training, `Kitchen(duration_sampler=callable)` samples a positive integer duration
at task start, without changing recipe data. Invalid samples leave kitchen state
unchanged. This extends duration semantics only; equipment stays reserved until
completion. General simulator observations/logs still contain actual finish times,
but priority features never expose them before completion.

`run_priority_episode(..., arrivals=[{"at": 75, "menu": "lemon_pasta",
"time_limit": 900}])` accepts future orders at exact simulated timestamps.
`advance_to_next_event(until=...)` may stop before a completion, or advance an
idle kitchen to an arrival; it logs `time_advanced`. Calling without `until`
retains the original no-running-task no-op behavior. Completion ties are handled
as one batch before arrivals at that timestamp. The scheduler has action and
simulated-time limits; stopping does not cancel unfinished tasks.

## Offline evolution

A dependency-free fixture exercises the full generation/evaluation/selection
path using handwritten candidates (it is NOT an LLM experiment):

```bash
PYTHONPATH=backend/src python3 -m evaluation.evolve --output /tmp/priority-rule.json
PYTHONPATH=backend/src python3 scripts/run_local.py --mode priority --rule /tmp/priority-rule.json
```

To let an LLM author and evolve rules, use the installed Google GenAI SDK and
existing Google/Gemini credentials in the shell or root/backend `.env`:

```bash
PYTHONPATH=backend/src backend/.venv/bin/python -m evaluation.evolve --live --model gemini-2.5-flash --population 4 --generations 2 --output /tmp/llm-priority-rule.json
```

The default live configuration makes 10 generation/reflection requests: four
children plus one collective reflection per generation. Each request has a
60-second HTTP timeout; failures abort without saving a partial deployable rule.
There is no LLM call during priority-based kitchen service. The adapter follows
[Google's SDK JSON generation interface](https://googleapis.github.io/python-genai/).

The population starts from EDD, least slack, shortest processing time, and a
queue/urgency seed. Each generation supplies two parents, measured scores, and
accumulated lessons to the author. Children are evaluated, parent/child deltas
are recorded, and the LLM synthesizes reflection for the next generation.
Invalid expressions are rejected. Elitist selection keeps the strongest rules;
duplicate expressions reuse cached training results. Population/generations
are bounded to 2–20/1–20. `evolve(proposer, ...)` permits another offline author
without changing the simulator or runtime.

Training uses seeds 11/12/13; held-out reporting uses 101/102/103 only AFTER
selection. Each case has four orders, staggered arrivals, positive duration
noise and a repeatable burner-time bias. Actual durations are keyed by seed,
order and task, so different dispatch sequences see the same underlying case.
EMA starts fresh per case, then learns within it. No future arrival or actual
duration data is passed to the rule or LLM author.

Fitness is mean `1000000 * unserved + 10000 * late_orders + total_tardiness +
1000 * rule_errors`. These weights are an explicit surrogate, not a strict
lexicographic guarantee for arbitrary workloads. The output saves exact rules,
training/held-out metrics, baseline metrics, deltas, and reflection history.
A selected rule is NOT automatically deployed: select it explicitly with `--rule`
after reviewing held-out results. Initial fixture execution actually performed
worse than EDD on held-out cases; evolution is not a guarantee of improvement.

This milestone does not model table plate synchronization, hold quality, inventory,
station breakdowns, or live exception handling. Adding those requires simulator
contracts and meaningful metrics first. Synthetic cases are not calibrated real
service logs. The existing `--mode agent` live planner remains available as a
separate comparison mode; API/frontend behavior has not been switched.
