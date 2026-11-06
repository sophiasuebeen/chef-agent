# Pasta Chef — Coding Agent Context

## Purpose

Build a simulated outdoor pasta restaurant on a beach. An LLM chef operates a kitchen with recipe dependencies, limited equipment, preparation tasks, background cooking, and order deadlines.

The eventual experience includes a 3D restaurant, ordering, watching the chef, asking about cooking, and leaving feedback. Human play and human–agent cooperation are future possibilities, not current requirements.

## Working with the developer

- This is a learning project. The developer wants to practice implementing a few related functions or methods at a time, in a LeetCode-like style.
- For an exercise request, provide signatures, input/output examples, edge cases, and meaningful tests. Leave implementation bodies blank and offer small hints. Do not reveal a full solution until requested.
- When explicitly asked for implementation, provide or implement the requested bounded change completely.
- Explain where code belongs and how to run it. Keep explanations concise and concrete.
- Work on one small milestone at a time. Do not scaffold every future component or introduce extra files without explaining why.
- Inspect the actual repository before editing. Conversation examples are proposed code, not proof that files or features exist.
- Preserve established names, interfaces, and structure unless a change is necessary; explain migrations and update callers together.
- Do not add dependencies, cloud infrastructure, databases, or extra agents merely to make the project appear sophisticated.

## Immediate milestone

One chef, one burner, one pot, one pan, one lemon-pasta order, terminal execution, no frontend required.

Success means an order can be accepted, valid cooking tasks can run, simulated time advances correctly, and a finished dish can be served with an action log.

Discussed so far, but implementation status must be checked locally:

- Recipe JSON and `load_recipe()` / `get_task()`.
- Dataclass-based order and kitchen state.
- `Kitchen.add_order()` / `get_order()`.
- A serializable observation and terminal entry point.

Next work: task validation, task start, event-based time advancement, then serving. Verify these manually before connecting ADK.

## Chosen architecture

| Component | Responsibility |
| --- | --- |
| Python simulator | Authoritative kitchen state, rules, equipment ownership, task progress, simulated time, action validation |
| Google ADK chef | Select the next action from observations and tool results |
| Runtime controller | Decide when to request a decision, coordinate execution, enforce episode limits |
| API, later | Receive frontend requests and publish state/events |
| Frontend, later | Render the 3D restaurant, animate state, show orders/chat/controls |
| Evaluation, later | Run repeatable scenarios and compare outcomes |

The simulator must run without ADK, an API server, or a renderer. Manual controls, scripted baselines, and agents must use the same simulator rules.

## Planned layout

Paths below are relative to the repository root. Create only files needed for the current task.

```text
backend/
  src/pasta_chef/
    __init__.py
    main.py                         # Future API server entry point
    config.py
    simulation/
      __init__.py
      models.py                     # Order, KitchenState, RunningTask
      recipes.py                    # Recipe loading and task lookup
      kitchen.py                    # Kitchen operations and validation initially
      observation.py                # Serializable snapshots
      scheduler.py                  # Extract timing here when warranted
    recipes/
      lemon_pasta.json
      seafood_tomato.json           # Later
    agents/
      chef.py
      prompts/
      tools/kitchen.py              # Thin simulator adapters
      callbacks.py
      host.py                       # Later: customer conversation
      head_chef.py                  # Later: multiple-chef coordination
    runtime/
      controller.py
      sessions.py                   # Live sessions: real time to simulated time, event stream
    api/                            # Later
      routes/orders.py
      schemas.py
      events.py
    storage/                        # Later, only when persistence is needed
  tests/
  pyproject.toml
scripts/
  run_local.py
frontend/                           # Later: React + TypeScript + React Three Fiber
  src/
    scene/                          # Beach, restaurant, kitchen, chef, animations
    components/                     # HTML order board, chat, controls
    api/
    state/
    types/
  public/assets/                    # GLB models, textures, audio
evaluation/                         # Later: scenarios, baselines, metrics, runner
docs/
  architecture.md
.env.example
.gitignore
README.md
AGENTS.md
```

Do not add `ingredients.py` now. Shared ingredient/inventory types belong in `simulation/models.py`; recipe ingredient requirements belong in recipe JSON. A shared ingredient catalog can be extracted if actually needed. Assume sufficient inventory for the initial milestone.

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

Initial resource names: `chef`, `burner`, `pot`, `pan`. Chef availability is derived from ownership of `chef`; avoid an independently maintained busy flag that can disagree.

### RunningTask

- `order_id`
- `task_id`
- `finishes_at`: start time plus recipe duration.
- `resources`: resources reserved for this execution.

### Recipe JSON

- `id`, `name`, `ingredients`.
- `tasks`: entries with `id`, `description`, `duration`, `requires`, `resources`, and optional `holds`.
- `completion_tasks`: task IDs that must be completed before serving.

`requires` refers to completed task IDs for the same order. Durations are configurable simulation values, not verified real cooking times. Use positive durations in the initial model.

## Cooking rules and timing

