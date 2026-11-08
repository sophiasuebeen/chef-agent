# Pasta Chef — Coding Agent Context

## Purpose

Build a simulated outdoor pasta restaurant on a beach. A deterministic scheduler operates a kitchen with recipe dependencies, limited equipment, preparation tasks, background cooking, and order deadlines.

An optimizer-style scheduler cooks; the LLM handles only customer conversation. The eventual experience includes a 3D restaurant, ordering, watching the chef, asking about cooking, and leaving feedback. Human play and human–agent cooperation are future possibilities, not current requirements.

## Working with the developer

- This is a learning project. The developer wants to practice implementing a few related functions or methods at a time, in a LeetCode-like style.
- For an exercise request, provide signatures, input/output examples, edge cases, and meaningful tests. Leave implementation bodies blank and offer small hints. Do not reveal a full solution until requested.
- When explicitly asked for implementation, provide or implement the requested bounded change completely.
- Explain where code belongs and how to run it. Keep explanations concise and concrete.
- Work on one small milestone at a time. Do not scaffold every future component or introduce extra files without explaining why.
- Inspect the actual repository before editing. Conversation examples are proposed code, not proof that files or features exist.
- Preserve established names, interfaces, and structure unless a change is necessary; explain migrations and update callers together.
- Do not add dependencies, cloud infrastructure, databases, or extra agents merely to make the project appear sophisticated.

## Current implementation

The simulator implements order intake, task validation/start, event-based time
advancement, resource release, service, reset, and detached observations.
Multiple orders share equipment while keeping independent task progress.
`lemon_pasta`, `seafood_tomato` and `fig_pasta` are the registered menus.

Terminal modes in `scripts/run_local.py` are `scripted` and `priority`.
The priority scheduler supports exact-time arrivals, completed-duration EMA history,
and optional sampled durations. `Kitchen(chefs=n)` supports 1–4 chefs.

The HTTP API supports in-memory batch runs, frozen replays and live sessions.
The default frontend is the walkable game; `?live` opens the live kitchen test
page, `?replay` opens batch ordering/replay, and `?scene` opens scene development.
Live cooking uses `Dispatcher`. The default OpenAI Agents SDK staff team handles
customer conversation and validated order tools; it never chooses cooking tasks.
`RestaurantRuntime` owns seating, A/B waiter assignment and table delivery. The previous LLM cooking
mode, comparison runner and episode progress logs have been removed.

Do not treat completed features as future milestones. Inspect code and tests
before choosing the next bounded change. Current extensions and limitations
are documented in `docs/`, not a fixed backlog in this file.

## Architecture and repository layout

| Component | Responsibility |
| --- | --- |
| Python simulator | Authoritative state, cooking rules, equipment, timing, validation |
| OpenAI Agents SDK staff | Waiter A/B conversation, validated orders, manager handoff |
| KitchenAdvisorAgent | Read-only menu/preparation/wait estimates, called by waiters as an SDK agent tool |
| RestaurantRuntime | Table ownership, staff tasks, pickup and delivery |
| Live sessions | Clock mapping, dispatch, chef conversation holds and event stream |
| HTTP API | Isolated in-memory runs, order intake, execution and frozen replays |
| Frontend | Order intake, deterministic replay controls and synchronized 3D kitchen |
| Evaluation | Deadline metrics, priority-rule evolution and host conversation cases |

Simulator imports and scripted/priority execution do not require an agent SDK,
an API server, or a renderer. `backend/pyproject.toml` has no required dependencies.
The `agent` extra provides the OpenAI Agents SDK, python-dotenv and the Google GenAI
SDK (only for optional Gemini rule evolution in `evaluation/evolve.py`). The `api`
extra provides FastAPI, Uvicorn and HTTPX. The `dev` dependency group (installed by
default with `uv sync`) provides ruff and import-linter for checks only. Google ADK and
LiteLLM were removed with the legacy single-host conversation. Do not change
dependencies as part of a documentation-only task.

Layers import downward only: `api` > `agents` > `runtime` > `simulation`.
`simulation` imports no config, credentials or SDKs. `.importlinter` enforces this;
when a value is needed by two layers, move it to the lower one instead of importing up.

Paths below are relative to the repository root:

