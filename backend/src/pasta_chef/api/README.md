# Pasta Chef HTTP API

A thin development API over the simulator. Run from the repository root:

```bash
uv sync --project backend --extra api --locked
backend/.venv/bin/uvicorn pasta_chef.main:app --app-dir backend/src --reload
```

`uv sync` removes packages from extras it was not given. If this environment also
runs customer conversation, sync with both: `--extra api --extra agent`.

Interactive docs are at http://127.0.0.1:8000/docs. Scripted and priority execution
need no API key. Customer conversation uses the configured provider and credentials.

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

`policy` is `scripted` or `priority`. Scripted uses recipe-ordered cooking in
stable earliest-deadline order. Priority dispatches ready tasks across orders with
an earliest-due-date rule and fresh EMA history. Neither policy calls an LLM.
The removed `agent` policy returns validation error `422`.

`max_actions` is an integer from 1 to 10000 and counts kitchen actions.
`max_simulated_time` is an absolute simulated timestamp from 1 to 86400.
Both policies advance exactly to this boundary and allow service of work completed
there. Neither execution nor playback sleeps to simulate backend cooking.

Both execute and replay return the same document (also described in `/openapi.json`):

| Field | Contract |
| --- | --- |
| `schema_version` | `"1.0"` |
| `run_id` | Owning run ID |
| `initial_conditions` | Full kitchen state at run creation, before order-acceptance events; `time`, all `orders`, resource owners, running tasks |
| `recipes` | Full recipe definitions keyed by menu, captured for this execution |
| `scheduling_policy` | Policy name and version; priority rule name/expression |
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
`action_limit`, `simulated_time_limit`, or `no_progress`. Unexpected execution exceptions produce a
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
| `POST /sessions/{id}/chef-hold` | `{"seconds": 60}` | `200` hold status | `400`, `404`, `422` |
| `DELETE /sessions/{id}/chef-hold` | none | `200` hold status | `404` |
| `POST /sessions/{id}/messages` | `{"text": "레몬 파스타 하나요", "language": "ko"}` | `200` `{"reply": "...", "actions": [...], "failed": false}` | `400`, `404`, `409` still answering, `422`, `429` too many messages |
| `GET /sessions/{id}/state` | none | `200` time, idle, chef hold, all orders, resources, running tasks | `404` |
| `GET /sessions/{id}/events?after=0` | none | `200` server-sent simulator events | `404`, `422` |

Messages go to the OpenAI SDK waiter team and can incur provider charges. Waiter tools are `place_order` and
`get_order_status`, and code validates each call against the live session. `actions` lists what
actually happened, built by code rather than taken from the model's reply. If the model fails,
the response is still `200` with a fixed reply and `failed: true`, and cooking is unaffected.
The waiters can also call `ask_kitchen`, an SDK agent tool for the read-only
KitchenAdvisorAgent. Recommendations can check registered ingredients and current
queue estimates; the advisor returns findings to the waiter and cannot place orders.
Successful child completion adds action `kitchen_consulted` with nullable `table_id`.
`GET /sessions/{id}/messages/progress` returns `{"busy":true,"progress":{"turn":1,
"phase":"checking","speaker":"waiter_a"}}` while a consultation is running.
Other phases are `checked` and `unavailable`; `progress` is null if there is no
consultation for the current message. The final message reply includes the same
nullable `progress` field. Polling this read-only endpoint does not call a model.
`speaker` remains the calling waiter. Simple orders skip the advisor. The menu includes
`fig_pasta` (Fig Pasta / 무화과 파스타): figs, butter, cheese and basil with spaghetti,
water and salt. `/menus` and session recipes include it automatically.

The default team does not hold chefs for conversation. `speaker` is `waiter_a`, `waiter_b`,
or `manager`. A waiter calls the SDK handoff `call_manager` for complaints and service
exceptions. Manager tools additionally inspect service state and reassign the current
table's waiter. Actions include `manager_called` and `waiter_reassigned` with `table_id`
and, for reassignment, `waiter_id`. Table histories and order status are scoped separately.
The legacy explicit chef-hold endpoints below remain available.

| Dining-room endpoint | Body | Result |
| --- | --- | --- |
| `GET /sessions/{id}/restaurant` | none | active_table, tables, waiters, delivered |
| `POST /sessions/{id}/restaurant/seat` | `{"seat_id":"seat.hall.1.a"}` | updated restaurant state; 422 invalid seat, 409 while answering |
| `DELETE /sessions/{id}/restaurant/seat` | none | leave chair, retain table orders; 409 while answering |
| `POST /sessions/{id}/restaurant/arrivals` | `{"waiter_id":"waiter_a","task_id":1,"language":"ko"}` | restaurant and optional localized notice; 409 obsolete task |

Restaurant state has `tables` (id, seat_id, waiter_id, seated, greeted, order_ids),
`waiters` (id, carrying, task) and `delivered` keyed by order ID (table_id, seat_id,
waiter_id). A task has id, kind (`greet`, `pickup`, `deliver`), table_id and nullable
order_id. The renderer acknowledges a task only on reaching its destination.
Kitchen `served` means ready at pass; only `delivered` confirms table delivery.
Direct `/orders` requests while seated also bind their orders to the active table.
See [restaurant team](../../../../../docs/restaurant-team.md) for lifecycle and limits.

`POST /sessions` also returns `initial_state` and `recipes`, so clients can rebuild state from
events. Check the host with `python -m evaluation.host_eval`, which makes live provider calls.

`speed` is simulated seconds per real second, from above 0 to 1000. `chefs` is as for runs.
`quantity` is 1 to 20;
plates in one request are ranked together. Each event's `id` and `sequence` is its 1-based
position. Reconnect with `?after=` or `Last-Event-ID` to skip events already seen. The stream
stays open while the session exists, so clients close it themselves.

A chef hold reserves one chef for a customer, in simulated seconds from 1 to 3600. Running work
is never interrupted, so the hold starts when a chef is next free, before any new hand work.
Other chefs keep cooking.
Background cooking and deadlines continue, and a dish waiting for the chef keeps its equipment.
Another request during a hold can only extend it. Hold status is `none`, `waiting` or `active`.

The kitchen advances whenever a session is read or written, so results do not depend on how
often clients poll. Given the same arrival times, a session produces the same events as
`run_priority_episode`. Sessions are in-memory, are never removed until restart, and need one
server process.

Messages accept optional `language: "ko" | "en"` to select the staff reply and fallback language per turn. Omit it (or pass null) to retain automatic language matching. The game offers 한국어/English and remembers the UI choice locally; switching languages keeps the current session and conversation history.

Game sessions send `equipment: "expanded"` to `POST /sessions`: 6 burners, 3 pots, and 3 pans. The default `"standard"` retains the existing single-unit simulation. Expanded `task_started` events include concrete `resources`; the client uses these for replay ownership and the matching cookware animation. Held equipment stays with its order until the recipe's named next step.
