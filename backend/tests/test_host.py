"""The host through the real ADK Runner with a scripted model: no provider calls or credentials."""
import asyncio
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from pasta_chef.main import create_app
from pasta_chef.runtime.sessions import LiveSession, SessionStore

try:
    from google.adk.models.base_llm import BaseLlm
    from google.adk.models.llm_response import LlmResponse
    from google.genai import types
    from pasta_chef.agents.host import (FALLBACK_REPLY, MAX_MESSAGES_PER_SESSION, HostAgent,
                                        MessageLimitReached, available_menus, get_host_instruction)
except ImportError:
    BaseLlm = None

ROOT = Path(__file__).resolve().parents[2]


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


if BaseLlm:
    class ScriptedModel(BaseLlm):
        """Each script entry is reply text, an exception, or a list of (tool, args) calls."""
        script: list = []
        requests: list = []

        async def generate_content_async(self, llm_request, stream=False):
            self.requests.append(llm_request)
            step = self.script.pop(0) if self.script else "네!"
            if isinstance(step, Exception):
                raise step
            if isinstance(step, str):
                parts = [types.Part(text=step)]
            else:
                parts = [types.Part.from_function_call(name=name, args=args) for name, args in step]
            yield LlmResponse(content=types.Content(role="model", parts=parts))


def label_as(label):
    async def classify(text):
        return label
    return classify


def order(menu="lemon_pasta", quantity=1):
    return [("place_order", dict(menu_id=menu, quantity=quantity))]