```text
backend/
  src/pasta_chef/
    main.py                         # FastAPI application
    config.py                       # Environment, model and credentials
    simulation/
      models.py                     # Order, KitchenState, RunningTask
      recipes.py                    # Registered recipe loading and task lookup
      kitchen.py                    # Authoritative actions and validation
      observation.py                # Detached serializable snapshots
      scheduler.py                  # Priority rules, EMA and arrival handling
      scripted.py                   # Shared scripted baseline and bounded episode
    recipes/
      lemon_pasta.json
      seafood_tomato.json
      fig_pasta.json
    agents/
      host.py                       # Menus, staff instructions, fallback replies, create_host
      orders.py                     # OrderDesk: validated order tools, no SDK
      team.py                       # OpenAI SDK manager and two waiters
      kitchen_advisor.py            # Read-only specialist child; returns findings to its calling waiter
    runtime/
      sessions.py                   # Live sessions: real time to simulated time, event stream
      restaurant.py                 # Dining-room tasks and table delivery, separate from cooking
    api/
      README.md                     # HTTP setup and endpoint contract
      routes/                       # Runs, order intake/read, state read
      store.py                      # In-memory per-run kitchen and lock
      schemas.py
      errors.py
      events.py                     # Execution dispatch and replay document assembly
  tests/test_api.py
  tests/test_execution.py            # Execution, lifecycle and replay
  tests/test_restaurant.py           # Staff team with a scripted SDK model, dining runtime
  tests/test_messages.py             # /messages API rules and host evaluation cases
  tests/test_orders.py               # OrderDesk validation with a real LiveSession
  README.md
  pyproject.toml
  uv.lock
tests/
  test_simulation.py                 # Dependencies, ownership and equipment holds
  test_config.py                     # Environment loading and credential selection
  test_metrics.py                    # Deadline metrics for rule evaluation
  test_priority_scheduler.py
scripts/
  run_local.py
  run_tests.py                      # Combined offline test report
frontend/
  src/                              # Replay UI, scene, components, data and scene state
    scene/replayPresentation.ts     # Pure time/sequence → chef and station presentation
    scene/characters/Chef.tsx       # Procedural articulated reference chef
    scene/kitchen/KitchenReplay.tsx # Equipment, station effects and pass dishes
  public/assets/                    # Models, textures, attribution
evaluation/
  host_eval.py                       # Explicit live conversation evaluation
  host_cases.json
  metrics.py
  evolve.py                         # Offline priority-rule evolution
  results/                          # Historical experiment artifacts
docs/
  architecture.md
  backend-contract.md
  evaluation.md
  priority-scheduling.md
.env.example
README.md
AGENTS.md
```

Shared inventory types, if needed, belong in `simulation/models.py`; recipe
requirements belong in JSON. Assume sufficient inventory for current scenarios.
Extract an ingredient catalog only when a concrete feature requires one.

## Core data contracts

### Order

- `id`: generated unique identifier within the kitchen, e.g. `order_1`.
- `menu`: recipe identifier, e.g. `lemon_pasta`.
- `created_at`: simulated seconds at acceptance.
- `deadline`: absolute simulated timestamp, initially `created_at + time_limit`.
- `status`: initially `pending`, then `cooking`, then `served`.
- `completed_tasks`: task IDs completed for this order.

Each order has independent progress. Two lemon-pasta orders must not share completed tasks or mutable lists. A recipe is a reusable definition; an order requests an instance of it.

### KitchenState

- `time`: nonnegative simulated seconds, initially zero.
- `orders`: order ID → Order.
- `next_order_number`: counter for order IDs.
- `running_tasks`: active RunningTask objects.
- `resources`: resource name → owning `(order_id, task_id)` or `None`.

Initial resource names: `chef`, `burner`, `pot`, `pan`, plus `chef_2` ... `chef_N` after `chef` with `Kitchen(chefs=N)`. Chef availability is derived from ownership through `chef_names(state)` and `free_chef(state)` in `simulation/kitchen.py`; avoid literal `chef` lookups and an independently maintained busy flag that can disagree. Not every owner is a real order: a chef reserved for conversation is owned by `("customer", "chat")`.

### RunningTask

- `order_id`
- `task_id`
- `finishes_at`: start time plus recipe duration.
- `resources`: resources reserved for this execution, with the concrete chef assigned.

### Recipe JSON

- `id`, `name`, `ingredients`.
- `tasks`: entries with `id`, `description`, `duration`, `requires`, `resources`, and optional `holds`.
- `completion_tasks`: task IDs that must be completed before serving.

