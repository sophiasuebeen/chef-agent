"""OpenAI SDK staff: two waiters, with a manager handoff for exceptions.

RestaurantRuntime assigns ordinary work. Agents understand speech and invoke narrow,
validated tools; they never decide cooking tasks or move a character frame by frame.
"""
import asyncio
import logging
import os
from pasta_chef.agents.host import (
    MessageLimitReached, MAX_MESSAGES_PER_SESSION,
    REPLY_TIMEOUT_SECONDS, fallback_reply, get_host_instruction,
)
from pasta_chef.agents.orders import OrderDesk

logger = logging.getLogger(__name__)


class RestaurantTeam(OrderDesk):
    def __init__(self, session, model, *, menus=None):
        super().__init__(session, menus=menus)  # OrderDesk knows nothing about models.
        self._model = model
        self._language = None
        self.messages = 0
        self.restaurant = session.restaurant
        self.manager = None
        self.waiters = {}
        self._histories = {}
        self._table_id = None
        self._counter_orders = []
        self.kitchen_advisor = None
        self._advisor_used = False
        self._advice_task = None
        self.progress = None
        self._turn_waiter = "waiter_a"

    def _kitchen_progress(self, phase):
        self.progress = dict(turn=self.messages, phase=phase, speaker=self._turn_waiter)

    def place_order(self, menu_id: str, quantity: int) -> dict:
        key = (menu_id, quantity)
        repeated = key in self._placed_this_turn
        result = super().place_order(menu_id, quantity)
        if result["ok"] and not repeated:
            self.restaurant.remember_orders(self._table_id, result["order_ids"])
            if self._table_id is None:
                self._counter_orders.extend(result["order_ids"])
        return result

    def get_order_status(self) -> dict:
        """Read only orders belonging to this table (or this counter conversation)."""
        ids = set(self.restaurant.tables[self._table_id]["order_ids"]) if self._table_id else set(
            self._counter_orders)
        orders = [o for o in self.session.snapshot()["orders"] if o["id"] in ids]
        pending = [o["id"] for o in orders if o["status"] != "served"]
        return dict(orders=[dict(id=o["id"], menu=o["menu"], status=("delivered" if o["id"] in
                    self.restaurant.delivered else "ready_at_pass" if o["status"] == "served" else o["status"]))
                    for o in orders], all_ready_in_seconds=self.session.ready_in_seconds(pending) if pending else 0)

    def get_service_status(self) -> dict:
        """Inspect actual staff assignments and this table's order status."""
        state = self.restaurant.snapshot()
        return dict(active_table=self._table_id,
                    assignments=[dict(table_id=t["id"], waiter_id=t["waiter_id"], seated=t["seated"])
                                 for t in state["tables"]], orders=self.get_order_status(),
                    waiters=state["waiters"])

    def reassign_waiter(self, waiter_id: str) -> dict:
        """Assign waiter_a or waiter_b to this customer's table. Never changes another table."""
        if self._table_id is None:
            return dict(ok=False, reason="customer_not_seated")
        result = self.restaurant.reassign(self._table_id, waiter_id)
        if result["ok"]:
            self._actions.append(dict(type="waiter_reassigned", waiter_id=waiter_id, table_id=self._table_id))
        return result

    def _staff_instruction(self, context, agent):
        base = get_host_instruction(self.menus, self._language, role=agent.name)
        table = self.restaurant.tables.get(self._table_id)
        location = (f"This customer's table is {self._table_id}, with assigned waiter {table['waiter_id']}."
                    if table else "This customer is at the counter, without a table.")
        role = ("You are the manager. Handle complaints and service exceptions kindly. Use get_service_status "
                "before explaining delays. You may reassign this table's waiter when requested, but only after "
                "the tool succeeds. When asked for a different waiter without a name, inspect the current "
                "assignment and choose the other waiter (waiter_a or waiter_b). If delivery is in progress, "
                "explain the tool's refusal rather than claiming the reassignment succeeded. "
                "Never promise refunds, discounts, recipe changes or actions without a tool."
                if agent.name == "ManagerAgent" else
                "You are a waiter, not a cook. You can discuss the menu and take orders while the kitchen "
                "keeps cooking. Use ask_kitchen for a recommendation that combines customer preferences, "
                "ingredients or current wait times, or for a kitchen question needing specialist advice. "
                "When asked when an existing order will arrive or how cooking is progressing, use "
                "ask_kitchen so the specialist checks this customer's actual order status. "
                "Give the specialist the relevant preferences and question; use the returned findings to "
                "answer the customer yourself. At most one consultation per turn. Do not call ask_kitchen "
                "for a greeting, a simple menu listing, or a clear order: place those orders directly. "
                "If consultation fails, say you could not confirm; never invent its result. "
                "For a request to speak to the manager, a complaint, or an exception you cannot "
                "resolve, hand off to ManagerAgent. Ordinary orders and greetings need no manager.")
        return (base + "\n\n" + location + "\n" + role +
                "\nKitchen status served means ready at the pass, not delivered to the table. "
                "Use get_order_status to distinguish those states. Do not claim to have walked, served a dish "
                "or provided water: code handles movement and delivery, and water service is not available. "
                "Keep answers short. Conversation does not occupy a chef or pause cooking.")

    def _ensure_agent(self):
        if self.waiters:
            return
        from agents import Agent, function_tool, handoff, ModelSettings, RunConfig
        from pasta_chef.agents.kitchen_advisor import KitchenAdvisor
        order_tools = [function_tool(self.place_order), function_tool(self.get_order_status)]
        self.manager = Agent(name="ManagerAgent", model=self._model, instructions=self._staff_instruction,
                             handoff_description="Handles complaints, service exceptions and manager requests.",
                             tools=[*order_tools, function_tool(self.get_service_status),
                                    function_tool(self.reassign_waiter)])
        def manager_called(context):
            self._actions.append(dict(type="manager_called", table_id=self._table_id))

        manager_handoff = handoff(self.manager, tool_name_override="call_manager", on_handoff=manager_called)
        self.kitchen_advisor = KitchenAdvisor(self)

        async def kitchen_findings(result):
            self._advisor_used = True
            self._kitchen_progress("checked")
            self._actions.append(dict(type="kitchen_consulted", table_id=self._table_id))
            return result.final_output

        def kitchen_unavailable(context, error):
            self._advisor_used = True
            self._kitchen_progress("unavailable")
            logger.warning("Kitchen consultation failed: %s", type(error).__name__)
            return "Kitchen consultation unavailable. Do not claim to have confirmed a recommendation or wait time."

        consult = self.kitchen_advisor.agent.as_tool(
            tool_name="ask_kitchen",
            tool_description="Ask the kitchen specialist to check preference-based recommendations, ingredients, preparation or current cooking estimates. Returns advice to you; you keep talking to the customer.",
            custom_output_extractor=kitchen_findings, failure_error_function=kitchen_unavailable,
            is_enabled=lambda context, agent: not self._advisor_used,
            max_turns=4, run_config=RunConfig(tracing_disabled=True),
        )
        invoke_consult = consult.on_invoke_tool

        async def consult_once(context, arguments):
            # Even repeated calls in one model response share a single child run.
            if self._advice_task is None:
                self._kitchen_progress("checking")
                self._advice_task = asyncio.create_task(invoke_consult(context, arguments))
            return await self._advice_task

        consult.on_invoke_tool = consult_once
        self.waiters = {name: Agent(name=f"WaiterAgent_{name[-1].upper()}", model=self._model,
                                   instructions=self._staff_instruction, tools=[*order_tools, consult],
                                   model_settings=ModelSettings(parallel_tool_calls=False),
                                   handoffs=[manager_handoff]) for name in ("waiter_a", "waiter_b")}

    async def _run_staff(self, text, waiter_id, history):
        from agents import Runner, RunConfig
        result = await Runner.run(self.waiters[waiter_id],
                                  [*history, dict(role="user", content=text)], max_turns=6,
                                  run_config=RunConfig(tracing_disabled=True))
        return str(result.final_output or ""), result.to_input_list(), result.last_agent.name

    async def reply(self, text, *, language=None):
        if self.messages >= MAX_MESSAGES_PER_SESSION:
            raise MessageLimitReached
        if language not in (None, "ko", "en"):
            raise ValueError("Unsupported conversation language.")
        self.messages += 1
        self._language = language
        self._table_id = self.restaurant.active_table
        self.start_turn()
        self._advisor_used = False
        self._advice_task = None
        self.progress = None
        waiter_id = self.restaurant.tables[self._table_id]["waiter_id"] if self._table_id else "waiter_a"
        self._turn_waiter = waiter_id
        history_key = self._table_id or "counter"
        history = self._histories.get(history_key, [])
        reply, failed, speaker = "", False, waiter_id
        try:
            # Imports are lazy and off the event loop, keeping kitchen polling responsive.
            if not self.waiters:
                await asyncio.to_thread(self._ensure_agent)
            reply, updated, last_agent = await asyncio.wait_for(
                self._run_staff(text, waiter_id, history), REPLY_TIMEOUT_SECONDS)
            self._histories[history_key] = updated
            speaker = "manager" if last_agent == "ManagerAgent" else waiter_id
        except Exception as error:
            logger.warning("Restaurant staff reply failed: %s", type(error).__name__)
            failed = True
            if self.progress and self.progress["phase"] == "checking":
                self._kitchen_progress("unavailable")
            if any(a["type"] == "manager_called" for a in self._actions):
                speaker = "manager"
            # Preserve a factual record of accepted orders even if the final model call failed.
            self._histories[history_key] = [*history, dict(role="user", content=text),
                dict(role="assistant", content=fallback_reply(self._actions, language))]
        return dict(reply=reply or fallback_reply(self._actions, language), actions=self._actions,
                    failed=failed or not reply, speaker=speaker, progress=self.progress)


def create_team(session):
    from pasta_chef.config import Settings, require_model_credentials
    settings = Settings.from_env()
    model = os.getenv("RESTAURANT_MODEL") or os.getenv("CHEF_HOST_MODEL") or settings.model
    if model.startswith("openai/"):
        model = model[len("openai/"):]
    if not model.startswith(("gpt-", "o1", "o3", "o4")):
        model = "gpt-4o"
    require_model_credentials("openai/" + model)
    return RestaurantTeam(session, model)
