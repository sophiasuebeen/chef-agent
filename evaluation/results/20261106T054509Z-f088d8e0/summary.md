# Live deadline prompt comparison — 2026-11-06

Three real episodes per prompt were executed, alternating original and deadline.
Five of the six episodes stopped with provider `RateLimitError`. This experiment
does not establish whether the deadline prompt improves deadline compliance.

Command, from the repository root:

```bash
PYTHONPATH=backend/src backend/.venv/bin/python -m evaluation.run --live --model openai/gpt-4o --repetitions 3
```

Both variants used temperature 0, a fresh kitchen and ADK session, the same two
orders (deadlines 1500/900), one chef/burner/pot/pan, a simulated-time cap of
1800 seconds, 40 model calls, 80 tool calls, and a 120-second episode timeout.
The deadline variant used the existing English objective from the working tree.
Exact prompts, hashes, settings, observations, and action logs are in each JSON.
No prompt, simulator, or retry policy was changed for this experiment.

| Variant | Episodes attempted | Completed episodes | Both orders on time | Rate-limit interruptions |
|---|---:|---:|---:|---:|
| original | 3 | 1 | 0 | 2 |
| deadline | 3 | 0 | 0 | 3 |

Original run 1 served order_1 at 710 and order_2 at 1370; order_2 was 470 seconds
late. Deadline run 1 served the urgent order_2 at 710, on time, then stopped at
1090 with order_1 unserved. Neither result proves a prompt-level improvement.
Zero tardiness in interrupted runs must not be interpreted as successful service.
The scripted urgency-first baseline served both on time, at 710 and 1420.

See [all episode metrics](comparison.md) and the seven adjacent JSON reports.
The six live episodes made 72 model calls and 176 tool attempts in total;
these counts include failed provider calls and controller-driven tool attempts.

Validation: all 17 offline evaluation tests passed. All seven saved event logs
(six live episodes and the baseline) replayed exactly through a fresh simulator;
the six live final observations also matched their replays.

An earlier sandbox attempt is preserved separately in
[20261106T054039Z-d125e876](../20261106T054039Z-d125e876/comparison.md).
Every episode there failed on its first call with `InternalServerError` and no
cooking progress. It is excluded from the table above. The live experiment was
rerun with network access enabled. No additional episodes were substituted for
the rate-limited runs. A complete repeat under available provider capacity is
still needed for a usable three-completed-episodes-per-prompt comparison.
