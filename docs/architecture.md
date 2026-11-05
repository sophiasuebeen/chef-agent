# Terminal execution path

1. `scripts/run_local.py` parses the menu, creates one `Kitchen`, and calls
   `Kitchen.add_order()`. Order intake is deterministic and never delegated to
   the model. The default mode invokes an explicit scripted baseline.
2. Agent mode loads `.env` and configurable model/limits through
   `backend/src/pasta_chef/config.py`, then invokes
   `backend/src/pasta_chef/runtime/controller.py:run_agent_episode()`.
3. The controller creates one in-memory ADK session, one Runner, and one
   `ChefAgent` through `backend/src/pasta_chef/agents/chef.py`. The model receives
   the recipe, objective, tool contracts, resource rules and fresh observation.
   OpenAI model names (such as openai/gpt-4o) use ADK’s LiteLLM adapter;
   Gemini model names use ADK’s native Gemini adapter. Root .env is loaded
   before either adapter is initialized. The --model option overrides CHEF_MODEL.
4. The model chooses functions exposed by
   `backend/src/pasta_chef/agents/tools/kitchen.py:KitchenTools`. These instance
   methods refer to this episode's kitchen. They call the simulator and return
   structured results plus a new observation. Rejections do not alter kitchen
   state. They do consume the tool-attempt budget.
5. `backend/src/pasta_chef/simulation/kitchen.py` validates and executes starts,
   completes every task at the earliest event, releases resources, and serves
   only a completed order. `models.py` holds the dataclasses and action log;
   `recipes.py` loads `recipes/lemon_pasta.json`. `observation.py` builds detached,
   serializable snapshots using the same task validation as actual starts.
6. After a tool round, ADK's `skip_summarization` callback returns control to the
   controller. A round may contain multiple tool calls, each budget checked.
   Counts persist across Runner invocations. Text-only claims cannot serve a
   dish. When nothing is startable or ready to serve, the controller advances
   pending events without calling the model. It never chooses cooking tasks.
7. The controller exits successfully only when all accepted orders are served.
   `serve_order()` records service time and deadline compliance. The terminal
   prints the action log and final observation; failures exit nonzero.

Limits include total model calls, tool attempts (reads and rejected actions
included), simulated timestamp, and wall-clock episode time. Every wrapper
checks the tool budget before execution; advancing past the simulated bound is
rejected before time changes. A model callback bounds calls across invocations,
ADK RunConfig also caps each invocation, and asyncio bounds episode duration.
No cooking uses wall-clock sleeps. Existing simulator state remains available
in the final observation after failure, rather than pretending to finish.

ADK is an optional dependency; simulator imports and offline simulator tests
remain independent of credentials and SDK installation. Authoritative kitchen
state lives outside ADK session state. Reset replaces it with a fresh state.
No API server, storage service, frontend, or second agent is part of this path.

The contract is in `docs/backend-contract.md`. Mocked orchestration tests live
in `tests/test_agent_workflow.py`; the live smoke test is the explicit terminal
command in README.md and is not part of unittest discovery.

`evaluation/run.py` reuses this controller for each prompt/repetition, with
`prompt_variant="original"` (the default) or `"deadline"`. `agents/chef.py`
preserves the original instruction and appends the deadline goal only for the
second variant. `controller.py` adds a structured `termination_reason` to its
existing result; EpisodeLimit carries the reason without changing any limit.
The simulator interfaces, recipe, task durations, resources and dependencies
are unchanged. `evaluation/metrics.py` computes deadline outcomes separately
from the controller's existing all-served success condition.
