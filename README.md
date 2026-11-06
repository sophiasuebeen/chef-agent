# Pasta Chef

A simulated beach pasta restaurant with a Python kitchen, a Google ADK
ChefAgent, and a React Three Fiber scene. The simulator owns task dependencies,
shared equipment, simulated time, and service deadlines. Multiple orders share
one chef, one burner, one pot, and one pan; `lemon_pasta` and `seafood_tomato`
are the supported menus.
Inventory is assumed sufficient; vessel contents, cooling and overcooking are
not modeled.

The terminal and HTTP API support scripted, priority, and live agent modes.
The frontend accepts orders, executes a kitchen run, and replays its complete
event history in the existing 3D kitchen, with a final-state check against the
backend. The scene development view remains available separately.

| Dining room | Terrace |
| --- | --- |
| ![Dining room at golden hour](docs/images/scene-dining.png) | ![Terrace at golden hour](docs/images/scene-terrace.png) |

Scene code is in [frontend/](frontend/).

## Terminal demo

Python 3.12+ is required. Run commands from the repository root.
The scripted simulator needs no packages or credentials:

```bash
PYTHONPATH=backend/src python3 scripts/run_local.py
```

Water heating overlaps mint and garlic preparation. The scripted dish is served
at simulated second 710 against a 900-second deadline. Use `--menu seafood_tomato`
(served at second 760) and `--time-limit 900` to configure intake.

Local priority scheduling also needs no credentials:

```bash
PYTHONPATH=backend/src python3 scripts/run_local.py --mode priority
```

See [priority scheduling](docs/priority-scheduling.md) for rules, duration
history, dynamic arrivals, and offline evolution.

## Live ChefAgent

Install the agent environment with [uv](https://docs.astral.sh/uv/):

```bash
uv sync --project backend --extra agent --locked
```

The current package declares `google-adk` as a base dependency. The `agent`
extra also supplies LiteLLM and python-dotenv; only the simulator's direct
Python execution above is independent of installed third-party packages.

Use `GOOGLE_API_KEY` / `GEMINI_API_KEY` for Gemini, or `OPENAI_API_KEY` for OpenAI.
Export credentials or store them in a local root/backend `.env`. Existing shell
variables win; root `.env` takes precedence over backend/.env.
[.env.example](.env.example) lists model and episode limits. Gemini uses the
Developer API (`GOOGLE_GENAI_USE_VERTEXAI=false`), without Google Cloud auth.

```bash
PYTHONPATH=backend/src backend/.venv/bin/python scripts/run_local.py --mode agent --model openai/gpt-4o
```

`--model` overrides `CHEF_MODEL`; omit it to use the configured model. This
command makes real provider requests. Exit code 0 means served; deadline
compliance is reported separately as `on_time`. See [evaluation](docs/evaluation.md)
for smoke tests, prompt comparisons, metrics, and historical results.

## HTTP API

```bash
uv sync --project backend --extra api --locked
backend/.venv/bin/uvicorn pasta_chef.main:app --app-dir backend/src --reload
```

Open http://127.0.0.1:8000/docs for interactive documentation; scripted/priority
execution needs no API key. Runs are kept in process memory and disappear on restart. See
[API endpoints and examples](backend/src/pasta_chef/api/README.md).

`uv sync` removes packages from extras it was not given. To use API and agent in
the same environment, sync with `--extra api --extra agent`.

## Frontend replay and scene

Use Node.js 22.12+ and npm:

```bash
cd frontend
npm ci
npm run dev
```

Keep the API running on `127.0.0.1:8000`, then open the local URL printed by Vite.
Vite proxies `/api` to that server in both development and preview mode.
The menu cards load from `GET /menus`. Select a quantity, click **주문에 추가**, review the order list, choose a scheduling mode and click **조리 시작**. Each plate becomes an independent order. Item quantities can be edited or removed; advanced settings override the default 900 simulated second deadline per item. All orders must be accepted before execution is called once; intake failure leaves the partial run unexecuted, and retry starts a fresh run.
Use play/pause, speed, the event seek slider and previous/next event controls to
inspect orders, current tasks and equipment in the same 3D restaurant. The chef
moves between pantry, prep, boil, sauce, plating and pass, with articulated cooking
poses. Background heating and steam continue while the chef works elsewhere.
The procedural chef follows the supplied character reference; no external
character model, animation service or new dependency is required.

Use **Chef close-up** to follow the chef, or **Kitchen** for the full workspace.
**Time (seconds)** seeks inside long tasks; the event slider and previous/next
controls distinguish actions at the same timestamp. Pause freezes cooking motion,
steam and flames. Seeking backward reconstructs poses and removes future dishes.
**Jump to end** shows all served
orders; the verification notice compares replayed state to the backend's final
state. **Load replay** opens a completed run by ID. Agent comparison uses the
server's configured provider and credentials and may incur provider charges.

Open `?scene` for the 3D preview and its camera, time-of-day and debug controls.
Run `npm run build` from `frontend/` to check TypeScript and create a production
build. Run `npm test` with Node.js 22.18+ for frontend reducer tests against fresh
API output (requires the backend environment above; no running server or credentials).
Asset attribution is in
[CREDITS.md](frontend/public/assets/CREDITS.md).

## Offline verification

Install both extras once, then use the backend virtual environment to run both
root workflow/evaluation/scheduler tests and backend API tests:

```bash
uv sync --project backend --extra agent --extra api --locked
backend/.venv/bin/python scripts/run_tests.py
```

For an individual suite:

```bash
PYTHONPATH=backend/src backend/.venv/bin/python -m unittest discover -s tests -v
PYTHONPATH=backend/src backend/.venv/bin/python -m unittest discover -s backend/tests -v
```

These tests make no live model requests and need no credentials.

## Documentation

- [Agent instructions and current repository layout](AGENTS.md)
- [Simulator contract](docs/backend-contract.md)
- [Architecture and runtime behavior](docs/architecture.md)
- [Evaluation commands, metrics, and experiment records](docs/evaluation.md)
- [Priority scheduling and rule evolution](docs/priority-scheduling.md)
