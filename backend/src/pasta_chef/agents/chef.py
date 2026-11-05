"""One Google ADK ChefAgent, created only for an explicitly requested agent run."""
import json

from pasta_chef.simulation.observation import build_observation
from pasta_chef.simulation.recipes import load_recipe


def create_chef_agent(tools, model):
    from google.adk.agents import Agent
    from google.genai import types

    def before_model(callback_context, llm_request):
        tools.before_model()
        # State is authoritative outside ADK sessions and refreshed on EVERY call.
        llm_request.contents.append(types.Content(role="user", parts=[types.Part(
            text="Current kitchen observation: " + json.dumps(build_observation(tools.kitchen.state))
        )]))
        return None

    def after_tool(tool, args, tool_context, tool_response):
        # Return control after the tool round. ADK can execute multiple calls in a
        # single round; each call still passes through the shared episode budget.
        tool_context.actions.skip_summarization = True
        return None

    return Agent(
        name="ChefAgent",
        model=model,
        instruction=(
            "You are the single chef of a simulated pasta kitchen. Serve the accepted order "
            "using the supplied tools. Choose actions from the current observation. "
            "Call a tool each decision; do not merely describe your plan. Start available "
            "background heating before chef preparation to overlap work. Tasks reserve their "
            "listed resources until completion; dependencies require completed tasks of the "
            "same order. Start does not advance time. Use advance_to_next_event to wait "
            "when appropriate. Serve with serve_order only after completion_tasks finish. "
            "Respond to rejected actions using the fresh observation. Never claim service "
            "without a successful serve_order result. Recipe: "
            + json.dumps(load_recipe("lemon_pasta"))
        ),
        tools=tools.functions(),
        before_model_callback=before_model,
        after_tool_callback=after_tool,
        generate_content_config=types.GenerateContentConfig(
            temperature=0,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        ),
    )
