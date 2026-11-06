# Live deadline prompt comparison across scenarios — 2026-11-06

One episode per prompt per scenario with `openai/gpt-4o` at temperature 0. The
scenarios were fixed before these runs. Earlier runs of `two_orders` repeated
exactly, so these are one sample per condition rather than independent trials.

All ten episodes completed with no provider retries and no rejected tool calls.

| Scenario | Deadlines | Late orders (both prompts) | Tardiness original / deadline | Last service original / deadline | Scripted tardiness | Model calls |
|---|---|---:|---:|---:|---:|---:|
| `two_orders` | 1500, 900 | 0 | 0 / 0 | 1420 / 1400 | 0 | 13 / 13 |
| `two_orders_swapped` | 900, 1500 | 0 | 0 / 0 | 1420 / 1400 | 0 | 13 / 13 |
| `two_orders_impossible` | 800, 800 | 1 | 620 / 600 | 1420 / 1400 | 620 | 13 / 13 |
| `three_orders` | 2200, 900, 1500 | 0 | 0 / 0 | 2130 / 2090 | 0 | 24 / 24 |
| `three_orders_impossible` | 1500, 900, 1900 | 1 | 230 / 190 | 2130 / 2090 | 230 | 24 / 24 |

Both prompts started the earliest-deadline order first in every scenario, and
neither changed the number of late orders. The deadline prompt prepared a later
order while water heated, which reduced tardiness in the two impossible scenarios.

Token cost at $2.50/$10 per million input/output tokens is about $1.16 for the
ten episodes; check provider billing for the charged amount.

These scenarios share one recipe, simultaneous arrivals and one model, and all
reward the same preparation overlap. They do not establish a general improvement.