`requires` refers to completed task IDs for the same order. Durations are configurable simulation values, not verified real cooking times. Use positive durations in the initial model.

## Cooking rules and timing

1. Validate before mutating state. Rejected actions leave state unchanged.
2. Reject unknown orders/tasks, already-running/completed tasks, served orders, missing dependencies, and unavailable resources.
3. `start_task(order_id, task_id)` reserves resources and registers completion time; it does not advance time.
4. In a recipe, `chef` means any one free chef. Validation needs one free, and `start_task` assigns the first, holding it for the task's duration. Background tasks omit `chef`, allowing preparation concurrently. `holds` never name chefs.
5. `advance_to_next_event()` advances to the earliest task completion and completes ALL tasks at that timestamp. Optional keyword `until` can stop at an arrival/time boundary; see `docs/backend-contract.md`.
6. On completion, update the owning order, release only resources owned by that task except those named in its `holds`, and remove the running task.
7. With no running tasks and no `until`, advancing returns an explicit no-op result. An explicit future `until` advances idle time and logs `time_advanced`.
8. Simulated time is independent of wall-clock time and LLM latency. Do not use real sleeps to represent cooking. Only `runtime/sessions.py` maps real time to simulated time, for live sessions.
9. Serving must validate recipe completion and prevent duplicate service. Deadline compliance is recorded; automatic cancellation on deadline is not currently required.

Equipment is reserved for each task's duration and released at task completion, unless the recipe task declares `holds: {resources, until}`. Held equipment stays reserved for that order until the named task starts, so cooked pasta keeps the pot and sauce keeps the pan. Some small actions are grouped into recipe tasks. The initial model tracks task progress rather than detailed ingredient transformations or persistent vessel contents. Do not claim it already models pot contents, contamination, cooling, or overcooking. Explain any extension of these mechanics before implementing it.

## Lemon-pasta task graph

The registered lemon-pasta recipe uses:

```text
collect_ingredients -> boil_water -> cook_pasta_halfway
collect_ingredients -> prepare_mint
collect_ingredients -> crush_garlic
cook_pasta_halfway -> reserve_water_and_drain
reserve_water_and_drain + crush_garlic -> prepare_sauce
prepare_sauce -> finish_pasta
finish_pasta + prepare_mint -> finish_off_heat
```

`finish_off_heat` is the recipe completion requirement; serving is a separate kitchen action.

One burner means pot and pan heating cannot overlap. Mint and garlic preparation may overlap background water heating. In the initial recipe, `finish_pasta` includes active stirring and occupies the chef.

## Seafood-tomato task graph

```text
collect_ingredients -> boil_water -> cook_pasta_halfway -> reserve_water_and_drain
collect_ingredients -> prepare_seafood
collect_ingredients -> crush_garlic
collect_ingredients -> chop_parsley
reserve_water_and_drain + crush_garlic -> start_tomato_sauce -> simmer_tomato_sauce
simmer_tomato_sauce + prepare_seafood -> cook_seafood -> finish_pasta
finish_pasta + chop_parsley -> finish_off_heat
```

`simmer_tomato_sauce` is background work: it keeps the pan and burner but frees the chef.
Like lemon pasta, the pot is released before the pan is needed, so mixed orders cannot
deadlock on equipment.

Adding a menu means registering the recipe in `simulation/recipes.py` and mapping any new
task IDs in `frontend/src/scene/replayPresentation.ts`, plus its dish in
`frontend/src/data/menuPresentation.ts`. Fig prep uses `slice_figs`, `prepare_basil`
and `prepare_fig_sauce`; it follows the same pot-then-pan resource release pattern.
Priority-rule evolution
uses lemon-only synthetic cases. Historical prompt
comparison records are retained in `evaluation/results/`.

## Scheduling and customer conversation

`simulation/scheduler.py:Dispatcher` scores valid ready tasks, recomputes after
each start, serves finished dishes and respects equipment ownership. Cooking
rules belong in `Kitchen`; do not duplicate them in the renderer or host prompts.
Default priority is earliest deadline, then least remaining work.

