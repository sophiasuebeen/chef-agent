"""Real SDK orchestration and dining-room lifecycle, with no provider requests."""
import asyncio
from copy import deepcopy
import json
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from pasta_chef.main import create_app
from pasta_chef.runtime.sessions import LiveSession, SessionStore

try:
    from agents import Model, ModelResponse
    from agents.usage import Usage
    from openai.types.responses import ResponseFunctionToolCall, ResponseOutputMessage, ResponseOutputText
except ImportError:
    Model = None


if Model:
    class ScriptedStaffModel(Model):
        def __init__(self, *script):
            self.script = list(script)
            self.requests = []

        async def get_response(self, system_instructions, input, *args, **kwargs):
            self.requests.append(dict(instructions=system_instructions, input=deepcopy(input)))
            step = self.script.pop(0)
            if isinstance(step, Exception):
                raise step
            if isinstance(step, str):
                output = [ResponseOutputMessage(id=f"msg_{len(self.requests)}", type="message", role="assistant",
                          status="completed", content=[ResponseOutputText(type="output_text", text=step, annotations=[])])]
            else:
                output = [ResponseFunctionToolCall(id=f"fc_{len(self.requests)}_{i}", type="function_call",
                          call_id=f"call_{len(self.requests)}_{i}", name=name, arguments=json.dumps(arguments))
                          for i, (name, arguments) in enumerate(step)]
            return ModelResponse(output=output, usage=Usage(), response_id=None)

        async def stream_response(self, *args, **kwargs):
            raise NotImplementedError
            yield


def order(menu="lemon_pasta", quantity=1):
    return [("place_order", dict(menu_id=menu, quantity=quantity))]


class RestaurantRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.session = LiveSession(speed=10, clock=lambda: self.now, chefs=2)
        self.room = self.session.restaurant

    def test_seating_assigns_balanced_staff_and_remembers_the_same_table(self):
        self.room.seat("seat.hall.1.a")
        first = self.room.tables["table.hall.1"]["waiter_id"]
        self.room.seat("seat.terrace.6.d")
        self.assertNotEqual(self.room.tables["table.terrace.6"]["waiter_id"], first)
        self.assertFalse(self.room.tables["table.hall.1"]["seated"])
        self.room.seat("seat.hall.1.b")
        self.assertEqual(self.room.tables["table.hall.1"]["waiter_id"], first)

    def test_bad_seat_does_not_change_state(self):
        self.room.seat("seat.hall.1.a")
        before = self.room.snapshot()
        for seat in ("seat.hall.11.a", "seat.terrace.7.a", "seat.hall.01.a", "seat.hall.1.e", "oops"):
            with self.assertRaises(ValueError):
                self.room.seat(seat)
        self.assertEqual(before, self.room.snapshot())

    def test_leaving_cancels_greeting_and_old_arrival_cannot_greet_new_customer(self):
        self.room.seat("seat.hall.1.a")
        task = self.room.waiters["waiter_a"]["task"]
        self.room.leave()
        self.room.seat("seat.hall.2.a")
        with self.assertRaises(ValueError):
            self.room.arrive("waiter_a", task["id"])
        self.assertFalse(self.room.tables["table.hall.2"]["greeted"])

    def greet(self):
        task = self.room.waiters["waiter_a"]["task"]
        return self.room.arrive("waiter_a", task["id"], "en")

    def test_cooking_readiness_pickup_and_delivery_are_distinct_and_idempotent(self):
        self.room.seat("seat.hall.1.a")
        self.assertIn("Welcome", self.greet()["notice"]["text"])
        accepted = self.session.add_orders([("lemon_pasta", 900)])
        self.room.remember_orders("table.hall.1", [o.id for o in accepted])
        self.assertIsNone(self.room.waiters["waiter_a"]["task"])
        self.now = 200
        state = self.room.snapshot()
        pickup = state["waiters"][0]["task"]
        self.assertEqual(pickup["kind"], "pickup")
        self.assertEqual(state["delivered"], {})
        result = self.room.arrive("waiter_a", pickup["id"])
        deliver = result["restaurant"]["waiters"][0]["task"]
        self.assertEqual(deliver["kind"], "deliver")
        self.assertEqual(result["restaurant"]["waiters"][0]["carrying"], "order_1")
        self.assertFalse(self.room.reassign("table.hall.1", "waiter_b")["ok"])
        with self.assertRaises(ValueError):
            self.room.arrive("waiter_a", pickup["id"])
        delivered = self.room.arrive("waiter_a", deliver["id"])["restaurant"]["delivered"]
        self.assertEqual(delivered["order_1"]["seat_id"], "seat.hall.1.a")
        with self.assertRaises(ValueError):
            self.room.arrive("waiter_a", deliver["id"])
        self.assertEqual(len(self.room.delivered), 1)

    def test_full_table_keeps_extra_plates_at_the_pass(self):
        self.room.seat("seat.hall.1.a")
        self.greet()
        accepted = self.session.add_orders([("lemon_pasta", 900)] * 5)
        self.room.remember_orders("table.hall.1", [o.id for o in accepted])
        self.now = 1000
        for _ in range(4):
            self.room.sync()
            self.room.arrive("waiter_a", self.room.waiters["waiter_a"]["task"]["id"])
            self.room.arrive("waiter_a", self.room.waiters["waiter_a"]["task"]["id"])
        self.assertEqual(len({d["seat_id"] for d in self.room.delivered.values()}), 4)
        self.assertIsNone(self.room.waiters["waiter_a"]["task"])

    def test_snapshot_is_detached_and_sessions_are_isolated(self):
        state = self.room.seat("seat.hall.1.a")
        state["tables"][0]["order_ids"].append("fake")
        self.assertEqual(self.room.tables["table.hall.1"]["order_ids"], [])
        self.assertEqual(LiveSession().restaurant.snapshot()["tables"], [])


