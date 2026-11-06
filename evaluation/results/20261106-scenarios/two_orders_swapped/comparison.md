# Exploratory prompt comparison

Small per-prompt samples are exploratory, not evidence of a confirmed performance improvement.
Unserved orders are separate from served-order tardiness. A stopped run with zero tardiness is not a success.
finished_at is the last observed simulated time, including stopped episodes.

| variant | run | all_served | all_on_time | unserved | late | tardiness (s) | finished_at | model/tool calls | termination | success |
|---|---:|---|---|---:|---:|---:|---:|---|---|---|
| scripted | 1 | True | True | 0 | 0 | 0 | 1420 | 0/0 | completed | True |
| original | 1 | True | True | 0 | 0 | 0 | 1420 | 13/38 | completed | True |
| deadline | 1 | True | True | 0 | 0 | 0 | 1400 | 13/38 | completed | True |
