# Pasta Chef HTTP API

A thin development API over the simulator. Run from the repository root:

```bash
uv sync --project backend --extra api --locked
backend/.venv/bin/uvicorn pasta_chef.main:app --app-dir backend/src --reload
```

`uv sync` removes packages from extras it was not given. If this environment also
runs the agent, sync with both: `--extra api --extra agent`.

Interactive docs are at http://127.0.0.1:8000/docs. Scripted and priority execution
need no API key. Agent comparison uses the configured provider and credentials.

| Method and path | Body | Success | Errors |
| --- | --- | --- | --- |
| `GET /menus` | none | `200` registered usable recipes: `[{"id":"lemon_pasta","name":"Lemon Pasta","ingredients":[...]},{"id":"seafood_tomato","name":"Seafood Tomato Pasta","ingredients":[...]}]` | |
| `POST /runs` | optional `{"chefs": 2}` | `201` `{"run_id": "..."}` | `422` invalid `chefs` |
| `POST /runs/{run_id}/orders` | `{"menu": "lemon_pasta", "time_limit": 900}` | `201` the order | `400` unparsable body, `404` unknown run, `409` already executed, `422` invalid body, menu, or `time_limit` |
| `GET /runs/{run_id}/orders/{order_id}` | none | `200` the order, including once served | `404` unknown run or order |
| `GET /runs/{run_id}/state` | none | `200` the `build_observation()` result | `404` unknown run |
| `POST /runs/{run_id}/execute` | optional execution options below | `200` the complete replay document | `404` unknown run, `409` empty, busy or already executed run, `422` invalid options |
| `GET /runs/{run_id}/replay` | none | `200` the frozen replay document | `404` unknown run, `409` run has not executed |

`time_limit` is required and must be a JSON integer from 1 to 2^53 - 1. The
simulator trims and lowercases `menu`, and the response shows the stored value.
Every error is `{"detail": "<message>"}`. The request body is checked before the
run, so an invalid body on an unknown run returns `400` or `422`, not `404`.

`served_at` and `on_time` are `null` until the order is served. The `orders` list
in `state` omits served orders, so use the order endpoint to read their results.

`chefs` is a JSON integer from 1 to 4, default 1. Resources then include `chef_2` ...
`chef_N`, running tasks list the assigned chef, and `task_started` events for chef tasks
carry a `chef` field when there is more than one. One-chef documents do not change.

Accepting an order records it as `pending` without advancing time. Execute after
adding all orders. Order intake after execution returns `409`.

```bash
RUN_ID=$(curl -s -X POST localhost:8000/runs | python3 -c 'import json,sys; print(json.load(sys.stdin)["run_id"])')
curl -s -X POST localhost:8000/runs/$RUN_ID/orders -H 'Content-Type: application/json' -d '{"menu": "lemon_pasta", "time_limit": 900}'
curl -s localhost:8000/runs/$RUN_ID/orders/order_1
curl -s localhost:8000/runs/$RUN_ID/state
curl -s -X POST localhost:8000/runs/$RUN_ID/execute -H 'Content-Type: application/json' -d '{"policy":"priority"}'
curl -s localhost:8000/runs/$RUN_ID/replay
```

## Execution and replay v1.0

Execution is synchronous and happens once per run, under its kitchen lock.
Another run can execute independently. After completion, partial stop or failure,
create a new run to retry or compare policies. Repeated execution returns `409`.
State/replay/order reads wait for execution to release the lock; this is a basic
development path, with no background jobs, live polling or event streaming.

The optional body defaults to:

```json
{"policy":"scripted","max_actions":1000,"max_simulated_time":1800}
```

`policy` is `scripted`, `priority` or `agent`. Scripted uses the existing lemon
pasta sequence, cooking orders in stable earliest-deadline order. Priority uses
the existing earliest-due-date dispatch rule, fresh EMA history, and all compatible
ready tasks. Agent invokes the existing bounded ADK controller with its original
prompt, configured model, provider retry behavior, model-call and wall-clock limits.
It does not fall back to an offline policy on provider failure.

