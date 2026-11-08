"""The /messages API through the OpenAI SDK staff team with a scripted model: no provider calls."""
import json
from pathlib import Path
import unittest

from fastapi.testclient import TestClient

from pasta_chef.agents.host import FALLBACK_REPLY, MAX_MESSAGES_PER_SESSION
from pasta_chef.main import create_app
from pasta_chef.runtime.sessions import SessionStore
from test_restaurant import Model, ScriptedStaffModel, order

ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(Model, "OpenAI Agents SDK not installed")
class MessageApiTests(unittest.TestCase):
    def setUp(self):
        from pasta_chef.agents.team import RestaurantTeam
        self.app = create_app()
        self.app.state.sessions = SessionStore(clock=lambda: 1000.0)
        self.model = ScriptedStaffModel()
        self.app.state.host_factory = lambda session: RestaurantTeam(session, self.model)
        self.client = TestClient(self.app)
        self.session_id = self.client.post("/sessions").json()["session_id"]
        self.path = f"/sessions/{self.session_id}/messages"

    def test_message_orders_and_state_shows_it(self):
        self.model.script += [order(), "네, 받았어요!"]
        response = self.client.post(self.path, json=dict(text="레몬 파스타요"))
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["reply"], "네, 받았어요!")
        self.assertEqual(body["actions"][0]["order_ids"], ["order_1"])
        self.assertFalse(body["failed"])
        state = self.client.get(f"/sessions/{self.session_id}/state").json()
        self.assertEqual(state["orders"][0]["status"], "cooking")

    def test_language_reaches_the_staff_and_can_switch_in_the_same_session(self):
        self.model.script += ["Hello!", "안녕하세요!"]
        for language, expected in (("en", "English"), ("ko", "Korean")):
            response = self.client.post(self.path, json=dict(text="hello", language=language))
            self.assertEqual(response.status_code, 200)
            self.assertIn(f"Reply in {expected} for this turn", self.model.requests[-1]["instructions"])

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
        self.model.script += ["안녕하세요!"]
        self.client.post(self.path, json=dict(text="안녕하세요"))
        self.app.state.sessions.get(self.session_id).host_busy = True
        self.assertEqual(self.client.post(self.path, json=dict(text="여보세요")).status_code, 409)

    def test_the_busy_flag_clears_after_a_reply(self):
        self.model.script += ["하나", "둘"]
        self.client.post(self.path, json=dict(text="하나"))
        self.assertEqual(self.client.post(self.path, json=dict(text="둘")).status_code, 200)

    def test_too_many_messages(self):
        self.model.script += ["네"]
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


class FallbackReplyTests(unittest.TestCase):
    def test_only_en_switches_the_fallback_to_english(self):
        from pasta_chef.agents.host import fallback_reply
        accepted = [dict(type="order_accepted")]
        other = [dict(type="something_else")]
        for language in (None, "ko", "fr"):
            with self.subTest(language=language):
                self.assertEqual(fallback_reply(accepted, language), "주문 받았어요. 바로 준비할게요!")
                self.assertEqual(fallback_reply(other, language), FALLBACK_REPLY)
                self.assertEqual(fallback_reply([], language),
                                 "죄송해요, 지금은 답변을 드리기 어려워요. 잠시 후 다시 말씀해 주세요.")
        self.assertEqual(fallback_reply([]), FALLBACK_REPLY)
        self.assertEqual(fallback_reply(accepted, "en"), "Your order is confirmed. We'll start preparing it now!")
        self.assertEqual(fallback_reply(other, "en"), "Sorry, I cannot reply right now. Please try again shortly.")


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
