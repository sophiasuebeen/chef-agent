# Two-order exploratory comparison

Small per-prompt samples (default: three runs) are exploratory, not evidence of a confirmed performance improvement.
Unserved orders are separate from served-order tardiness. A stopped run with zero tardiness is not a success.
finished_at is the last observed simulated time, including stopped episodes.

| variant | run | all_served | all_on_time | unserved | late | tardiness (s) | finished_at | model/tool calls | termination | success |
|---|---:|---|---|---:|---:|---:|---:|---|---|---|
| scripted | 1 | True | True | 0 | 0 | 0 | 1420 | 0/0 | completed | True |
| original | 1 | True | False | 0 | 1 | 470 | 1370 | 18/46 | completed | False |
| deadline | 1 | False | False | 1 | 0 | 0 | 1090 | 17/36 | api_error | False |
| original | 2 | False | False | 2 | 0 | 0 | 440 | 10/26 | api_error | False |
| deadline | 2 | False | False | 2 | 0 | 0 | 380 | 8/20 | api_error | False |
| original | 3 | False | False | 2 | 0 | 0 | 400 | 9/23 | api_error | False |
| deadline | 3 | False | False | 2 | 0 | 0 | 440 | 10/25 | api_error | False |