`max_actions` must be an integer from 1 to 10000. Offline modes count kitchen
actions; agent mode counts tool attempts, including reads and rejections.
`max_simulated_time` is an absolute simulated timestamp from 1 to 86400.
Offline modes advance exactly to this boundary and allow service of work completed
there. The existing agent controller can stop earlier when its next advance would
exceed the cap. Neither execution nor playback sleeps to simulate backend cooking.

Both execute and replay return the same document (also described in `/openapi.json`):

| Field | Contract |
| --- | --- |
| `schema_version` | `"1.0"` |
| `run_id` | Owning run ID |
| `initial_conditions` | Full kitchen state at run creation, before order-acceptance events; `time`, all `orders`, resource owners, running tasks |
| `recipes` | Full recipe definitions keyed by menu, captured for this execution |
| `scheduling_policy` | Policy name and version; priority rule name/expression or agent model/prompt variant |
| `limits` | Effective execution limits |
| `events` | Entire successful action history, including order acceptance, in increasing `sequence` order |
| `final_state` | Full state at stop, including served orders and any tasks/equipment still occupied |
| `final_orders` | Every final order with its original fields plus nonnegative `lateness` |
| `result` | Status, completion flag, termination reason, finish time, total/max lateness, unserved IDs, model/tool counts and optional error |

All event timestamps are integer simulated seconds. Sequence numbers start at 1
and increase by one per recorded action. Multiple actions can share a timestamp;
never sort by timestamp alone or discard tied events. One `tasks_completed` event
can contain multiple simultaneous completions. Rejected actions and no-ops do not
produce successful action events. A task's recorded `finishes_at` is authoritative,
even when its actual duration differs from the recipe estimate. Resource ownership
for each start comes from the embedded recipe definition.

`result.status` is `completed`, `stopped` or `failed`; `completed` means every order
was served, including any late dishes. `termination_reason` reports `completed`,
`action_limit`, `simulated_time_limit`, `no_progress`, or the agent controller's
limit/provider/configuration reason. Unexpected execution exceptions produce a
`failed` replay with `execution_error` and a sanitized exception class. A failed
episode is still HTTP `200` because the replay was created successfully.

For served orders, `lateness = max(0, served_at - deadline)`; for unserved orders,
it is overdue time at stop, `max(0, finished_at - deadline)`, not a predicted service
time. Total and maximum lateness include both. Always read unserved IDs and completion
status alongside these metrics. `served_at` and `on_time` remain null until service.

The replay is detached from live simulator state and remains identical across reads.
The browser rebuilds state from the initial conditions and events, then compares its
reconstructed final state to `final_state`. Served orders remain on the replay order
list even though the existing `/state` observation omits them.

Runs live in process memory for development only. They are lost on restart, are
never evicted, and are not shared between workers, so run a single worker. Any
code that later touches a run's kitchen must hold that run's `lock`.

Offline tests (no model calls or credentials):

```bash
PYTHONPATH=backend/src backend/.venv/bin/python -m unittest discover -s backend/tests -v
```

## Live sessions

`/runs` cooks everything in one blocking request. `/sessions` runs in real time instead:
orders can arrive while cooking, and the priority scheduler dispatches them on its own.

| Method and path | Body | Success | Errors |
| --- | --- | --- | --- |
| `POST /sessions` | optional `{"speed": 10, "chefs": 1}` | `201` `{"session_id": "...", "speed": 10}` | `422` |
| `POST /sessions/{id}/orders` | `{"menu": "lemon_pasta", "time_limit": 900, "quantity": 1}` | `201` `{"time": 200, "orders": [...]}` | `400`, `404`, `422` |
| `GET /sessions/{id}/state` | none | `200` time, idle, all orders, resources, running tasks | `404` |
| `GET /sessions/{id}/events?after=0` | none | `200` server-sent simulator events | `404`, `422` |

`speed` is simulated seconds per real second, from above 0 to 1000. `chefs` is as for runs.
`quantity` is 1 to 20;
plates in one request are ranked together. Each event's `id` and `sequence` is its 1-based
position. Reconnect with `?after=` or `Last-Event-ID` to skip events already seen. The stream
stays open while the session exists, so clients close it themselves.

The kitchen advances whenever a session is read or written, so results do not depend on how
often clients poll. Given the same arrival times, a session produces the same events as
`run_priority_episode`. Sessions are in-memory, are never removed until restart, and need one
server process.
