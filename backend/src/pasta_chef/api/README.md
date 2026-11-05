# Pasta Chef HTTP API

A thin development API over the simulator. Run from the repository root:

```bash
uv sync --project backend --extra api --locked
backend/.venv/bin/uvicorn pasta_chef.main:app --app-dir backend/src --reload
```

`uv sync` removes packages from extras it was not given. If this environment also
runs the agent, sync with both: `--extra api --extra agent`.

Interactive docs are at http://127.0.0.1:8000/docs. No API key is needed.

| Method and path | Body | Success | Errors |
| --- | --- | --- | --- |
| `POST /runs` | none | `201` `{"run_id": "..."}` | |
| `POST /runs/{run_id}/orders` | `{"menu": "lemon_pasta", "time_limit": 900}` | `201` the order | `400` unparsable body, `404` unknown run, `422` invalid body, menu, or `time_limit` |
| `GET /runs/{run_id}/state` | none | `200` the `build_observation()` result | `404` unknown run |

`time_limit` is required and must be a JSON integer from 1 to 2^53 - 1. The
simulator trims and lowercases `menu`, and the response shows the stored value.
Every error is `{"detail": "<message>"}`. The request body is checked before the
run, so an invalid body on an unknown run returns `400` or `422`, not `404`.

Accepting an order only records it as `pending`: nothing here starts cooking or
runs the agent, and simulated time does not advance.

```bash
RUN_ID=$(curl -s -X POST localhost:8000/runs | python3 -c 'import json,sys; print(json.load(sys.stdin)["run_id"])')
curl -s -X POST localhost:8000/runs/$RUN_ID/orders -H 'Content-Type: application/json' -d '{"menu": "lemon_pasta", "time_limit": 900}'
curl -s localhost:8000/runs/$RUN_ID/state
```

Runs live in process memory for development only. They are lost on restart, are
never evicted, and are not shared between workers, so run a single worker. Any
code that later touches a run's kitchen must hold that run's `lock`.

Offline tests (no model calls or credentials):

```bash
PYTHONPATH=backend/src backend/.venv/bin/python -m unittest discover -s backend/tests -v
```
