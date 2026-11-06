"""Execution/replay integration tests; no provider calls or credentials."""
from copy import deepcopy
from dataclasses import asdict
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from pasta_chef.main import create_app
from pasta_chef.simulation.kitchen import Kitchen
from pasta_chef.simulation.scripted import run_scripted


class ExecutionReplayTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.client = TestClient(self.app)

    def new_run(self, deadlines=(900,)):
        run_id = self.client.post('/runs').json()['run_id']
        for deadline in deadlines:
            response = self.client.post(f'/runs/{run_id}/orders', json={
                'menu': 'lemon_pasta', 'time_limit': deadline})
            self.assertEqual(response.status_code, 201)
        return run_id

    def execute(self, run_id, **options):
        return self.client.post(f'/runs/{run_id}/execute', json=options)

    def test_both_offline_policies_return_full_detached_replay_and_served_orders(self):
        for policy in ('scripted', 'priority'):
            with self.subTest(policy):
                run_id = self.new_run((900, 1))
                response = self.execute(run_id, policy=policy)
                self.assertEqual(response.status_code, 200)
                replay = response.json()
                self.assertEqual(replay['schema_version'], '1.0')
                self.assertEqual(replay['run_id'], run_id)
                self.assertEqual(replay['scheduling_policy']['name'], policy)
                self.assertEqual(replay['scheduling_policy']['version'], '1.0')
                self.assertEqual(replay['initial_conditions']['orders'], [])
                self.assertEqual(replay['initial_conditions']['time'], 0)
                self.assertTrue(replay['recipes']['lemon_pasta']['tasks'])
                self.assertEqual(replay['result']['status'], 'completed')
                self.assertEqual(replay['result']['termination_reason'], 'completed')
                self.assertTrue(replay['result']['completed'])
                self.assertEqual(replay['result']['unserved_order_ids'], [])
                self.assertEqual(len(replay['final_orders']), 2)
                self.assertEqual({o['status'] for o in replay['final_orders']}, {'served'})
                self.assertGreater(replay['result']['total_lateness'], 0)
                for order in replay['final_orders']:
                    expected = self.client.get(f"/runs/{run_id}/orders/{order['id']}").json()
                    self.assertEqual({k: v for k, v in order.items() if k != 'lateness'}, expected)
                    self.assertEqual(order['lateness'], max(0, order['served_at'] - order['deadline']))
                self.assertEqual(self.client.get(f'/runs/{run_id}/state').json()['orders'], [])
                self.assertEqual(self.client.get(f'/runs/{run_id}/replay').json(), replay)
                # Mutating the original simulator after the fact cannot alter the artifact.
                self.app.state.runs.get(run_id).kitchen.reset()
                self.assertEqual(self.client.get(f'/runs/{run_id}/replay').json(), replay)

    def test_scripted_api_matches_existing_terminal_baseline(self):
        kitchen = Kitchen()
        kitchen.add_order('lemon_pasta', 900)
        run_scripted(kitchen, 'order_1')
        replay = self.execute(self.new_run()).json()
        self.assertEqual(replay['events'], kitchen.state.events)
        self.assertEqual(replay['final_state']['orders'], [asdict(kitchen.get_order('order_1'))])
        self.assertEqual(replay['final_state']['time'], 710)

    def test_sequences_are_contiguous_and_break_shared_timestamp_ties(self):
        replay = self.execute(self.new_run((900, 900)), policy='priority').json()
        events = replay['events']
        self.assertEqual([e['sequence'] for e in events], list(range(1, len(events) + 1)))
        self.assertEqual([e['time'] for e in events], sorted(e['time'] for e in events))
        self.assertLess(len({e['time'] for e in events}), len(events))
        self.assertEqual([e['action'] for e in events[:2]], ['order_accepted', 'order_accepted'])

    def test_action_and_time_limits_preserve_partial_state_and_stop_reason(self):
        for policy in ('scripted', 'priority'):
            for options, reason, time in (({'max_actions': 1}, 'action_limit', 0),
                                           ({'max_simulated_time': 10}, 'simulated_time_limit', 10)):
                with self.subTest(policy=policy, options=options):
                    run_id = self.new_run((1,))
                    replay = self.execute(run_id, policy=policy, **options).json()
                    self.assertEqual(replay['result']['status'], 'stopped')
                    self.assertFalse(replay['result']['completed'])
                    self.assertEqual(replay['result']['termination_reason'], reason)
                    self.assertEqual(replay['result']['finished_at'], time)
                    self.assertEqual(replay['result']['unserved_order_ids'], ['order_1'])
                    self.assertEqual(replay['final_orders'][0]['lateness'], max(0, time - 1))
                    self.assertIsNone(replay['final_orders'][0]['served_at'])
                    self.assertTrue(replay['final_state']['running_tasks'])
                    self.assertEqual(self.client.get(f'/runs/{run_id}/replay').json(), replay)

    def test_service_exactly_at_time_cap_can_complete(self):
        for policy in ('scripted', 'priority'):
            with self.subTest(policy):
                replay = self.execute(self.new_run((710,)), policy=policy, max_simulated_time=710).json()
                self.assertTrue(replay['result']['completed'])
                self.assertEqual(replay['final_orders'][0]['served_at'], 710)
                self.assertTrue(replay['final_orders'][0]['on_time'])

    def test_validation_and_lifecycle_conflicts_leave_state_unchanged(self):
        run_id = self.new_run()
        kitchen = self.app.state.runs.get(run_id).kitchen
        before = deepcopy(kitchen.state)
        self.assertEqual(self.client.get(f'/runs/{run_id}/replay').status_code, 409)
        for options in ({'policy': 'random'}, {'max_actions': 0}, {'max_actions': True},
                        {'max_actions': 10001}, {'max_simulated_time': 0},
                        {'max_simulated_time': 86401}, {'max_simulated_time': 1.5},
                        {'unexpected': 1}):
            with self.subTest(options):
                self.assertEqual(self.execute(run_id, **options).status_code, 422)
                self.assertEqual(kitchen.state, before)
        replay = self.execute(run_id).json()
        self.assertEqual(self.execute(run_id, policy='priority').status_code, 409)
        self.assertEqual(self.client.post(f'/runs/{run_id}/orders', json={
            'menu': 'lemon_pasta', 'time_limit': 900}).status_code, 409)
        self.assertEqual(self.client.get(f'/runs/{run_id}/replay').json(), replay)

    def test_default_body_unknown_run_and_empty_run(self):
        self.assertEqual(self.execute('missing').status_code, 404)
        self.assertEqual(self.client.get('/runs/missing/replay').status_code, 404)
        empty = self.new_run(())
        self.assertEqual(self.execute(empty).status_code, 409)
        self.assertIsNone(self.app.state.runs.get(empty).replay)
        response = self.client.post(f'/runs/{self.new_run()}/execute')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['scheduling_policy']['name'], 'scripted')

    def test_execution_holds_only_its_run_lock_and_busy_execution_is_rejected(self):
        target, other = self.new_run(), self.new_run()
        run = self.app.state.runs.get(target)
        with run.lock:
            self.assertEqual(self.execute(target).status_code, 409)
            self.assertEqual(self.execute(other).status_code, 200)
        from pasta_chef.api.events import run_scripted_episode
        def cook(kitchen, **limits):
            self.assertTrue(run.lock.locked())
            self.assertFalse(self.app.state.runs.get(other).lock.locked())
            return run_scripted_episode(kitchen, **limits)
        with patch('pasta_chef.api.events.run_scripted_episode', side_effect=cook):
            self.assertEqual(self.execute(target).status_code, 200)
        self.assertFalse(run.lock.locked())

    def test_agent_mode_delegates_to_existing_controller_without_live_calls(self):
        from pasta_chef.config import Settings
        from pasta_chef.simulation.scripted import run_scripted_episode
        async def offline_controller(kitchen, settings):
            self.assertEqual(settings.max_tool_calls, 42)
            self.assertEqual(settings.max_simulated_time, 1000)
            return run_scripted_episode(kitchen, max_actions=42, max_simulated_time=1000)
        with patch('pasta_chef.config.Settings.from_env', return_value=Settings()), \
             patch('pasta_chef.runtime.controller.run_agent_episode', new=AsyncMock(side_effect=offline_controller)) as controller:
            replay = self.execute(self.new_run(), policy='agent', max_actions=42, max_simulated_time=1000).json()
        controller.assert_awaited_once()
        self.assertTrue(replay['result']['completed'])
        self.assertEqual(replay['scheduling_policy']['model'], 'gemini-2.5-flash')
        self.assertEqual(replay['scheduling_policy']['prompt_variant'], 'original')

    def test_execution_failure_is_replayable_without_leaking_exception_text(self):
        run_id = self.new_run()
        with patch('pasta_chef.api.events.run_priority_episode', side_effect=RuntimeError('secret-provider-details')):
            response = self.execute(run_id, policy='priority')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['result']['status'], 'failed')
        self.assertEqual(response.json()['result']['termination_reason'], 'execution_error')
        self.assertEqual(response.json()['result']['error'], 'RuntimeError')
        self.assertNotIn('secret-provider-details', response.text)
        self.assertEqual(self.client.get(f'/runs/{run_id}/replay').json(), response.json())
        self.assertFalse(self.app.state.runs.get(run_id).lock.locked())

    def test_new_endpoints_publish_replay_and_errors(self):
        paths = self.app.openapi()['paths']
        for path, method in (('/runs/{run_id}/execute', 'post'), ('/runs/{run_id}/replay', 'get')):
            responses = paths[path][method]['responses']
            self.assertEqual(responses['200']['content']['application/json']['schema'],
                             {'$ref': '#/components/schemas/ReplayResponse'})
            for code in ('404', '409', '422'):
                self.assertEqual(responses[code]['content']['application/json']['schema'],
                                 {'$ref': '#/components/schemas/ErrorResponse'})
