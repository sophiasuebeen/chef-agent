import assert from 'node:assert/strict';
import test from 'node:test';
import { tables, waypoints } from '../src/data/layout.ts';
import { blocked } from '../src/game/movement.ts';
import { staffRoute, taskWaypoint } from '../src/game/restaurant.ts';
import { chefLabel, describeAction } from '../src/live.ts';

test('both waiters can reach every table and return through the connected aisle graph', () => {
  for (const table of tables) for (const from of ['wp.front.w', 'wp.front.e', 'wp.pickup']) {
    const target = taskWaypoint({ kind: 'deliver', table_id: table.id });
    const route = staffRoute(from, target);
    assert.equal(route[0], from);
    assert.equal(route.at(-1), target);
    assert.ok(staffRoute(target, 'wp.pickup').length);
    for (let i = 1; i < route.length; i++) {
      assert.ok(waypoints.find((p) => p.id === route[i - 1]).links.includes(route[i]));
    }
  }
});

test('every aisle segment stays clear of furniture and arch walls', () => {
  for (const node of waypoints) for (const link of node.links) {
    const next = waypoints.find((p) => p.id === link);
    for (let i = 0; i <= 20; i++) {
      const ratio = i / 20;
      const x = node.position[0] + (next.position[0] - node.position[0]) * ratio;
      const z = node.position[2] + (next.position[2] - node.position[2]) * ratio;
      assert.equal(blocked(x, z), false, `${node.id} → ${link} blocked at ${x},${z}`);
    }
  }
});

test('staff names and manager actions are localized without being mistaken for orders', () => {
  assert.equal(chefLabel('waiter_a', 'ko'), '웨이터 A');
  assert.equal(chefLabel('waiter_b', 'en'), 'Waiter B');
  assert.equal(chefLabel('manager', 'ko'), '매니저');
  assert.match(describeAction({ type: 'manager_called' }, String, 'en'), /manager/);
  assert.match(describeAction({ type: 'waiter_reassigned', waiter_id: 'waiter_b' }, String), /웨이터 B/);
});
