"""Offline checks for rule dispatch, hidden uncertainty, and population evolution."""
from copy import deepcopy
import sys
from types import ModuleType
import unittest
from unittest.mock import patch, MagicMock

from evaluation.evolve import OfflineProposer, LLMProposer, evaluate, evolve, synthetic_case
from pasta_chef.simulation.kitchen import Kitchen
from pasta_chef.simulation.recipes import load_recipe
from pasta_chef.simulation.scheduler import DurationEMA, PriorityRule, run_priority_episode, task_features


class PrioritySchedulerTests(unittest.TestCase):
    def test_two_orders_urgent_first_and_background_overlap(self):
        kitchen = Kitchen()
        kitchen.add_order('lemon_pasta', 1500)
        kitchen.add_order('lemon_pasta', 900)
        result = run_priority_episode(kitchen)
        self.assertTrue(result['ok'])
        self.assertEqual(result['model_calls'], 0)
        self.assertTrue(all(o.on_time for o in kitchen.state.orders.values()))
        self.assertEqual(result['decisions'][0]['order_id'], 'order_2')
        starts = {(e['order_id'], e['task_id']): e for e in kitchen.state.events
                  if e['action'] == 'task_started'}
        self.assertLess(starts['order_2', 'prepare_mint']['time'],
                        starts['order_2', 'boil_water']['finishes_at'])
        self.assertTrue(all(owner is None for owner in kitchen.state.resources.values()))

    def test_arrival_interrupts_background_exactly(self):
        kitchen = Kitchen()
        kitchen.add_order('lemon_pasta', 1500)
        result = run_priority_episode(kitchen, arrivals=[
            dict(at=75, menu='lemon_pasta', time_limit=900)])
        self.assertTrue(result['ok'])
        self.assertEqual(kitchen.get_order('order_2').created_at, 75)
        self.assertTrue(any(e['action'] == 'time_advanced' and e['time'] == 75
                            for e in kitchen.state.events))
        self.assertEqual(kitchen.get_order('order_2').deadline, 975)

    def test_ema_is_updated_at_completion_and_changes_estimated_work(self):
        kitchen = Kitchen(duration_sampler=lambda order, task: task['duration'] * 2)
        order = kitchen.add_order('lemon_pasta')
        ema = DurationEMA()
        task = load_recipe(order.menu)['tasks'][0]
        run_priority_episode(kitchen, ema=ema, max_simulated_time=40)
        self.assertAlmostEqual(ema.deviation(order.menu, task), 0.2)
        self.assertEqual(ema.estimate(order.menu, task), 24)
        ema.update(order.menu, task, 40)
        self.assertAlmostEqual(ema.deviation(order.menu, task), 0.36)

    def test_future_actual_durations_are_hidden_from_rule_features(self):
        # Independent closures; the in-progress actual duration differs greatly.
        kitchens = [Kitchen(duration_sampler=lambda o, t: t['duration']),
                    Kitchen(duration_sampler=lambda o, t: t['duration'] * 10)]
        snapshots = []
        for kitchen in kitchens:
            order = kitchen.add_order('lemon_pasta')
            kitchen.start_task(order.id, 'collect_ingredients')
            kitchen.advance_to_next_event(until=5)
            before = deepcopy(kitchen.state)
            snapshots.append(task_features(kitchen, order, load_recipe(order.menu)['tasks'][0], DurationEMA()))
            self.assertEqual(before, kitchen.state)
        self.assertEqual(snapshots[0], snapshots[1])

    def test_reject_code_and_fallback_on_bad_arithmetic(self):
        for expression in ('__import__("os")', 'pt.__class__', '2 ** 100', '[pt]', 'unknown', 'True'):
            with self.subTest(expression=expression), self.assertRaises((ValueError, SyntaxError)):
                PriorityRule(expression=expression)
        kitchen = Kitchen()
        kitchen.add_order('lemon_pasta')
        result = run_priority_episode(kitchen, rule=PriorityRule(expression='1 / (pt - pt)'))
        self.assertTrue(result['ok'])
        self.assertGreater(result['rule_errors'], 0)
        self.assertEqual(kitchen.get_order('order_1').served_at, 710)

    def test_invalid_sample_and_arrival_preserve_state(self):
        kitchen = Kitchen(duration_sampler=lambda order, task: 0)
        order = kitchen.add_order('lemon_pasta')
        before = deepcopy(kitchen.state)
        with self.assertRaises(ValueError):
            kitchen.start_task(order.id, 'collect_ingredients')
        self.assertEqual(before, kitchen.state)
        with self.assertRaises(ValueError):
            run_priority_episode(kitchen, arrivals=[dict(at=-1, menu='lemon_pasta', time_limit=1)])
        self.assertEqual(before, kitchen.state)

    def test_caps_idle_arrivals_and_empty_episode(self):
        kitchen = Kitchen()
        self.assertTrue(run_priority_episode(kitchen)['ok'])
        result = run_priority_episode(kitchen, arrivals=[dict(at=100, menu='lemon_pasta', time_limit=900)],
                                      max_simulated_time=50)
        self.assertEqual(result['termination_reason'], 'simulated_time_limit')
        self.assertEqual(kitchen.state.time, 50)
        self.assertFalse(kitchen.state.orders)
        kitchen = Kitchen()
        kitchen.add_order('lemon_pasta')
        self.assertEqual(run_priority_episode(kitchen, max_actions=1)['termination_reason'], 'action_limit')

    def test_simultaneous_completions_and_boundary_validation(self):
        kitchen = Kitchen()
        order = kitchen.add_order('lemon_pasta')
        kitchen.start_task(order.id, 'collect_ingredients')
        kitchen.advance_to_next_event()
        kitchen.start_task(order.id, 'boil_water')
        kitchen.start_task(order.id, 'prepare_mint')
        kitchen.state.running_tasks[0].finishes_at = 40
        event = kitchen.advance_to_next_event(until=40)
        self.assertEqual(len(event['completed']), 2)
        self.assertTrue(all(v is None for v in kitchen.state.resources.values()))
        before = deepcopy(kitchen.state)
        with self.assertRaises(ValueError):
            kitchen.advance_to_next_event(until=39)
        self.assertEqual(before, kitchen.state)