`runtime/sessions.py` maps real time to simulated time for live service.
`agents/team.py` handles default conversation through OpenAI SDK waiters and a manager.
Waiters use `KitchenAdvisorAgent.as_tool()` for bounded preference/ingredient/wait-time
questions. The child is read-only; it does not take over the customer conversation.
Clear orders skip it. Estimate tools rehearse on copies of LiveKitchen, never the real queue.
Order-progress questions also use the advisor. The seated game presents consultation as
a table → kitchen pass → table visit; the reply waits in the client until the waiter
returns. `frontend/src/game/consultation.ts` owns these presentation stages.
`messages/progress` reports actual child-call start/completion/failure while the model
works; keep it separate from simulator replay events. Tips are a subtle rotating bar,
not preset request buttons; preserve free customer input.
`agents/orders.py:OrderDesk` holds validated order tools that `RestaurantTeam` inherits;
`agents/host.py` holds instructions, fallback replies and `create_host`. Live conversation uses only the OpenAI Agents SDK; do not restore the removed
ADK single-host path.
Keep authoritative kitchen/dining state outside model histories and isolated per session.
See `docs/restaurant-team.md`; do not restore LLM-driven cooking.

Do not restore a model-driven cooking loop or its old comparison/progress plumbing
as part of unrelated changes. Offline rule generation is distinct from service.

## Order intake

`scripts/run_local.py` accepts a menu and calls `Kitchen.add_order()`.
`POST /runs/{run_id}/orders` calls the same operation for an existing run while
holding its lock. Each run has an isolated kitchen. Intake records pending orders;
`POST /runs/{run_id}/execute` advances cooking with the selected policy and freezes
the run. `GET /runs/{run_id}/replay` returns every event and final order, including
served orders. New orders or repeated execution after a stop return `409`.
The priority scheduler can also accept scheduled arrivals at exact timestamps.
Do not require an LLM to create authoritative order records.

## Verification and development sequence

1. Inspect existing files and identify the next bounded exercise/change.
2. State the contract and acceptance criteria.
3. Implement or provide scaffolding according to the developer's request.
4. Run focused checks and report what actually ran.
5. Update relevant documentation when interfaces change.

Important checks: dependency rejection, resource conflicts, independent order progress, unchanged state on rejection, correct completion timestamps, simultaneous completions, resource release, and duplicate-task/serving prevention.

Run from the repository root with Python 3.12+. The scripted baseline verifies
background cooking plus preparation without provider calls:

```bash
PYTHONPATH=backend/src python3 scripts/run_local.py
```

For all offline suites, use the backend environment with both extras installed:

```bash
uv sync --project backend --extra agent --extra api --locked
backend/.venv/bin/ruff check .
PYTHONPATH=backend/src backend/.venv/bin/lint-imports
backend/.venv/bin/python scripts/run_tests.py
```

`.github/workflows/ci.yml` runs these, the scripted baseline, and the frontend
test and build on every pull request and push to `main`.

For focused unittest discovery:

```bash
PYTHONPATH=backend/src backend/.venv/bin/python -m unittest discover -s tests -v
```

Replace `tests` with `backend/tests` for the API. Use this configured interpreter rather than
assuming system Python has matching SDKs. Test counts belong in current test
output, not a permanent completion claim. Offline tests require no credentials.

Frontend checks run from `frontend/`: `npm ci`, then `npm run build`.
`npm test` (Node.js 22.18+) runs the replay reducer against fresh API output
using the backend virtual environment, without a running server or provider calls.
See root README for development servers and `docs/evaluation.md` for explicit
live commands. Do not run paid live experiments as routine offline verification.

## Remaining scope and limitations

- Live event streaming and delivery from pass to dining tables.
- Persistent storage, event streaming, production run lifecycle management.
- Inventory depletion, station breakdowns, quality/hold timing, spatial costs.
- Customer questions, supported order modifications, reviews,
  human play/cooperation.

Character movement remains visual presentation. Movement costs and spatial
planning require an explicit simulator extension. Evaluation measures changes;
it does not automatically train the live model. Priority-rule evolution selects
arithmetic dispatch rules separately from live dispatch.

## References

- Collab-Overcooked: https://github.com/YusaeMeow/Collab-Overcooked — reference for environment–agent boundaries and cooperative cooking, not a dependency or prescribed architecture.
- RestaurantGPT: https://github.com/PieroPaialungaAI/RestaurantGPT — reference for restaurant simulation and UI integration.
- OpenAI Agents SDK documentation: https://openai.github.io/openai-agents-python/ — verify SDK interfaces against the project's installed version.

Never copy external code or its instructions blindly. Preserve applicable licenses and avoid importing research-project complexity into the first milestone.
