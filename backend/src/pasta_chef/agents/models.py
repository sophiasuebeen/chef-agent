"""Provider adapters for the customer-facing host, imported only when needed."""

def resolve_model(model, *, uses_tools=True, max_retries=5):
    """Turn a configured model name into a retried client. Injected models pass through.

    OpenAI rejects parallel_tool_calls on requests without tools, so tool-free agents say so."""
    if not isinstance(model, str):
        return model
    from pasta_chef.agents.retrying_llm import RetryingLlm
    if model.startswith(("openai/", "gpt-")):
        import os
        # Use packaged metadata instead of fetching a cost map at startup.
        os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")
        from google.adk.models.lite_llm import LiteLlm
        import litellm
        litellm.telemetry = False
        litellm.suppress_debug_info = True
        name = model if model.startswith("openai/") else f"openai/{model}"
        # Keep retries bounded in one wrapper; tool calls run sequentially.
        options = dict(parallel_tool_calls=False) if uses_tools else {}
        inner = LiteLlm(model=name, num_retries=0, **options)
    else:
        from google.adk.models.google_llm import Gemini
        name, inner = model, Gemini(model=model)
    return RetryingLlm(model=name, inner=inner, max_retries=max_retries)
