"""Expanded game equipment uses real independent resources, with legacy defaults intact."""
from copy import deepcopy
import unittest
from fastapi.testclient import TestClient
from pasta_chef.main import create_app
from pasta_chef.simulation.kitchen import Kitchen
from pasta_chef.simulation.scheduler import run_priority_episode

EXPANDED = dict(burner=6, pot=3, pan=3)


class ExpandedEquipmentTests(unittest.TestCase):
    def boiling(self):
        kitchen = Kitchen(chefs=4, equipment=EXPANDED)
        orders = [kitchen.add_order('lemon_pasta', 4000).id for _ in range(4)]
        for order in orders:
            kitchen.start_task(order, 'collect_ingredients')
        kitchen.advance_to_next_event()
        for order in orders[:3]:
            kitchen.start_task(order, 'boil_water')
        return kitchen, orders

    def test_three_pots_boil_independently_and_a_fourth_cannot_steal_one(self):
        kitchen, orders = self.boiling()
        self.assertEqual(len(kitchen.state.running_tasks), 3)
        self.assertEqual({r for task in kitchen.state.running_tasks for r in task.resources if r.startswith('pot')}, {'pot', 'pot_2', 'pot_3'})
        before = deepcopy(kitchen.state)
        with self.assertRaises(ValueError):
            kitchen.start_task(orders[3], 'boil_water')
        self.assertEqual(kitchen.state, before)

    def test_each_order_keeps_its_own_pot_and_draining_releases_only_its_burner(self):
        kitchen, orders = self.boiling()
        kitchen.advance_to_next_event()
        for order in orders[:3]:
            kitchen.start_task(order, 'cook_pasta_halfway')
        for i, order in enumerate(orders[:3]):
            pot = 'pot' if i == 0 else f'pot_{i + 1}'
            self.assertEqual(kitchen.state.resources[pot], (order, 'cook_pasta_halfway'))
        kitchen.advance_to_next_event()
        kitchen.start_task(orders[1], 'reserve_water_and_drain')
        self.assertIsNone(kitchen.state.resources['burner_2'])
        self.assertEqual(kitchen.state.resources['burner'], (orders[0], 'cook_pasta_halfway'))
        self.assertEqual(kitchen.state.resources['pot_2'], (orders[1], 'reserve_water_and_drain'))

    def test_mixed_service_finishes_without_deadlock_or_resource_leaks(self):
        kitchen = Kitchen(chefs=4, equipment=EXPANDED)
        for menu in ['lemon_pasta', 'seafood_tomato'] * 3:
            kitchen.add_order(menu, 4000)
        result = run_priority_episode(kitchen, max_simulated_time=4000)
        self.assertTrue(result['ok'])
        self.assertTrue(all(order.status == 'served' for order in kitchen.state.orders.values()))
        self.assertTrue(all(owner is None for owner in kitchen.state.resources.values()))
        kitchen.reset()
        self.assertEqual(len(kitchen.state.resources), 16)

    def test_api_selects_expanded_equipment_only_when_requested(self):
        client = TestClient(create_app())
        expanded = client.post('/sessions', json=dict(equipment='expanded', chefs=4)).json()
        resources = expanded['initial_state']['resources']
        self.assertEqual(len([r for r in resources if r.startswith('pot')]), 3)
        self.assertEqual(len([r for r in resources if r.startswith('pan')]), 3)
        self.assertEqual(len([r for r in resources if r.startswith('burner')]), 6)
        standard = client.post('/sessions').json()['initial_state']['resources']
        self.assertEqual(set(standard), {'chef', 'burner', 'pot', 'pan'})
        self.assertEqual(client.post('/sessions', json=dict(equipment='unknown')).status_code, 422)
