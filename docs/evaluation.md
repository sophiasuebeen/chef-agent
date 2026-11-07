# Evaluation

## Offline verification

From the repository root, with both extras installed:

```bash
backend/.venv/bin/python scripts/run_tests.py
```

Run frontend state, movement and replay tests from `frontend/` with `npm test`.
These checks use local simulators and mocked providers, with no live API calls.

## Priority-rule evaluation

`evaluation/evolve.py` compares arithmetic scheduling rules using synthetic orders,
arrivals and duration variation. It uses `evaluation/metrics.py` to count unserved
orders, late served orders and total tardiness. A stopped run is not successful,
even if its current tardiness is zero. See [priority scheduling](priority-scheduling.md)
for generation commands, train/test seeds and fitness definitions.

## Customer conversation

`evaluation/host_cases.json` contains conversation cases and expected orders.
The explicit live command below calls the configured provider and may incur charges:

```bash
PYTHONPATH=backend/src backend/.venv/bin/python -m evaluation.host_eval --output /tmp/host-eval.json
```

It checks accepted orders, replies and simple wording expectations. Review failures
manually; word checks alone do not establish conversation quality.

## Historical records

`evaluation/results/` retains past LLM cooking experiments as historical artifacts.
The LLM cooking mode and prompt-comparison runner have been removed; those artifacts
are not current runtime results. Records predating recipe equipment holds allowed
unsafe equipment reuse and cannot be compared directly with later runs.
