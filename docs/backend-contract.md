# Backend contract (v1)

This is the stable simulator contract for implementation and independent tests.
No ADK installation, credentials, wall-clock waits, or network is required.
Import `Kitchen` from `pasta_chef.simulation.kitchen` and `build_observation`
from `pasta_chef.simulation.observation`. All times are integer simulated seconds.

## State

`Kitchen()` creates `kitchen.state: KitchenState`: time 0, orders {},
next_order_number 1, running_tasks [], and resources chef/burner/pot/pan all None.
Resource owners are `(order_id, task_id)` tuples. Each order owns a separate
completed_tasks list. `state.events` is the full successful action log;
`state.last_action_result` is the most recent action result (initially None).
`kitchen.reset()` replaces state with a fresh KitchenState.

`Order` fields: id, menu, created_at, deadline, status (pending/cooking/served),
completed_tasks, served_at (initially None), on_time (initially None).
`RunningTask` fields: order_id, task_id, finishes_at, resources.

## Public operations

### Kitchen.add_order(menu: str, time_limit: int = 900) -> Order

Normalize menu with strip/lower; initially only lemon_pasta is supported.
Positive integer time_limit (excluding bool) is required. Return the stored
Order with id order_N, created_at=current time, deadline=time+time_limit,
status pending, and completed_tasks []. Increment N only on success.
Raises ValueError for unsupported/invalid menu or time_limit. Recipe file I/O
and JSON errors propagate. Records an order_accepted event.

### Kitchen.get_order(order_id: str) -> Order

Return the stored order; unknown ID raises KeyError.

### Kitchen.validate_task(order_id: str, task_id: str) -> dict

Return the recipe task definition if it can start now, without changing state.
Uses the same validation and exceptions as start_task.

### Kitchen.start_task(order_id: str, task_id: str) -> dict

Requires an existing unserved order, known task, task neither running nor
completed, all requires completed by this order, and all resources available.
Reserve resources, append RunningTask with finishes_at=time+duration, and mark
order cooking. Does not advance time. Return exactly:

```json
{"ok": true, "action": "task_started", "time": 0,
 "order_id": "order_1", "task_id": "collect_ingredients", "finishes_at": 20}
```

Unknown order/task raises KeyError. Served order, duplicate task, missing
dependency, unavailable resource, or invalid recipe duration/resources raises
ValueError. Recipe durations must be positive integers and resources known.

### Kitchen.advance_to_next_event() -> dict

With running tasks, advance to the earliest finishes_at, complete ALL tasks at
that timestamp in running_tasks insertion order, append their IDs to their
own orders, release only resources owned by each finishing task, and remove
those running tasks. Return exactly (completed can have multiple entries):

```json
{"ok": true, "action": "tasks_completed", "time": 20,
 "completed": [{"order_id": "order_1", "task_id": "collect_ingredients"}]}
```

With no running tasks return
`{"ok": true, "action": "no_op", "time": CURRENT_TIME, "completed": []}`.
No-op changes nothing, including the action log and last result.

### Kitchen.serve_order(order_id: str) -> dict

Require every recipe completion_tasks ID completed, an unserved order, and no
running tasks for this order. Set status served, served_at=current time,
on_time=(time <= deadline). Late service is allowed. Return exactly:

```json
{"ok": true, "action": "order_served", "time": 710,
 "order_id": "order_1", "on_time": true}
```

Unknown order raises KeyError. Incomplete, still-running or already served
orders raise ValueError.

### build_observation(state: KitchenState) -> dict

Return a detached JSON-serializable snapshot; never mutate state. Keys:

- time: current simulated timestamp.
- orders: list of active (unserved) orders, as dictionaries of all Order fields.
- resources: resource -> owner as a two-element list, or None.
- chef_available: resources['chef'] is None.
- running_tasks: list of all RunningTask fields plus remaining_time=finishes_at-time.
- completed_tasks: order ID -> list of task IDs, including served orders.
- available_tasks: active order ID -> list of startable task ID strings in recipe order.
- recent_events: last 20 successful action events.
- last_action_result: latest successful action result or None.

## Error and logging guarantees

Every rejected simulator operation raises before mutation: all state, counters,
resource owners, events and last_action_result remain unchanged. Successful
mutating operations append a detached copy of their result to events and store
it in last_action_result. The add_order event is
`{ok: true, action: 'order_accepted', time, order_id, menu, deadline}`.
No task completion automatically serves a dish or cancels a late order.

ADK wrappers catch KeyError/ValueError and return
`{ok: false, error: {type: EXCEPTION_CLASS_NAME, message: TEXT}, observation: SNAPSHOT}`.
Successful action wrappers return `{...SIMULATOR_RESULT, observation: SNAPSHOT}`.
get_kitchen_state returns `{ok: true, observation: SNAPSHOT}`; get_recipe(menu)
returns `{ok: true, recipe: RECIPE, observation: SNAPSHOT}`. Infrastructure errors
propagate to the terminal as failure. Wrappers never own cooking rules.

## Execution boundary

One ADK invocation may make multiple model/tool calls. The runtime bounds total
LLM calls, total tool attempts (including reads and rejections), simulated time,
and wall-clock episode duration. Limits stop before the next mutation/call;
limits and provider failures produce a failed episode, never fabricated success.
Only a simulator order with status served means success. When no startable or
servable action exists and tasks are running, the controller can advance time
without a model call. All other action selection belongs to ChefAgent.

## Acceptance example

collect_ingredients: start at 0, advance to 20. Start boil_water and prepare_mint
at 20; advance to 40 (mint done, water still running); start crush_garlic and
advance to 60, then advance to 140. Complete cook_pasta_halfway (380),
reserve_water_and_drain (400), prepare_sauce (440), finish_pasta (680),
finish_off_heat (710), then serve. All resources must be released.
