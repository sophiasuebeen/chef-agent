# Pasta Chef — Coding Agent Context

## Purpose

Build a simulated outdoor pasta restaurant on a beach. An LLM chef operates a kitchen with recipe dependencies, limited equipment, preparation tasks, background cooking, and order deadlines.

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
`lemon_pasta` and `seafood_tomato` are the registered menus.

Terminal modes in `scripts/run_local.py` are `scripted`, `agent`, and `priority`.
The single ADK ChefAgent runs through a bounded controller with tool wrappers,
provider retries, decision logs, and progress heartbeats. Evaluation compares
prompt variants and supports offline priority-rule evolution. The priority
scheduler supports exact-time arrivals and completed-duration EMA history;
`Kitchen(duration_sampler=...)` optionally varies task duration at start.
`Kitchen(chefs=n)` (1-4, default 1) makes each chef a real resource; the API and
the order panel's 셰프 수 input pass it through.

The development HTTP API creates in-memory runs, accepts/reads orders, exposes
state, lists registered usable recipes through `GET /menus`, executes scripted/priority/agent episodes once, and returns frozen versioned
replays. The React frontend accepts orders and reconstructs kitchen replay state
with play/pause/speed/event/time seeking and a backend final-state check. The same
cursor drives the existing 3D kitchen: procedural articulated chefs, per-station
cooking actions, independent heating/steam and sequenced service dishes. The
scene development view remains available at `?scene`.

Do not treat completed features as future milestones. Inspect code and tests
before choosing the next bounded change. Current extensions and limitations
are documented in `docs/`, not a fixed backlog in this file.

## Architecture and repository layout

| Component | Responsibility |
| --- | --- |
| Python simulator | Authoritative state, cooking rules, equipment, timing, validation |
| Google ADK chef | Select actions from fresh observations and tool results |
| Runtime controller | Coordinate decisions, enforce limits, report progress |
| HTTP API | Isolated in-memory runs, order intake, execution and frozen replays |
| Frontend | Order intake, deterministic replay controls and synchronized 3D kitchen |
| Evaluation | Repeatable scenarios, prompt comparisons, metrics, rule evolution |

Simulator imports and scripted/priority execution do not require ADK, an API
server, or a renderer. However, `backend/pyproject.toml` currently declares
`google-adk` as a required package dependency; the `agent` extra also provides
LiteLLM and python-dotenv. The `api` extra provides FastAPI, Uvicorn and HTTPX.
Do not describe package installation as dependency-free or change dependencies
as part of a documentation-only task.

Paths below are relative to the repository root:

```text
backend/
  src/pasta_chef/
    main.py                         # FastAPI application
    config.py                       # Environment, model and episode limits
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
    agents/
      chef.py                       # ChefAgent factory and prompt variants
      retrying_llm.py                # Bounded provider retries
      tools/kitchen.py              # Simulator adapters, budgets and logs
      callbacks.py                  # Placeholder
      host.py                       # Customer-facing LLM host: conversation and validated order tools
      head_chef.py                  # Placeholder
    runtime/
      controller.py                 # Bounded ADK episode loop
      progress.py                   # stderr progress and heartbeat
      sessions.py                   # Live sessions: real time to simulated time, event stream
    api/
      README.md                     # HTTP setup and endpoint contract
      routes/                       # Runs, order intake/read, state read
      store.py                      # In-memory per-run kitchen and lock
      schemas.py
      errors.py
      events.py                     # Execution dispatch and replay document assembly
  tests/test_api.py
  tests/test_execution.py            # Execution, lifecycle, replay and controller delegation
  README.md
  pyproject.toml
  uv.lock
tests/
  test_agent_workflow.py             # Simulator, wrappers, mocked ADK, retries/progress
  test_evaluation.py
  test_priority_scheduler.py
scripts/
  run_local.py
  check_two_orders.py               # Explicit live two-order smoke test
  run_tests.py                      # Combined offline test report
frontend/
  src/                              # Replay UI, scene, components, data and scene state
    scene/replayPresentation.ts     # Pure time/sequence → chef and station presentation
    scene/characters/Chef.tsx       # Procedural articulated reference chef
    scene/kitchen/KitchenReplay.tsx # Equipment, station effects and pass dishes
  public/assets/                    # Models, textures, attribution
evaluation/
  run.py                            # Prompt comparison runner
  metrics.py
  evolve.py                         # Offline priority-rule evolution
  scenarios/
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
task IDs in `frontend/src/scene/replayPresentation.ts`. `evaluation/` stays lemon-only so
recorded prompt comparisons remain comparable.

## Decisions and observations

The agent controller requests decisions while startable tasks or service actions exist, and advances pending events without a model call when neither exists. Dynamic arrivals are implemented in the separate priority scheduler; live disruptions require an extension. Avoid unnecessary model calls while no meaningful action is possible.

Supply the recipe, objective, resource rules, and tool contracts. Supply updated observations containing:

- Current simulated time and active orders with deadlines.
- Resource ownership, including chef availability.
- Running tasks and remaining times.
- Completed tasks grouped by order.
- Available tasks grouped by order, initially provided as assistance.
- Recent events and the last action result.

The agent chooses the next action or waits. Simulator validation still applies even when available actions are supplied. Keep the decision loop bounded by action/model-call and simulated-time limits.

## ADK integration

The current runtime uses ONE ChefAgent, which directs every chef in the kitchen. Different menus are recipe data, not separate agents.

Implemented tools: `get_recipe`, `get_kitchen_state`, `start_task`, `advance_to_next_event`, `serve_order`. Tool wrappers call the simulator and return structured results with fresh observations. Do not duplicate cooking rules in prompts or callbacks.

The controller and ADK Runner must have clear ownership: ADK can make multiple model/tool calls in one invocation, so do not assume a Runner invocation equals one kitchen action. Implement an explicit boundary if one-decision-per-cycle behavior is desired.

Keep authoritative kitchen state outside ADK session state. Session state may hold plans or preferences. State values are not automatically visible to the LLM; expose observations through model input or tool results. Keep kitchens isolated by run/session rather than using a single global kitchen in a multi-user server.

Callbacks can enforce additional policies and log events. They do not replace simulator rules, and root-agent callbacks do not automatically protect every future sub-agent.

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
backend/.venv/bin/python scripts/run_tests.py
```

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
arithmetic dispatch rules separately from live agent planning.

## References

- Collab-Overcooked: https://github.com/YusaeMeow/Collab-Overcooked — reference for environment–agent boundaries and cooperative cooking, not a dependency or prescribed architecture.
- RestaurantGPT: https://github.com/PieroPaialungaAI/RestaurantGPT — reference for restaurant simulation and UI integration.
- Google ADK documentation: https://google.github.io/adk-docs/ — verify SDK interfaces against the project's installed version.

Never copy external code or its instructions blindly. Preserve applicable licenses and avoid importing research-project complexity into the first milestone.