@unittest.skipUnless(Model, "OpenAI Agents SDK not installed")
class RestaurantTeamTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        from pasta_chef.agents.team import RestaurantTeam
        self.now = 0
        self.session = LiveSession(clock=lambda: self.now)
        self.session.restaurant.seat("seat.hall.1.a")
        self.model = ScriptedStaffModel()
        self.team = RestaurantTeam(self.session, self.model)

    async def test_real_sdk_tool_loop_places_once_and_keeps_chefs_cooking(self):
        self.model.script = [order(), order(), "주문 받았어요"]
        result = await self.team.reply("레몬 파스타요", language="ko")
        self.assertFalse(result["failed"])
        self.assertEqual(result["speaker"], "waiter_a")
        self.assertEqual(len(result["actions"]), 1)
        self.assertEqual(self.session.restaurant.tables["table.hall.1"]["order_ids"], ["order_1"])
        self.assertEqual(self.session.snapshot()["chef_hold"]["status"], "none")
        self.assertIn("Reply in Korean", self.model.requests[0]["instructions"])
        self.assertTrue(any(item.get("type") == "function_call_output" for item in self.model.requests[-1]["input"]))

    async def test_manager_handoff_reassigns_and_next_turn_uses_new_waiter(self):
        self.model.script = [[("call_manager", {})], [("reassign_waiter", {"waiter_id": "waiter_b"})], "담당 직원을 바꿨어요", "안녕하세요"]
        result = await self.team.reply("매니저님 불러 주세요")
        self.assertFalse(result["failed"])
        self.assertEqual(result["speaker"], "manager")
        self.assertEqual({a["type"] for a in result["actions"]}, {"manager_called", "waiter_reassigned"})
        result = await self.team.reply("안녕하세요")
        self.assertEqual(result["speaker"], "waiter_b")
        self.assertIn("WaiterAgent_B", self.model.requests[-1]["instructions"])

    async def test_order_status_and_memories_are_scoped_to_the_table(self):
        self.model.script = [order(), "첫 테이블입니다", "둘째 테이블입니다", "다시 오셨네요"]
        await self.team.reply("첫 주문")
        self.session.restaurant.seat("seat.hall.2.a")
        await self.team.reply("다른 테이블")
        self.assertEqual(self.team.get_order_status()["orders"], [])
        self.assertNotIn("첫 주문", json.dumps(self.model.requests[-1]["input"], ensure_ascii=False))
        self.session.restaurant.seat("seat.hall.1.a")
        await self.team.reply("돌아왔어요")
        self.assertIn("첫 주문", json.dumps(self.model.requests[-1]["input"], ensure_ascii=False))
        self.assertEqual(len(self.team.get_order_status()["orders"]), 1)

    async def test_failure_after_tool_preserves_order_and_truthful_fallback(self):
        self.model.script = [order(), RuntimeError("secret provider details")]
        with self.assertLogs("pasta_chef.agents.team", "WARNING") as logs:
            result = await self.team.reply("주문이요")
        self.assertTrue(result["failed"])
        self.assertIn("주문 받았어요", result["reply"])
        self.assertEqual(len(self.session.restaurant.tables["table.hall.1"]["order_ids"]), 1)
        self.assertNotIn("secret", " ".join(logs.output))

    async def test_runaway_and_slow_model_are_bounded(self):
        self.model.script = [[("get_order_status", {})]] * 20
        result = await self.team.reply("현황이요")
        self.assertTrue(result["failed"])
        self.assertLessEqual(len(self.model.requests), 6)
        async def slow(*args):
            await asyncio.sleep(10)
        self.team._run_staff = slow
        with patch("pasta_chef.agents.team.REPLY_TIMEOUT_SECONDS", 0.01):
            result = await self.team.reply("안녕하세요")
        self.assertTrue(result["failed"])

    async def test_ready_status_does_not_claim_table_delivery(self):
        self.model.script = [order(), "받았어요"]
        await self.team.reply("주문")
        self.now = 200
        self.assertEqual(self.team.get_order_status()["orders"][0]["status"], "ready_at_pass")

    def test_dining_status_prefers_delivery_then_pass_then_kitchen(self):
        self.session.restaurant.delivered["order_9"] = dict(table_id="table.hall.1")
        status = self.team._dining_status
        self.assertEqual(status(dict(id="order_9", status="served")), "delivered")
        self.assertEqual(status(dict(id="order_1", status="served")), "ready_at_pass")
        self.assertEqual(status(dict(id="order_1", status="cooking")), "cooking")
        self.assertEqual(status(dict(id="order_1", status="pending")), "pending")

    async def test_advisor_reads_team_model_and_language_through_public_accessors(self):
        self.assertIs(self.team.model, self.model)
        self.assertIsNone(self.team.language)
        self.team._ensure_agent()
        self.assertIs(self.team.kitchen_advisor.agent.model, self.model)
        self.model.script = ["안녕하세요"]
        await self.team.reply("안녕하세요", language="en")
        self.assertEqual(self.team.language, "en")
        self.assertIn("English", self.team.kitchen_advisor._instruction(None, None))

    async def test_waiter_calls_real_sdk_subagent_then_answers_customer_itself(self):
        self.model.script = [
            [("ask_kitchen", {"input": "해산물 없이 달콤한 파스타와 대기 시간을 확인해 주세요"})],
            [("get_menu_details", {})], [("get_kitchen_estimates", {})],
            "fig_pasta: 무화과와 버터, 치즈, 바질. 약 12분이며 유제품이 들어갑니다.",
            "달콤한 무화과 파스타를 추천해요. 약 12분 예상이고 유제품이 들어가요.",
        ]
        before = self.session.snapshot()
        result = await self.team.reply("해산물 없이 달콤한 걸 추천해줘. 얼마나 걸려?", language="ko")
        self.assertFalse(result["failed"])
        self.assertEqual(result["speaker"], "waiter_a")
        self.assertEqual([a['type'] for a in result['actions']], ['kitchen_consulted'])
        self.assertEqual(result['progress']['phase'], 'checked')
        self.assertEqual(self.session.snapshot(), before)
        self.assertIn('KitchenAdvisorAgent', self.model.requests[1]['instructions'])
        self.assertIn('Use Korean', self.model.requests[1]['instructions'])
        self.assertIn('WaiterAgent_A', self.model.requests[-1]['instructions'])
        tool_results = [item for item in self.model.requests[-1]['input'] if item.get('type') == 'function_call_output']
        self.assertIn('fig_pasta', tool_results[-1]['output'])
        self.assertNotIn('KitchenAdvisorAgent', json.dumps(self.team._histories['table.hall.1'], ensure_ascii=False))

    async def test_simple_fig_order_does_not_call_advisor(self):
        self.model.script = [order('fig_pasta'), '무화과 파스타 주문 받았어요']
        result = await self.team.reply('무화과 파스타 하나요')
        self.assertFalse(result['failed'])
        self.assertEqual([a['type'] for a in result['actions']], ['order_accepted'])
        self.assertTrue(all('KitchenAdvisorAgent' not in r['instructions'] for r in self.model.requests))
        self.assertEqual(self.session.snapshot()['orders'][0]['menu'], 'fig_pasta')
        self.assertIsNone(result['progress'])

    async def test_kitchen_estimates_leave_real_queue_untouched_and_match_service(self):
        self.session.add_orders([('seafood_tomato', 900)])
        self.team._ensure_agent()
        before = deepcopy(self.session.snapshot())
        events = deepcopy(self.session.live.kitchen.state.events)
        estimates = self.team.kitchen_advisor.get_kitchen_estimates()
        self.assertEqual(estimates['active_orders'], 1)
        self.assertEqual(set(estimates['menus']), {'lemon_pasta', 'seafood_tomato', 'fig_pasta'})
        self.assertEqual(self.session.snapshot(), before)
        self.assertEqual(self.session.live.kitchen.state.events, events)
        actual = self.session.add_orders([('fig_pasta', 900)])[0]
        self.assertEqual(self.session.ready_in_seconds([actual.id]), estimates['menus']['fig_pasta']['ready_in_seconds'])

    async def test_advisor_has_only_read_tools_and_failure_returns_control_to_waiter(self):
        self.team._ensure_agent()
        self.assertEqual({t.name for t in self.team.kitchen_advisor.agent.tools},
                         {'get_menu_details', 'get_kitchen_estimates', 'get_order_status'})
        self.assertEqual(self.team.kitchen_advisor.agent.handoffs, [])
        self.model.script = [[('ask_kitchen', {'input': '추천해주세요'})], RuntimeError('private provider details'),
                             '주방에 확인하지 못했어요. 잠시 후 다시 도와드릴게요.']
        with self.assertLogs('pasta_chef.agents.team', 'WARNING') as logs:
            result = await self.team.reply('추천해주세요')
        self.assertFalse(result['failed'])
        self.assertEqual(result['speaker'], 'waiter_a')
        self.assertEqual(result['actions'], [])
        self.assertEqual(self.session.snapshot()['orders'], [])
        self.assertNotIn('private', ' '.join(logs.output) + result['reply'])
        self.assertEqual(result['progress']['phase'], 'unavailable')

    async def test_consultation_budget_resets_on_the_next_customer_turn(self):
        self.model.script = [[('ask_kitchen', {'input': '무화과 재료'})], 'fig_pasta includes fig.', '무화과예요',
                             [('ask_kitchen', {'input': '무화과 조리법'})], 'Figs are sliced.', '무화과를 썰어요']
        for question in ('무화과 파스타 재료는?', '만드는 법은?'):
            result = await self.team.reply(question)
            self.assertFalse(result['failed'])
            self.assertEqual([a['type'] for a in result['actions']], ['kitchen_consulted'])

    async def test_duplicate_consultations_in_one_model_response_run_the_child_once(self):
        self.model.script = [[('ask_kitchen', {'input': '무화과 재료'}), ('ask_kitchen', {'input': '무화과 재료'})],
                             [('get_menu_details', {})], 'fig_pasta contains figs and dairy.', '무화과와 유제품이 들어가요']
        result = await self.team.reply('무화과 파스타 재료는?')
        self.assertFalse(result['failed'])
        self.assertEqual([a['type'] for a in result['actions']], ['kitchen_consulted'])
        self.assertEqual(sum('KitchenAdvisorAgent' in request['instructions'] for request in self.model.requests), 2)


class RestaurantApiTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.now = 0
        self.app.state.sessions = SessionStore(clock=lambda: self.now)
        self.client = TestClient(self.app)
        self.session_id = self.client.post("/sessions").json()["session_id"]
        self.path = f"/sessions/{self.session_id}/restaurant"

    def test_seat_order_walk_and_delivery_through_api(self):
        response = self.client.post(self.path + "/seat", json=dict(seat_id="seat.terrace.1.c"))
        self.assertEqual(response.status_code, 200)
        task = response.json()["waiters"][0]["task"]
        self.assertEqual(self.client.post(self.path + "/arrivals", json=dict(waiter_id="waiter_a", task_id=task["id"])).status_code, 200)
        self.client.post(f"/sessions/{self.session_id}/orders", json=dict(menu="lemon_pasta", time_limit=900))
        self.now = 200
        for _ in range(2):
            task = self.client.get(self.path).json()["waiters"][0]["task"]
            response = self.client.post(self.path + "/arrivals", json=dict(waiter_id="waiter_a", task_id=task["id"], language="en"))
            self.assertEqual(response.status_code, 200)
        self.assertIn("Enjoy", response.json()["notice"]["text"])
        self.assertEqual(response.json()["restaurant"]["delivered"]["order_1"]["seat_id"], "seat.terrace.1.c")
        self.assertEqual(self.client.post(self.path + "/arrivals", json=dict(waiter_id="waiter_a", task_id=task["id"])).status_code, 409)

    def test_invalid_inputs_and_busy_conversation_do_not_move_customer(self):
        self.assertEqual(self.client.post(self.path + "/seat", json=dict(seat_id="seat.hall.100.a")).status_code, 422)
        self.assertEqual(self.client.post(self.path + "/arrivals", json=dict(waiter_id="manager", task_id=1)).status_code, 422)
        self.app.state.sessions.get(self.session_id).host_busy = True
        self.assertEqual(self.client.post(self.path + "/seat", json=dict(seat_id="seat.hall.1.a")).status_code, 409)
        self.assertEqual(self.client.delete(self.path + "/seat").status_code, 409)
        self.assertIsNone(self.client.get(self.path).json()["active_table"])

    def test_progress_before_any_conversation_is_empty_and_unknown_session_is_404(self):
        response = self.client.get(f'/sessions/{self.session_id}/messages/progress')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), dict(busy=False, progress=None))
        self.assertEqual(self.client.get('/sessions/missing/messages/progress').status_code, 404)

    @unittest.skipUnless(Model, 'OpenAI Agents SDK not installed')
    def test_sdk_consultation_action_reaches_http_client_with_waiter_speaker(self):
        from pasta_chef.agents.team import RestaurantTeam
        model = ScriptedStaffModel([('ask_kitchen', {'input': '달콤한 메뉴'})],
                                  [('get_menu_details', {})], 'fig_pasta has sweet figs.', '무화과 파스타를 추천해요')
        self.app.state.host_factory = lambda session: RestaurantTeam(session, model)
        response = self.client.post(f'/sessions/{self.session_id}/messages', json=dict(text='달콤한 메뉴 추천해주세요', language='ko'))
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body['failed'])
        self.assertEqual(body['speaker'], 'waiter_a')
        self.assertEqual(body['actions'][0]['type'], 'kitchen_consulted')
        self.assertEqual(self.client.get(f'/sessions/{self.session_id}/state').json()['orders'], [])