1. Validate before mutating state. Rejected actions leave state unchanged.
2. Reject unknown orders/tasks, already-running/completed tasks, served orders, missing dependencies, and unavailable resources.
3. `start_task(order_id, task_id)` reserves resources and registers completion time; it does not advance time.
4. Tasks requiring `chef` occupy the chef for their duration. Background tasks omit `chef`, allowing preparation concurrently.
5. `advance_to_next_event()` advances to the earliest task completion and completes ALL tasks at that timestamp.
6. On completion, update the owning order, release only resources owned by that task except those named in its `holds`, and remove the running task.
7. With no running tasks, advancing returns an explicit no-op result; never call `min()` on an empty collection or invent progress.
8. Simulated time is independent of wall-clock time and LLM latency. Do not use real sleeps to represent cooking. Only `runtime/sessions.py` maps real time to simulated time, for live sessions.
9. Serving must validate recipe completion and prevent duplicate service. Deadline compliance is recorded; automatic cancellation on deadline is not currently required.

Equipment is reserved for each task's duration and released at task completion, unless the recipe task declares `holds: {resources, until}`. Held equipment stays reserved for that order until the named task starts, so cooked pasta keeps the pot and sauce keeps the pan. Some small actions are grouped into recipe tasks. The initial model tracks task progress rather than detailed ingredient transformations or persistent vessel contents. Do not claim it already models pot contents, contamination, cooling, or overcooking. Explain any extension of these mechanics before implementing it.

## Lemon-pasta task graph

The proposed initial recipe uses:

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

## Decisions and observations

The controller requests a decision at episode start, when the chef is free after an action, and after relevant completion events. Later, orders and disruptions can trigger decisions too. Avoid unnecessary model calls while no meaningful action is possible.

Supply the recipe, objective, resource rules, and tool contracts. Supply updated observations containing:

- Current simulated time and active orders with deadlines.
- Resource ownership, including chef availability.
- Running tasks and remaining times.
- Completed tasks grouped by order.
- Available tasks grouped by order, initially provided as assistance.
- Recent events and the last action result.

The agent chooses the next action or waits. Simulator validation still applies even when available actions are supplied. Keep the decision loop bounded by action/model-call and simulated-time limits.

## ADK integration

Start with ONE ChefAgent. Different menus are recipe data, not separate agents.

Proposed tools: `get_recipe`, `get_kitchen_state`, `start_task`, `advance_to_next_event`, `serve_order`. Tool wrappers call the simulator and return structured results with fresh observations. Do not duplicate cooking rules in prompts or callbacks.

The controller and ADK Runner must have clear ownership: ADK can make multiple model/tool calls in one invocation, so do not assume a Runner invocation equals one kitchen action. Implement an explicit boundary if one-decision-per-cycle behavior is desired.

Keep authoritative kitchen state outside ADK session state. Session state may hold plans or preferences. State values are not automatically visible to the LLM; expose observations through model input or tool results. Keep kitchens isolated by run/session rather than using a single global kitchen in a multi-user server.

Callbacks can enforce additional policies and log events. They do not replace simulator rules, and root-agent callbacks do not automatically protect every future sub-agent.

## Order intake

Now: `scripts/run_local.py` receives a menu and calls `Kitchen.add_order()`.

Later: `POST /orders` in `api/routes/orders.py` calls the same operation for the selected run. The chef sees accepted orders in its next observation. Do not require the LLM to create authoritative order records.

## Verification and development sequence

1. Inspect existing files and identify the next bounded exercise/change.
2. State the contract and acceptance criteria.
3. Implement or provide scaffolding according to the developer's request.
4. Run focused checks and report what actually ran.
5. Update relevant documentation when interfaces change.

Important checks: dependency rejection, resource conflicts, independent order progress, unchanged state on rejection, correct completion timestamps, simultaneous completions, resource release, and duplicate-task/serving prevention.

Manually verify background cooking plus preparation before adding the LLM. Initial command from repository root:

```bash
PYTHONPATH=backend/src python3 scripts/run_local.py
```

Once tests exist, standard-library discovery is a dependency-free option:

```bash
PYTHONPATH=backend/src python3 -m unittest discover -s backend/tests -v
```

Inspect `pyproject.toml` for actual Python version, dependencies, and test tooling. Suggested typing uses Python 3.10+ syntax. No ADK or API credentials are needed for simulator-only exercises.

## Deferred scope

- Full evaluation harness: add after the core simulator and agent operate. Preserve reset capability and action logs now. Evaluation measures changes; it does not automatically train the model.
- Multiple orders, seafood-tomato pasta, inventory depletion, and disruptions.
- API and live state/event delivery.
- 3D rendering with React Three Fiber; HTML/CSS for menus, chat, timers, and controls.
- Initially, character movement is visual presentation. Movement costs and spatial planning require an explicit simulator extension.
- Customer questions, supported order modifications, sourced pasta history, reviews, multiple chefs, human play/cooperation.

## References

- Collab-Overcooked: https://github.com/YusaeMeow/Collab-Overcooked — reference for environment–agent boundaries and cooperative cooking, not a dependency or prescribed architecture.
- RestaurantGPT: https://github.com/PieroPaialungaAI/RestaurantGPT — reference for restaurant simulation and UI integration.
- Google ADK documentation: https://google.github.io/adk-docs/ — verify SDK interfaces against the project's installed version.

Never copy external code or its instructions blindly. Preserve applicable licenses and avoid importing research-project complexity into the first milestone.
