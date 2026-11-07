# Architecture

## Cooking and customer conversation

`simulation/kitchen.py` owns cooking state, recipe dependencies, equipment,
chef assignment, completion events and service validation. `observation.py`
returns detached snapshots. The simulator imports only the standard library.

`scripts/run_local.py` accepts an order and runs either the scripted baseline
or the priority dispatcher. Neither mode loads credentials or calls an LLM.
`simulation/scheduler.py:Dispatcher` scores ready tasks across orders, starts
compatible work, and serves completed dishes. Recipe validation remains in
`Kitchen`. Batch episodes enforce action and simulated-time limits.

`runtime/sessions.py` uses the same dispatcher for live sessions, mapping real
time to simulated time and exposing an event stream. The legacy chef-hold API can
reserve a chef; conversations with the default waiter team do not hold chefs.

`agents/team.py` defines OpenAI SDK `ManagerAgent`, `WaiterAgent_A` and `WaiterAgent_B`.
`agents/kitchen_advisor.py` supplies a read-only `KitchenAdvisorAgent`, invoked through
the waiters' `ask_kitchen` agent tool. Its findings return to the calling waiter.
Waiters handle ordinary conversation and validated order tools; `call_manager` is
an SDK handoff for exceptions. `runtime/restaurant.py` owns table assignment,
order ownership, greeting tasks, pickup and delivery. Cooking remains in Dispatcher.
Each table has isolated conversation history and scoped order-status tools.
`agents/host.py` retains shared menu/order validation and the legacy ADK host;
its default factory now creates the OpenAI team. `config.py` loads local credentials.
See [restaurant team](restaurant-team.md) for the complete hierarchy and limits.

## Priority-rule evaluation

`evaluation/evolve.py` evaluates arithmetic priority rules against synthetic
arrivals and duration variation. Fixture generation is offline; `--live` explicitly
opts into Gemini rule generation. Models never run during priority-based service.
`evaluation/metrics.py` computes deadline outcomes. See
[priority scheduling](priority-scheduling.md) and [evaluation](evaluation.md).

The previous LLM cooking controller, prompt comparison, tool wrappers and episode
progress logs have been removed. Offline tests are grouped by simulator, metrics,
provider behavior, scheduling, live sessions and API contracts.

## HTTP API and frontend

`main.py` creates the FastAPI application. `api/store.py` keeps isolated kitchens
and locks per run in process memory. Routes create a run, accept/read orders,
read simulator state, execute once, and retrieve a frozen replay. Execution holds
only the selected run's lock and synchronously invokes the shared scripted
baseline (`simulation/scripted.py`) or priority scheduler.
Runs disappear on restart and are not shared across workers.
See [the API guide](../backend/src/pasta_chef/api/README.md) for the HTTP contract.
`api/events.py` assembles replay schema v1.0: initial conditions, embedded recipes,
policy/version, complete sequenced simulator log, every final order and stop metrics.
`Kitchen._record()` assigns sequence numbers at append time so equal-timestamp
actions retain their ordering. The separate session API streams live events.

`frontend/src/GameApp.tsx` is the default game. `?live` opens the live kitchen
test page; `?replay` opens `ReplayApp.tsx` for batch execution and replay. Vite forwards
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
remains local in Zustand. The default game connects live sessions, chat and
table delivery.

### Game interactions

The game offers the existing golden/noon/dusk/night lighting presets and remembers the selected time locally. Music volume opens from the speaker icon. A disconnected event stream uses a small status indicator instead of a persistent text label.

Ready orders can be picked up at the pass with E, carried by the player, and placed at a nearby unoccupied seat's plate slot with E. A placed dish can be picked up again. Readiness is derived from backend `order_served` events; plate locations are presentation state for the current browser session and do not change cooking or deadline results. Demo food is hidden during play.

Expanded game sessions use three pot and three pan stations, each with its own burner. Recipes continue to request generic resources, while the simulator assigns concrete unit names and records them in task events. The pantry displays the union of registered menu ingredients; stock remains unlimited, as in the simulation.

Players can press E near a chair or banquette seat to sit facing its table, then press E to stand at their previous walkable floor position. Seated players can turn the camera but cannot walk or click to move. Carrying a dish keeps placement as the primary interaction; with empty hands, a nearby seat takes priority over picking a dish back up from the table. Chair positions and orientation come from the shared layout.