@unittest.skipUnless(BaseLlm, "ADK not installed")
class HostTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.session = LiveSession(speed=10, clock=self.clock)

    def host(self, *script):
        self.model = ScriptedModel(model="scripted", script=list(script), requests=[])
        return HostAgent(self.session, self.model, classify=label_as("kitchen"))

    def orders(self):
        return self.session.snapshot()["orders"]

    async def test_language_can_change_without_resetting_the_conversation(self):
        host = self.host("Hello!", "안녕하세요!", "Hello again!")
        await host.reply("안녕", language="en")
        self.assertIn("Reply in English for this turn", host._instruction())
        conversation = host._conversation_id
        await host.reply("hello", language="ko")
        self.assertIn("Reply in Korean for this turn", host._instruction())
        self.assertNotIn("Reply in English for this turn", host._instruction())
        self.assertEqual(host._conversation_id, conversation)
        await host.reply("hello")
        self.assertNotIn("for this turn, regardless", host._instruction())

    async def test_english_fallback_preserves_accepted_orders(self):
        host = self.host(order(), RuntimeError("offline"))
        result = await host.reply("레몬 파스타 하나", language="en")
        self.assertTrue(result["failed"])
        self.assertIn("Your order is confirmed", result["reply"])
        self.assertEqual(result["actions"][0]["type"], "order_accepted")

    async def test_accepted_order_reaches_the_kitchen_and_is_reported_by_code(self):
        result = await self.host(order(quantity=2), "두 접시 주문 받았어요!").reply("레몬 파스타 2개요")
        self.assertEqual(result["reply"], "두 접시 주문 받았어요!")
        self.assertFalse(result["failed"])
        action = result["actions"][0]
        self.assertEqual(action["type"], "order_accepted")
        self.assertEqual((action["menu"], action["quantity"], action["order_ids"]),
                         ("lemon_pasta", 2, ["order_1", "order_2"]))
        self.assertEqual(action["ready_in_seconds"], 1370)
        self.assertEqual([o["status"] for o in self.orders()], ["cooking", "pending"])

    async def test_the_model_sees_the_tool_result_before_answering(self):
        await self.host(order(), "네!").reply("레몬 파스타요")
        response = self.model.requests[1].contents[-1].parts[0].function_response.response
        self.assertTrue(response["ok"])
        self.assertEqual(response["order_ids"], ["order_1"])

    async def test_the_estimate_matches_what_the_kitchen_then_does(self):
        self.clock.now += 3
        result = await self.host(order(quantity=2), "네!").reply("레몬 파스타 둘이요")
        placed_at, ready = self.session.sync(), result["actions"][0]["ready_in_seconds"]
        self.clock.now += 1000
        served = max(o["served_at"] for o in self.orders())
        self.assertEqual(served - placed_at, ready)
        self.assertEqual(ready, 1370)

    async def test_estimating_leaves_the_real_kitchen_untouched(self):
        self.session.add_orders([("lemon_pasta", 900)])
        before = (list(self.session.live.kitchen.state.events), self.session.live.now)
        self.assertEqual(self.session.ready_in_seconds(["order_1"]), 710)
        self.assertEqual((self.session.live.kitchen.state.events, self.session.live.now), before)

    async def test_first_reply_loads_libraries_off_the_event_loop(self):
        with patch("pasta_chef.agents.host._load_provider_libraries") as load, \
                patch("asyncio.to_thread", wraps=asyncio.to_thread) as to_thread:
            host = self.host("하나", "둘")
            await host.reply("하나")
            await host.reply("둘")
        to_thread.assert_any_call(load)
        self.assertEqual(load.call_count, 1)

    async def test_off_menu_and_bad_quantity_are_refused_by_code(self):
        for args, reason in ((dict(menu_id="pizza", quantity=1), "unsupported_menu"),
                             (dict(menu_id="lemon_pasta", quantity=100), "invalid_quantity"),
                             (dict(menu_id="lemon_pasta", quantity=0), "invalid_quantity"),
                             (dict(menu_id="lemon_pasta", quantity=1.5), "invalid_quantity")):
            with self.subTest(args):
                result = await self.host([("place_order", args)], "죄송해요").reply("주문이요")
                self.assertEqual(result["actions"][0]["type"], "order_rejected")
                self.assertEqual(result["actions"][0]["reason"], reason)
                self.assertEqual(self.orders(), [])

    async def test_a_claim_without_a_tool_call_is_not_an_order(self):
        result = await self.host("피자 주문 받았어요!").reply("피자 주세요")
        self.assertEqual(result["actions"], [])
        self.assertEqual(self.orders(), [])

    async def test_a_repeated_call_in_one_turn_orders_once(self):
        result = await self.host(order(), order(), "네!").reply("레몬 파스타요")
        self.assertEqual(len(result["actions"]), 1)
        self.assertEqual(len(self.orders()), 1)

    async def test_the_same_dish_in_a_later_turn_is_a_new_order(self):
        host = self.host(order(), "네!", order(), "또 네!")
        await host.reply("레몬 파스타요")
        await host.reply("하나 더요")
        self.assertEqual(len(self.orders()), 2)

    async def test_several_dishes_are_ordered_separately(self):
        result = await self.host(order("lemon_pasta"), order("seafood_tomato"), "네!").reply("둘 다요")
        self.assertEqual([a["menu"] for a in result["actions"]], ["lemon_pasta", "seafood_tomato"])
        self.assertEqual(len(self.orders()), 2)

    async def test_status_comes_from_the_kitchen(self):
        host = self.host(order(), "네!", [("get_order_status", {})], "조리 중이에요")
        await host.reply("레몬 파스타요")
        self.clock.now += 5
        await host.reply("어떻게 됐어요?")
        response = self.model.requests[-1].contents[-1].parts[0].function_response.response
        self.assertEqual(response["orders"][0]["status"], "cooking")
        self.assertEqual(response["all_ready_in_seconds"], 660)

    async def test_conversation_is_remembered_between_messages(self):
        host = self.host("안녕하세요!", "네!")
        await host.reply("안녕하세요")
        await host.reply("또 왔어요")
        texts = [part.text for content in self.model.requests[-1].contents for part in content.parts if part.text]
        self.assertIn("안녕하세요", texts)
        self.assertIn("또 왔어요", texts)

    async def test_a_provider_failure_gets_a_fixed_reply_and_cooking_continues(self):
        host = self.host(order(), RuntimeError("secret account detail"))
        with self.assertLogs("pasta_chef.agents.host", "WARNING") as logs:
            result = await host.reply("레몬 파스타요")
        self.assertTrue(result["failed"])
        self.assertEqual(result["actions"][0]["type"], "order_accepted")
        self.assertIn("주문 받았어요", result["reply"])
        self.assertNotIn("secret", " ".join(logs.output) + result["reply"])
        self.clock.now += 100
        self.assertEqual(self.orders()[0]["status"], "served")

        result = await self.host(RuntimeError("down")).reply("안녕하세요")
        self.assertEqual(result["reply"], FALLBACK_REPLY)
        self.assertEqual(result["actions"], [])

    async def test_a_runaway_model_stops_at_the_call_limit(self):
        calls = [[("get_order_status", {})] for _ in range(20)]
        result = await self.host(*calls).reply("주문 현황이요")
        self.assertTrue(result["failed"])
        self.assertLessEqual(len(self.model.requests), 4)
        self.assertEqual(result["reply"], FALLBACK_REPLY)

    async def test_a_slow_model_times_out_and_the_kitchen_is_unaffected(self):
        class Hanging(ScriptedModel):
            async def generate_content_async(self, llm_request, stream=False):
                await asyncio.sleep(60)
                yield LlmResponse()
        host = HostAgent(self.session, Hanging(model="hanging"), classify=label_as("kitchen"))
        with patch("pasta_chef.agents.host.REPLY_TIMEOUT_SECONDS", 0.01):
            result = await host.reply("안녕하세요")
        self.assertTrue(result["failed"])
        self.assertEqual(result["reply"], FALLBACK_REPLY)

    async def test_messages_per_session_are_capped(self):
        host = self.host()
        host.messages = MAX_MESSAGES_PER_SESSION
        with self.assertRaises(MessageLimitReached):
            await host.reply("안녕하세요")
        self.assertEqual(self.model.requests, [])

    async def test_a_hold_and_an_order_at_the_same_moment_both_apply(self):
        self.session.hold_chef(60)
        await self.host(order(), "네!").reply("레몬 파스타요")
        state = self.session.snapshot()
        self.assertEqual(state["orders"][0]["status"], "pending")
        self.assertEqual(state["chef_hold"]["status"], "active")

    def test_instruction_lists_the_menu_without_template_braces(self):
        instruction = get_host_instruction(available_menus())
        self.assertIn("menu_id lemon_pasta", instruction)
        self.assertIn("menu_id seafood_tomato", instruction)
        self.assertNotIn("{", instruction)


