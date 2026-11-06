# Architecture

## Terminal execution path

1. `scripts/run_local.py` parses the menu, creates one `Kitchen`, and calls
   `Kitchen.add_order()`. Order intake is deterministic and never delegated to
   the model. The default mode invokes an explicit scripted baseline.
2. Agent mode loads `.env` and configurable model/limits through
   `backend/src/pasta_chef/config.py`, then invokes
   `backend/src/pasta_chef/runtime/controller.py:run_agent_episode()`.
3. The controller creates one in-memory ADK session, one Runner, and one
   `ChefAgent` through `backend/src/pasta_chef/agents/chef.py`. The model receives
   the recipe, objective, tool contracts, resource rules and fresh observation.
   OpenAI model names (such as openai/gpt-4o) use ADK’s LiteLLM adapter;
   Gemini model names use ADK’s native Gemini adapter. Root .env is loaded
   before either adapter is initialized. The --model option overrides CHEF_MODEL.
4. The model chooses functions exposed by
   `backend/src/pasta_chef/agents/tools/kitchen.py:KitchenTools`. These instance
   methods refer to this episode's kitchen. They call the simulator and return
   structured results plus a new observation. Rejections do not alter kitchen
   state. They do consume the tool-attempt budget.
5. `backend/src/pasta_chef/simulation/kitchen.py` validates and executes starts,
   completes every task at the earliest event, releases resources, and serves
   only a completed order. `models.py` holds the dataclasses and action log;
   `recipes.py` loads registered files from `recipes/`. `observation.py` builds detached,
   serializable snapshots using the same task validation as actual starts.
6. After a tool round, ADK's `skip_summarization` callback returns control to the
   controller. A round may contain multiple tool calls, each budget checked.
   Counts persist across Runner invocations. Text-only claims cannot serve a
   dish. When nothing is startable or ready to serve, the controller advances
   pending events without calling the model. It does not choose between cooking
   tasks. With `skip_forced_moves` (evaluation only), it also serves finished
   orders and starts a lone task of the last active order, logged as `controller`.
7. The controller exits successfully only when all accepted orders are served.
   `serve_order()` records service time and deadline compliance. The terminal
   prints the action log and final observation; failures exit nonzero.

Limits include total model calls, tool attempts (reads and rejected actions
included), simulated timestamp, and wall-clock episode time. Every wrapper
checks the tool budget before execution; advancing past the simulated bound is
rejected before time changes. A model callback bounds calls across invocations,
ADK RunConfig also caps each invocation, and asyncio bounds episode duration.
No cooking uses wall-clock sleeps. Existing simulator state remains available
in the final observation after failure, rather than pretending to finish.

Simulator imports and scripted/priority execution remain independent of
credentials and SDK installation. Package installation currently includes ADK
as a required dependency in `backend/pyproject.toml`; the `agent` extra adds
LiteLLM and python-dotenv. Authoritative kitchen
state lives outside ADK session state. Reset replaces it with a fresh state.
No API server, storage service, frontend, or second agent is part of this path.

The contract is in `docs/backend-contract.md`. Mocked orchestration tests live
in `tests/test_agent_workflow.py`; the live smoke test is the explicit terminal
command in README.md and is not part of unittest discovery.

`evaluation/run.py` reuses this controller for each prompt/repetition, with
`prompt_variant="original"` (the default) or `"deadline"`. `agents/chef.py`
preserves the original instruction and appends the deadline goal only for the
second variant. `controller.py` adds a structured `termination_reason` to its
existing result; EpisodeLimit carries the reason without changing any limit.
The prompt comparison uses the same simulator, recipe durations, resources
and task dependencies for both variants. `evaluation/metrics.py` computes deadline outcomes separately
from the controller's existing all-served success condition.


## Model context, retries and progress

`agents/chef.py` removes old tool-result observations from a copy of the model
history and appends the current kitchen observation before every model call.
Past action results and rejections stay visible; stored session history is not
mutated. OpenAI requests disable parallel tool calls and LiteLLM's own retries.

`agents/retrying_llm.py:RetryingLlm` wraps both the LiteLLM and Gemini adapters.
It retries eligible 429/500/502/503/504 failures up to five times, honoring a
provider retry delay when available or using exponential backoff from 2 seconds,
capped at 60 seconds per wait. Insufficient credit/daily-quota failures are not
retried; a response already yielded is never replayed after an error. Retries
belong to the same logical model call and do not reset episode budgets. Backoff
waits count toward the wall-clock timeout. Failures remain explicit; there is
no scripted fallback.

