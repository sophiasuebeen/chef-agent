"""One Google ADK ChefAgent, created only for an explicitly requested agent run."""
import json

from pasta_chef.simulation.observation import build_observation
from pasta_chef.simulation.recipes import load_recipe


DEADLINE_OBJECTIVE = (
    "Prioritize meeting the deadline of every order. "
    "Before assigning shared resources, consider each order's deadline and remaining tasks. "
    "If not all deadlines can be met, minimize the number of late orders first, "
    "then the total lateness."
)


def get_chef_instruction(prompt_variant: str = "original", menus=("lemon_pasta",), chefs: int = 1) -> str:
    """Original prompt is preserved; deadline adds only an explicit objective.

    `menus` selects the recipes shown to the chef. The lemon-only default keeps
    the prompt text that recorded evaluations were run against, as does one chef.
    """
    if prompt_variant not in ("original", "deadline"):
        raise ValueError(f"Unknown prompt variant: {prompt_variant}")
    original = (
        "You are the single chef of a simulated pasta kitchen. Serve the accepted order "
        "using the supplied tools. Choose actions from the current observation. "
        "Call a tool each decision; do not merely describe your plan. Start available "
        "background heating before chef preparation to overlap work. Tasks reserve their "
        "listed resources until completion, and a task's holds stay reserved for that "
        "order until the named task starts; dependencies require completed tasks of the "
        "same order. Start does not advance time. Use advance_to_next_event to wait "
        "when appropriate. Serve with serve_order only after completion_tasks finish. "
        "Respond to rejected actions using the fresh observation. Never claim service "
        "without a successful serve_order result. Recipe: "
        + " Recipe: ".join(json.dumps(load_recipe(menu)) for menu in menus)
    )
    if chefs > 1:
        original = original.replace(
            "You are the single chef of a simulated pasta kitchen.",
            f"You direct {chefs} chefs in a simulated pasta kitchen. A recipe's \"chef\" resource "
            "means any one free chef; start_task assigns one, so several chef tasks can overlap.")
    if prompt_variant == "deadline":
        return original + "\n\n" + DEADLINE_OBJECTIVE
    return original


def without_stale_observations(contents):
    """Copy history without tool-result observations; only the newest one is true.

    Keeps each result's ok/error so the chef can still see what it tried.
    """
    def trim(part):
        result = part.function_response
        if not (result and isinstance(result.response, dict) and "observation" in result.response):
            return part
        kept = {key: value for key, value in result.response.items() if key != "observation"}
        return part.model_copy(update={"function_response": result.model_copy(update={"response": kept})})

    return [content.model_copy(update={"parts": [trim(part) for part in content.parts or []]})
            for content in contents]


def create_chef_agent(tools, model, *, prompt_variant="original"):
    from google.adk.agents import Agent
    from google.genai import types

    def with_retries(name, inner):
        from pasta_chef.agents.retrying_llm import RetryingLlm
        return RetryingLlm(model=name, inner=inner, on_retry=tools.log_retry,
                           on_resend=tools.progress.request_resent,
                           on_give_up=tools.log_provider_failure)

    if isinstance(model, str) and model.startswith(("openai/", "gpt-")):
        import os
        # Use packaged metadata instead of fetching a cost map at startup.
        os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")
        from google.adk.models.lite_llm import LiteLlm
        import litellm
        litellm.telemetry = False
        litellm.suppress_debug_info = True
        name = model if model.startswith("openai/") else f"openai/{model}"
        # One action per decision, so each choice sees a fresh observation.
        # Retries live in RetryingLlm so they are bounded and logged.
        model = with_retries(name, LiteLlm(model=name, num_retries=0, parallel_tool_calls=False))
    elif isinstance(model, str):
        from google.adk.models.google_llm import Gemini
        model = with_retries(model, Gemini(model=model))

    def before_model(callback_context, llm_request):
        tools.before_model()
        # State is authoritative outside ADK sessions and refreshed on EVERY call.
        # Past actions stay in history, but only this newest observation is sent.
        llm_request.contents = without_stale_observations(llm_request.contents)
        llm_request.contents.append(types.Content(role="user", parts=[types.Part(
            text="Current kitchen observation: " + json.dumps(build_observation(tools.kitchen.state))
        )]))
        return None

    def after_model(callback_context, llm_response):
        tools.log_model_response(llm_response)
        return None

    def after_tool(tool, args, tool_context, tool_response):
        tools.log_tool_call(tool.name, args, tool_response)
        # Return control after the tool round. ADK can execute multiple calls in a
        # single round; each call still passes through the shared episode budget.
        tool_context.actions.skip_summarization = True
        return None

    return Agent(
        name="ChefAgent",
        model=model,
        instruction=get_chef_instruction(
            prompt_variant, sorted({o.menu for o in tools.kitchen.state.orders.values()}),
            chefs=tools.kitchen.chefs),
        tools=tools.functions(),
        before_model_callback=before_model,
        after_model_callback=after_model,
        after_tool_callback=after_tool,
        generate_content_config=types.GenerateContentConfig(
            temperature=0,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        ),
    )
