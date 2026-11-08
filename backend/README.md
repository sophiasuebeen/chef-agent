# Pasta Chef backend

See [the root README](../README.md) for setup, terminal commands and offline
verification, and [the API guide](src/pasta_chef/api/README.md) for HTTP endpoints.

The simulator modules use only the Python standard library and can run directly
with `PYTHONPATH=backend/src`; the package has no required dependencies.
The `agent` extra adds the OpenAI Agents SDK (staff conversation), python-dotenv, and the
Google GenAI SDK (only for optional Gemini rule evolution); the `api` extra adds FastAPI,
Uvicorn and HTTPX. Use both extras for the full offline test suite.

Public simulator interfaces are documented in
[backend-contract.md](../docs/backend-contract.md).