@unittest.skipUnless(BaseLlm, "ADK not installed")
class SmallTalkHostTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.clock = FakeClock()

    def host(self, chefs, *script):
        self.session = LiveSession(speed=10, clock=self.clock, chefs=chefs)
        self.model = ScriptedModel(model="scripted", script=list(script), requests=[])
        return HostAgent(self.session, self.model, classify=label_as("small_talk"))

    async def pester(self, host, times):
        results = []
        for _ in range(times):
            self.model.script += ["네"]
            results.append(await host.reply("수다"))
        return results

    def decisions(self, results):
        return [result["actions"][0]["decision"] for result in results]

    async def test_chat_holds_a_chef_and_reports_who_is_talking(self):
        host = self.host(1, "좋은 날씨죠")
        result = await host.reply("날씨 좋네요")
        self.assertEqual(result["actions"], [dict(type="small_talk", decision="chat", chef="chef")])
        self.assertEqual(result["speaker"], "chef")
        state = self.session.snapshot()
        self.assertEqual(state["chef_hold"]["status"], "active")
        self.assertEqual(state["resources"]["chef"], ["customer", "chat"])

    async def test_pestering_goes_to_the_resting_chef_who_then_also_stops(self):
        results = await self.pester(self.host(2), 8)
        self.assertEqual(self.decisions(results), ["chat", "chat", "chat", "hand_off", "chat", "chat", "end", "end"])
        self.assertEqual(results[0]["speaker"], "chef")
        self.assertEqual(results[3]["speaker"], "chef_2")
        self.assertEqual(self.session.snapshot()["chef_hold"]["status"], "none")

    async def test_the_hand_off_really_moves_the_hold(self):
        results = await self.pester(self.host(2), 4)
        resources = self.session.snapshot()["resources"]
        self.assertEqual(results[-1]["speaker"], "chef_2")
        self.assertIsNone(resources["chef"])
        self.assertEqual(resources["chef_2"], ["customer", "chat"])

    async def test_with_nobody_free_the_conversation_ends_politely(self):
        results = await self.pester(self.host(1), 5)
        self.assertEqual(self.decisions(results), ["chat", "chat", "chat", "end", "end"])
        self.assertEqual(self.session.snapshot()["chef_hold"]["status"], "none")

    async def test_the_budget_refills_after_a_quiet_while(self):
        host = self.host(1)
        await self.pester(host, 4)
        self.clock.now += 40  # 400 simulated seconds.
        self.assertEqual(self.decisions(await self.pester(host, 1)), ["chat"])

    async def test_chat_that_would_make_an_on_time_order_late_is_declined(self):
        host = self.host(1)
        self.session.add_orders([("lemon_pasta", 715)])
        self.clock.now += 38  # 380 simulated: the chef is needed right now and slack is 5 seconds.
        results = await self.pester(host, 1)
        self.assertEqual(results[0]["actions"][0]["decision"], "end")
        self.assertEqual(self.session.snapshot()["orders"][0]["served_at"], None)
        self.clock.now += 100
        self.assertTrue(self.session.snapshot()["orders"][0]["on_time"])

    async def test_a_late_order_stays_cheap_to_chat_over(self):
        host = self.host(1)
        self.session.add_orders([("lemon_pasta", 100)])  # Already hopeless: chat cannot newly make it late.
        results = await self.pester(host, 1)
        self.assertEqual(results[0]["actions"][0]["decision"], "chat")

    def system_text(self):
        return self.model.requests[-1].config.system_instruction

    async def test_the_decision_reaches_the_model_through_the_system_instruction(self):
        host = self.host(1)
        await self.pester(host, 4)
        self.assertIn("nobody is free", self.system_text())
        last_user = [part.text for part in self.model.requests[-1].contents[-1].parts]
        self.assertEqual(last_user, ["수다"])

    async def test_the_helper_is_told_who_it_is_and_the_note_lasts_one_turn(self):
        host = self.host(2)
        await self.pester(host, 4)
        self.assertIn("colleague", self.system_text())
        await self.pester(host, 1)
        self.assertIn("second chef", self.system_text())
        host._classify = label_as("kitchen")
        self.model.script += ["네"]
        await host.reply("메뉴 뭐 있어요?")
        self.assertNotIn("Kitchen note", self.system_text())
        self.assertNotIn("second chef", self.system_text())

    async def test_kitchen_and_other_messages_cost_no_budget(self):
        for label in ("kitchen", "other"):
            host = self.host(1, "네")
            host._classify = label_as(label)
            result = await host.reply("메뉴요")
            self.assertEqual(result["actions"], [])
            self.assertEqual(self.session._small_talk_turns, 0)

    async def test_a_failed_label_just_answers_without_spending_budget(self):
        async def broken(text):
            raise RuntimeError("down")
        host = self.host(1, "네")
        host._classify = broken
        result = await host.reply("수다")
        self.assertFalse(result["failed"])
        self.assertEqual(result["reply"], "네")
        self.assertEqual(self.session._small_talk_turns, 0)

    async def test_ordering_costs_no_conversation_budget(self):
        host = self.host(1, order(), "네")
        host._classify = label_as("kitchen")
        await host.reply("레몬 파스타요")
        self.assertEqual(self.session._small_talk_turns, 0)