@unittest.skipUnless(Model, 'OpenAI Agents SDK not installed')
class LiveConsultationProgressTests(unittest.IsolatedAsyncioTestCase):
    async def test_http_progress_reports_actual_child_start_before_parent_answer(self):
        import httpx
        from pasta_chef.agents.team import RestaurantTeam
        entered, release = asyncio.Event(), asyncio.Event()

        class PausingKitchenModel(ScriptedStaffModel):
            async def get_response(self, system_instructions, input, *args, **kwargs):
                if 'KitchenAdvisorAgent' in system_instructions:
                    entered.set()
                    await release.wait()
                return await super().get_response(system_instructions, input, *args, **kwargs)

        model = PausingKitchenModel([('ask_kitchen', {'input': '추천'})], 'fig_pasta includes figs.', '무화과 파스타를 추천해요', '안녕하세요')
        app = create_app()
        app.state.host_factory = lambda session: RestaurantTeam(session, model)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            session_id = (await client.post('/sessions')).json()['session_id']
            path = f'/sessions/{session_id}/messages'
            message = asyncio.create_task(client.post(path, json=dict(text='추천해주세요')))
            try:
                await asyncio.wait_for(entered.wait(), 3)
                progress = (await client.get(path + '/progress')).json()
                self.assertTrue(progress['busy'])
                self.assertEqual(progress['progress'], dict(turn=1, phase='checking', speaker='waiter_a'))
                self.assertFalse(message.done())
            finally:
                release.set()
            answer = await message
            self.assertFalse(answer.json()['failed'])
            self.assertEqual(answer.json()['progress']['phase'], 'checked')
            self.assertEqual((await client.get(path + '/progress')).json()['busy'], False)
            # A later ordinary message must not replay the previous kitchen notification.
            plain = await client.post(path, json=dict(text='안녕하세요'))
            self.assertIsNone(plain.json()['progress'])
            self.assertIsNone((await client.get(path + '/progress')).json()['progress'])

    async def test_child_timeout_leaves_an_unavailable_progress_result(self):
        from pasta_chef.agents.team import RestaurantTeam
        entered = asyncio.Event()

        class HangingKitchenModel(ScriptedStaffModel):
            async def get_response(self, system_instructions, input, *args, **kwargs):
                if 'KitchenAdvisorAgent' in system_instructions:
                    entered.set()
                    await asyncio.Event().wait()
                return await super().get_response(system_instructions, input, *args, **kwargs)

        team = RestaurantTeam(LiveSession(), HangingKitchenModel([('ask_kitchen', {'input': '추천'})]))
        run_staff = team._run_staff

        async def expire_after_child_starts(*args):
            from contextlib import suppress
            running = asyncio.create_task(run_staff(*args))
            try:
                await asyncio.wait_for(entered.wait(), 5)
            finally:
                running.cancel()
                with suppress(asyncio.CancelledError):
                    await running
            # Deterministic timeout injection after the child is running, independent of CPU load.
            raise TimeoutError

        team._run_staff = expire_after_child_starts
        result = await team.reply('추천해주세요')
        self.assertTrue(entered.is_set())
        self.assertTrue(result['failed'])
        self.assertEqual(result['progress']['phase'], 'unavailable')
        self.assertEqual(result['actions'], [])


if __name__ == "__main__":
    unittest.main()
