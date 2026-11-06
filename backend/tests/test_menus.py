import json
import random
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from pasta_chef.agents.chef import get_chef_instruction
from pasta_chef.main import create_app
from pasta_chef.simulation.kitchen import Kitchen
from pasta_chef.simulation.observation import build_observation
from pasta_chef.simulation.recipes import load_recipe
from pasta_chef.simulation.scripted import run_scripted

class MenuTests(unittest.TestCase):
    def test_registered_menus_and_fields(self):
        expected = [dict(id=menu, name=load_recipe(menu)['name'], ingredients=load_recipe(menu)['ingredients'])
                    for menu in ('lemon_pasta', 'seafood_tomato')]
        response = TestClient(create_app()).get('/menus')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), expected)

    def test_empty_missing_and_unregistered_recipes_excluded(self):
        with patch('pasta_chef.api.routes.menus.RECIPE_FILES', {'empty': 'empty.json', 'missing': 'missing.json'}), patch('pasta_chef.api.routes.menus.load_recipe', side_effect=[{}, FileNotFoundError()]):
            self.assertEqual(TestClient(create_app()).get('/menus').json(), [])


class SeafoodTomatoTests(unittest.TestCase):
    def test_scripted_order_overlaps_prep_with_water_and_meets_default_deadline(self):
        kitchen = Kitchen()
        order = kitchen.add_order('seafood_tomato')
        result = run_scripted(kitchen, order.id)
        self.assertEqual(result['action'], 'order_served')
        self.assertEqual((order.served_at, order.on_time), (760, True))
        started = {e['task_id']: e['time'] for e in kitchen.state.events if e['action'] == 'task_started'}
        self.assertEqual(set(started), {t['id'] for t in load_recipe('seafood_tomato')['tasks']})
        self.assertEqual((started['boil_water'], started['prepare_seafood']), (20, 20))
        self.assertTrue(all(owner is None for owner in kitchen.state.resources.values()))

    def test_lemon_scripted_event_sequence_is_unchanged(self):
        kitchen = Kitchen()
        run_scripted(kitchen, kitchen.add_order('lemon_pasta').id)
        started = [(e['time'], e['task_id']) for e in kitchen.state.events if e['action'] == 'task_started']
        self.assertEqual(started, [
            (0, 'collect_ingredients'), (20, 'boil_water'), (20, 'prepare_mint'), (40, 'crush_garlic'),
            (140, 'cook_pasta_halfway'), (380, 'reserve_water_and_drain'), (400, 'prepare_sauce'),
            (440, 'finish_pasta'), (680, 'finish_off_heat')])

    def test_unmakeable_scripted_progress_raises_instead_of_looping(self):
        kitchen = Kitchen()
        order = kitchen.add_order('seafood_tomato')
        kitchen.state.resources['chef'] = ('other', 'task')
        with self.assertRaisesRegex(ValueError, 'cannot make progress'):
            run_scripted(kitchen, order.id)

    def test_mixed_menus_never_deadlock_under_any_task_interleaving(self):
        rng = random.Random(11)
        for episode in range(200):
            kitchen = Kitchen()
            orders = [kitchen.add_order(rng.choice(('lemon_pasta', 'seafood_tomato')), 900)
                      for _ in range(rng.randint(1, 5))]
            while any(order.status != 'served' for order in orders):
                for order in orders:
                    if order.status != 'served' and 'finish_off_heat' in order.completed_tasks:
                        kitchen.serve_order(order.id)
                available = [(order_id, task) for order_id, tasks
                             in build_observation(kitchen.state)['available_tasks'].items() for task in tasks]
                if available and (not kitchen.state.running_tasks or rng.random() < 0.8):
                    kitchen.start_task(*rng.choice(available))
                elif kitchen.state.running_tasks:
                    kitchen.advance_to_next_event()
                else:
                    self.assertTrue(all(order.status == 'served' for order in orders),
                                    f'Deadlock in episode {episode}: {kitchen.state.resources}')
            self.assertTrue(all(owner is None for owner in kitchen.state.resources.values()))

    def test_http_order_execute_and_replay_for_both_offline_policies(self):
        client = TestClient(create_app())
        for policy in ('scripted', 'priority'):
            run_id = client.post('/runs').json()['run_id']
            for menu in ('seafood_tomato', 'lemon_pasta'):
                self.assertEqual(client.post(f'/runs/{run_id}/orders', json=dict(menu=menu, time_limit=2000)).status_code, 201)
            replay = client.post(f'/runs/{run_id}/execute', json=dict(policy=policy)).json()
            self.assertTrue(replay['result']['completed'], replay['result'])
            self.assertEqual(set(replay['recipes']), {'seafood_tomato', 'lemon_pasta'})
            self.assertEqual({o['menu']: o['status'] for o in replay['final_orders']},
                             {'seafood_tomato': 'served', 'lemon_pasta': 'served'})

    def test_agent_prompt_lists_every_accepted_menu_and_lemon_default_is_stable(self):
        self.assertEqual(get_chef_instruction('original'), get_chef_instruction('original', ['lemon_pasta']))
        prompt = get_chef_instruction('original', ['lemon_pasta', 'seafood_tomato'])
        self.assertIn(json.dumps(load_recipe('lemon_pasta')), prompt)
        self.assertIn(json.dumps(load_recipe('seafood_tomato')), prompt)