@unittest.skipUnless(BaseLlm, "ADK not installed")
class MessageApiTests(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.app = create_app()
        self.app.state.sessions = SessionStore(clock=self.clock)
        self.script = []
        self.app.state.host_factory = lambda session: HostAgent(
            session, ScriptedModel(model="scripted", script=self.script, requests=[]), classify=label_as("kitchen"))
        self.client = TestClient(self.app)
        self.session_id = self.client.post("/sessions").json()["session_id"]
        self.path = f"/sessions/{self.session_id}/messages"

    def test_message_orders_and_state_shows_it(self):
        self.script += [order(), "네, 받았어요!"]
        response = self.client.post(self.path, json=dict(text="레몬 파스타요"))
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["reply"], "네, 받았어요!")
        self.assertEqual(body["actions"][0]["order_ids"], ["order_1"])
        self.assertFalse(body["failed"])
        state = self.client.get(f"/sessions/{self.session_id}/state").json()
        self.assertEqual(state["orders"][0]["status"], "cooking")

    def test_language_reaches_the_host_and_can_switch_in_the_same_session(self):
        self.script += ["Hello!", "안녕하세요!"]
        for language, expected in (("en", "English"), ("ko", "Korean")):
            response = self.client.post(self.path, json=dict(text="hello", language=language))
            self.assertEqual(response.status_code, 200)
            host = self.app.state.sessions.get(self.session_id).host
            self.assertIn(f"Reply in {expected} for this turn", host._instruction())

    def test_language_is_validated_and_missing_credentials_use_english(self):
        from pasta_chef.config import ConfigurationError
        for language in ("fr", "", 1, {"en": True}):
            self.assertEqual(self.client.post(self.path, json=dict(text="hello", language=language)).status_code, 422)
        self.app.state.host_factory = lambda session: (_ for _ in ()).throw(ConfigurationError("missing"))
        response = self.client.post(self.path, json=dict(text="hello", language="en"))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["failed"])
        self.assertIn("Sorry", response.json()["reply"])

    def test_invalid_messages(self):
        for body in (dict(text=""), dict(text="   "), dict(text="가" * 501), dict(text=1), dict(),
                     dict(text="hi", extra=1)):
            with self.subTest(body):
                self.assertEqual(self.client.post(self.path, json=body).status_code, 422)
        self.assertEqual(self.client.post("/sessions/missing/messages", json=dict(text="hi")).status_code, 404)

    def test_a_second_message_during_a_reply_is_refused(self):
        self.script += ["안녕하세요!"]
        self.client.post(self.path, json=dict(text="안녕하세요"))
        self.app.state.sessions.get(self.session_id).host_busy = True
        response = self.client.post(self.path, json=dict(text="여보세요"))
        self.assertEqual(response.status_code, 409)

    def test_the_busy_flag_clears_after_a_reply(self):
        self.script += ["하나", "둘"]
        self.client.post(self.path, json=dict(text="하나"))
        self.assertEqual(self.client.post(self.path, json=dict(text="둘")).status_code, 200)

    def test_too_many_messages(self):
        self.script += ["네"]
        self.client.post(self.path, json=dict(text="하나"))
        self.app.state.sessions.get(self.session_id).host.messages = MAX_MESSAGES_PER_SESSION
        self.assertEqual(self.client.post(self.path, json=dict(text="둘")).status_code, 429)

    def test_missing_credentials_get_a_fixed_reply_not_a_server_error(self):
        from pasta_chef.config import ConfigurationError

        def unavailable(session):
            raise ConfigurationError("no key")
        self.app.state.host_factory = unavailable
        response = self.client.post(self.path, json=dict(text="안녕하세요"))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["failed"])
        self.assertEqual(response.json()["reply"], FALLBACK_REPLY)

    def test_new_session_describes_its_kitchen_for_the_browser(self):
        body = self.client.post("/sessions", json=dict(chefs=2)).json()
        self.assertEqual(body["initial_state"]["time"], 0)
        self.assertIn("chef_2", body["initial_state"]["resources"])
        self.assertEqual(body["recipes"]["lemon_pasta"]["id"], "lemon_pasta")


class HostEvaluationCaseTests(unittest.TestCase):
    def test_cases_are_well_formed(self):
        cases = json.loads((ROOT / "evaluation" / "host_cases.json").read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(cases), 30)
        self.assertEqual(len({case["id"] for case in cases}), len(cases))
        menus = {"lemon_pasta", "seafood_tomato"}
        for case in cases:
            with self.subTest(case["id"]):
                self.assertTrue(case["messages"])
                self.assertTrue(set(case["expect_orders"]) <= menus)

    def test_scoring(self):
        from evaluation.host_eval import score_case
        case = dict(expect_orders={"lemon_pasta": 2}, reply_must_not_include=["피자"])
        ok = dict(orders=["lemon_pasta", "lemon_pasta"], replies=["두 접시 받았어요"], failed=False)
        self.assertEqual(score_case(case, ok), [])
        self.assertTrue(score_case(case, dict(ok, orders=["lemon_pasta"])))
        self.assertTrue(score_case(case, dict(ok, replies=["피자는 없어요"])))
        self.assertTrue(score_case(case, dict(ok, failed=True)))


if __name__ == "__main__":
    unittest.main()