class RuleEvolutionTests(unittest.TestCase):
    def test_keyed_duration_is_independent_of_dispatch_order(self):
        _, sample = synthetic_case(11)
        kitchen = Kitchen()
        order = kitchen.add_order('lemon_pasta')
        tasks = load_recipe(order.menu)['tasks']
        expected = [sample(order, t) for t in tasks]
        actual = {t['id']: sample(order, t) for t in reversed(tasks)}
        self.assertEqual(expected, [actual[t['id']] for t in tasks])

    def test_evolution_selects_on_training_only_and_roundtrips_rule(self):
        calls = []
        def propose(context):
            calls.append(deepcopy(context))
            return OfflineProposer()(context)
        report = evolve(propose, population=2, generations=2, train_seeds=(11,), test_seeds=(101,))
        self.assertEqual(len(calls), 6)
        self.assertEqual(len(report['history']), 2)
        self.assertEqual(len(report['lessons']), 2)
        self.assertEqual(PriorityRule(**report['rule']).expression, report['rule']['expression'])
        self.assertEqual(report['held_out'], evaluate(PriorityRule(**report['rule']), (101,)))
        self.assertTrue(all(e['metrics']['all_served'] for e in report['held_out']['episodes']))
        for call in calls:
            self.assertNotIn(101, [e['seed'] for p in call.get('parents', []) for e in p['episodes']])
        best = [h['best_fitness'] for h in report['history']]
        self.assertLessEqual(best[1], best[0])
        self.assertTrue(calls[3]['lessons'])

    def test_invalid_children_do_not_replace_valid_parents(self):
        def bad(context):
            return dict(lesson='Rejected invalid children.') if context['phase'] == 'reflect' else dict(
                name='bad', expression='open("secret")')
        report = evolve(bad, population=2, generations=1, train_seeds=(11,), test_seeds=(101,))
        self.assertTrue(all('rejected' in r for r in report['history'][0]['comparisons']))
        PriorityRule(**report['rule'])
        with self.assertRaises(ValueError):
            evolve(bad, train_seeds=(1,), test_seeds=(1,))

    def test_llm_adapter_generates_and_reflects_with_mocked_provider(self):
        client = MagicMock()
        client.models.generate_content.return_value.text = '{"name":"edd","expression":"-due"}'
        # Replace the modules themselves: patching a dotted Client path would
        # import the optional real SDK before installing the mock.
        google = ModuleType('google')
        genai = ModuleType('google.genai')
        genai.Client = MagicMock(return_value=client)
        google.genai = genai
        with patch('pasta_chef.config.require_google_credentials'), patch.dict(
            sys.modules, {'google': google, 'google.genai': genai}
        ):
            proposer = LLMProposer('mock-model')
            self.assertEqual(proposer(dict(phase='generate'))['expression'], '-due')
            client.models.generate_content.return_value.text = '{"lesson":"measured result"}'
            self.assertEqual(proposer(dict(phase='reflect'))['lesson'], 'measured result')
            proposer.close()
        client.close.assert_called_once()
        genai.Client.assert_called_once_with(http_options={'timeout': 60000})