`runtime/progress.py:EpisodeProgress` tracks model requests/responses, tokens,
tool outcomes, retry backoff, and the termination reason. The controller starts
a heartbeat task and cancels it on exit. It reports the current waiting phase
every 10 seconds; lack of heartbeats can indicate that the event loop is blocked.
Terminal agent mode and `evaluation.run` call `enable_progress_logs()` to emit
these updates to stderr, keeping stdout available for results. Provider retry
diagnostics use an allowlist rather than raw provider error text. Structured
model/tool/retry details also appear in each episode's `decision_log`.

## Priority scheduling and evaluation

`simulation/scheduler.py` provides a separate local dispatch loop with bounded
arithmetic priority rules, completed-duration EMA history and scheduled arrivals.
It calls the same kitchen validators and uses `advance_to_next_event(until=...)`
to stop at arrival/time boundaries. Optional `Kitchen(duration_sampler=...)`
adds duration uncertainty without editing recipes. Neither scripted service nor
priority dispatch calls a model. `evaluation/evolve.py` generates and scores
priority rules offline, using fixture candidates by default or explicitly
requested live Gemini generation. See [priority scheduling](priority-scheduling.md).

`evaluation/run.py` compares live prompt variants through the existing agent
controller and runs a credential-free scripted baseline. Metrics distinguish
all-served execution from on-time service. Commands, metric definitions and
historical experiment results are in [evaluation.md](evaluation.md).

## HTTP API and frontend

`main.py` creates the FastAPI application. `api/store.py` keeps isolated kitchens
and locks per run in process memory. Routes create a run, accept/read orders,
read simulator state, execute once, and retrieve a frozen replay. Execution holds
only the selected run's lock and synchronously invokes the shared scripted
baseline (`simulation/scripted.py`), priority scheduler, or existing agent controller.
Runs disappear on restart and are not shared across workers.
See [the API guide](../backend/src/pasta_chef/api/README.md) for the HTTP contract.
`api/events.py` assembles replay schema v1.0: initial conditions, embedded recipes,
policy/version, complete sequenced simulator log, every final order and stop metrics.
`Kitchen._record()` assigns sequence numbers at append time so equal-timestamp
actions retain their ordering. Live event streaming is not implemented.

`frontend/src/ReplayApp.tsx` is the default order-and-replay page. Vite forwards
`/api` requests to the local API. `replay.ts` reconstructs full state from the
initial snapshot, embedded recipe resources and events through a timestamp/sequence
cursor. It uses recorded finish times rather than recalculating durations. Seeking
rebuilds from the beginning; it never mutates the replay or invokes cooking rules.
The final reconstructed state is checked against the backend snapshot. Browser
wall-clock timing only controls presentation speed.

The same `position.time` and `position.sequence` feed
`scene/replayPresentation.ts:kitchenFrame()`. It projects recorded starts,
current running tasks and service events into `KitchenFrame`, which is passed
to the existing `BeachRestaurantScene` as optional `replayFrame`. Static restaurant
zones are memoized. Character, flame, drain and steam transforms are functions of
this frame, never an independently advancing renderer clock. Pause freezes them;
seeking reconstructs their appearance without carrying future state backward.
Dynamic shadows are invalidated by both timestamp and sequence.

`scene/kitchen/KitchenReplay.tsx` uses the existing station positions/chef spots:
collect → pantry; mint/garlic → prep; water/pasta/drain → boil; sauce/finish pasta
→ sauce; finish off heat → plating; service → pass. Every running task controls
its equipment independently from the chef, so unattended pot heating persists.
The chef follows the task that currently owns the chef resource. An instantaneous
service event can display a pass ticket without interrupting another order's
resource-owning chef task. Completed service dishes persist at pass until seeking
before their sequence; up to six physical plates are shown, while all served
orders remain in the order list and pass count.

`scene/characters/Chef.tsx` builds an articulated procedural character: roughly
seven head lengths without the toque, chest-length black straight hair, white
jacket/toque, navy piping/buttons/apron, dark trousers and a lemon accent.
Independent shoulders, elbows, wrists, hips and knees express collection,
chopping, crushing, stirring, draining, plating and serving. Brief 0.8 simulated
second transitions between station spots are visual interpolation within recorded
tasks; they add no travel cost, cooking duration or simulator events. Service has
no fabricated duration and holds its presentation pose until the next chef action.
These effects do not model ingredient chemistry, vessel contents or fluid physics.

The kitchen camera shows the entire workspace. The added chef close-up preset
follows the active station using the existing camera rig. Camera navigation can
ease independently of playback; it never changes the replay cursor. A failed
WebGL scene has an error boundary so replay controls and final-state checks remain
usable. Offline frontend tests build fresh API fixtures for both policies,
simultaneous completions and partial stops, then verify scene presentation as
well as replayed state.

At `?scene`, the lazily loaded existing `App.tsx` mounts `BeachRestaurantScene`
with camera, time-of-day and debug controls and an idle chef/kitchen. Scene state
remains local in Zustand. Live event streaming, table delivery and chat remain
future integration work.
