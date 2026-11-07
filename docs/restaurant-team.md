# Restaurant staff team

## Hierarchy

```text
RestaurantRuntime (Python code, not an LLM)
├── ManagerAgent (OpenAI Agent: service exceptions, waiter reassignment)
├── WaiterAgent_A (OpenAI Agent: table conversation and orders)
├── WaiterAgent_B (same definition, separate identity and table assignment)
│   └── KitchenAdvisorAgent (SDK agent tool, callable by either waiter)
└── LiveKitchen + Dispatcher (deterministic cooking and order queue)
```

There is currently no LLM `chefAgent` cooking food. Chefs in the 3D kitchen follow
Dispatcher's validated task events. The old model-driven cooking agent was removed
before this change and is not restored here.

The SDK definitions live in `backend/src/pasta_chef/agents/team.py`:

```python
manager = Agent(name="ManagerAgent", instructions=..., tools=[
    place_order, get_order_status, get_service_status, reassign_waiter,
])
waiter = Agent(name="WaiterAgent_A", instructions=..., tools=[
    place_order, get_order_status,
    kitchen_advisor.as_tool(tool_name="ask_kitchen", tool_description="..."),
], handoffs=[handoff(manager, tool_name_override="call_manager")])
```

This is a schematic; the implementation wraps Python functions with `function_tool`.
Hierarchy comes from permissions and handoffs, not from the order of declarations.
Code assigns ordinary work. The manager model is called only when a waiter hands off
a complaint, manager request or exception. The manager may reassign this customer's
table; a new assignment takes effect on the next turn. Delivery already in progress
must finish before reassignment. The next ordinary turn starts with the assigned waiter.

## Kitchen subagent

Both waiters can call `KitchenAdvisorAgent` through `ask_kitchen`. This is an SDK
`Agent.as_tool()` child run: it returns findings and control to the original waiter.
It differs from the manager handoff, which transfers the customer conversation.
The child receives the waiter's bounded question rather than the whole table history.
The waiter is instructed to forward relevant preferences from that history.

Use it for questions such as “해산물 없이 달콤한 메뉴를 추천해줘. 얼마나 걸려?”
The advisor can read exact menu ingredients, flavor descriptions and preparation;
compare estimated times for one additional plate of each menu on independent copies
of the current kitchen; and inspect this customer's scoped order status. It cannot
place orders, customize recipes, change assignments or control cooking. Estimates do
not reserve equipment or add real orders. They are simulated kitchen time and exclude
table delivery and future arrivals.

Simple orders and greetings go directly through the waiter. At most one child run is
allowed per customer turn, including duplicate calls in a single model response. It
has four SDK turns and shares the parent's 30-second deadline. The parent has six SDK
turns. After successful consultation, code emits `kitchen_consulted` and the UI shows
that the waiter checked with the kitchen. Consultation failure returns control to the
waiter with an unavailable result and cannot create an order or a success action.

Questions about an existing order's progress or arrival also use the advisor's scoped
order-status tool. In the seated game, a consultation is presented as a service visit:
the waiter first returns to the table, says “주방에 확인해 볼게요”, walks to the kitchen
pass, then comes back to report. A nonblocking notification appears as the waiter leaves.
Even a fast model answer is held client-side until the waiter reaches the table again.
An already-carried dish is delivered first; an assigned ready dish can be picked up at
the pass on the return journey. Cooking state remains authoritative on the server.

`GET /sessions/{id}/messages/progress` exposes `busy` and optional `progress` with
`turn`, `phase` (`checking`, `checked`, `unavailable`) and `speaker`. The client polls
every 250 ms only during the model reply. The final message also includes `progress`,
so short consultations and failures do not depend on catching an intermediate poll.
No customer text or model internals are included. The next ordinary message clears
old progress. The live test page displays progress without waiting for a character walk.

The chat remains free text. A faint white Tip bar near the top center of the game
offers playful hints rather than buttons or prefilled requests. It gently pulses,
rotates text every 18 seconds and starts with the late-order hint while food is being
prepared. Korean/English follows the UI language. Reduced-motion settings disable
the glow animation. Tip selection and animation make no model calls.

The implementation is in `agents/kitchen_advisor.py`, wired in `agents/team.py`.
Recipes are the source of menu facts. `fig_pasta` uses figs, butter, cheese and basil;
it is a fixed dairy-containing recipe. Shared equipment precludes allergen-free promises.

## Customer flow

1. E near a chair sends the seat ID to the server. Code validates the seat and assigns
   the less-loaded waiter, alternating ties. Revisiting a table retains its assignment.
2. The renderer follows the existing aisle/arch waypoint graph. At the table it
   acknowledges the task ID; code records a greeting and provides a localized welcome.
   Greetings are fixed service text and incur no model call.
3. The table controls open the menu or conversation. The assigned SDK waiter uses
   `place_order` to create actual orders. The simulator checks menu and quantity;
   repeated identical tool calls within one turn do not double the order.
4. Dispatcher cooks without LLM calls. Kitchen `served` still means ready at the pass
   for compatibility with replay. Restaurant delivery is a separate state.
5. Code assigns pickup when a table's dish is ready. The waiter walks to the pass,
   carries one dish, walks to the table, and acknowledges delivery. The dish is then
   rendered at an available seat's plate slot. Stale acknowledgements cannot repeat it.
6. After greeting/delivery, staff pause briefly then return to their home aisle.
   Standing up cancels an unfinished welcome; existing orders still go to their table.

The frontend polls dining-room state every 500 ms. Cooking continues over the existing
SSE event stream. Animation uses real seconds, independent of kitchen speed.

Each table has its own SDK message history and order IDs. A waiter cannot read another
table's orders through `get_order_status`. Counter conversation has a separate history
and orders; counter orders remain self-service. Moving to another table does not move
previous orders. A table holds four delivered dishes; additional dishes remain at the
pass. Eating/clearing plates, water service, payment and refunds are not implemented.

## Setup and limits

Run `uv sync --project backend --extra agent --extra api --locked`, then the existing
Uvicorn and Vite commands in the root README. Reuse the ignored project `.env` with
`OPENAI_API_KEY`. Model precedence: `RESTAURANT_MODEL` > `CHEF_HOST_MODEL` > `CHEF_MODEL`.
The `openai/` prefix is stripped. Legacy non-OpenAI model settings use `gpt-4o` for
this team. No credentials are sent to the browser.

Each conversation turn is limited to six SDK turns and 30 seconds; each session to
100 messages. A kitchen consultation has its own four-turn child limit within that
same deadline. Only one conversation runs per session. Seat changes during a response
return 409, keeping its table context stable. SDK tracing is disabled. On failure,
accepted orders remain accepted and the fallback reflects recorded actions. No model
claim creates an order without a successful tool call.

Staff movement completion comes from the local renderer, appropriate for this existing
single-user, in-memory simulation. It is not an authoritative multiplayer physics server.
Polling catches cooking up; there is no independently ticking worker. Delivery progresses
while the game is rendering. Refresh starts a new game session, as before.

## Verification

`backend/tests/test_restaurant.py` runs the real SDK Runner with a scripted Model:
tools, manager handoff, reassignment, history isolation, failure and timeout limits,
plus nested advisor runs, read-only estimates, duplicate consultation suppression,
API seating, cooking readiness and duplicate-delivery rejection. It makes no
provider requests. `frontend/tests/restaurant.test.mjs` checks all table routes against
the collision map and localized staff actions. Run the standard offline suites and
frontend build from the root README. Live provider behavior requires an explicit live test.
