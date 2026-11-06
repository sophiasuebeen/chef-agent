import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { stations } from '../src/data/layout.ts';
import { createOrderSubmission } from '../src/ordering.ts';
import { replayAt, statesMatch, validateReplay } from '../src/replay.ts';
import { chefOffset, chefStandPoint, idleResources, kitchenFrame, TASK_STATIONS } from '../src/scene/replayPresentation.ts';

// The real reducer and presentation against fresh multi-chef API output.
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = JSON.parse(execFileSync(`${root}/backend/.venv/bin/python`, ['-c', `
import json
from fastapi.testclient import TestClient
from pasta_chef.main import create_app
app = create_app()
client = TestClient(app)
fixtures = []
for chefs in (2, 3, 4):
    for policy in ('scripted', 'priority'):
        for menus, limits in ((['lemon_pasta'] * 2, {}), (['lemon_pasta'] * 4, {'max_simulated_time': 4000}),
                              (['seafood_tomato', 'lemon_pasta', 'seafood_tomato'], {'max_simulated_time': 4000}),
                              (['lemon_pasta'] * 2, {'max_simulated_time': 60}), (['lemon_pasta'] * 2, {'max_actions': 3})):
            run_id = client.post('/runs', json={'chefs': chefs}).json()['run_id']
            for menu in menus:
                client.post(f'/runs/{run_id}/orders', json={'menu': menu, 'time_limit': 900})
            response = client.post(f'/runs/{run_id}/execute', json=dict(policy=policy, **limits))
            assert response.status_code == 200, response.text
            fixtures.append(response.json())
print(json.dumps(fixtures))
`], { cwd: root, env: { ...process.env, PYTHONPATH: `${root}/backend/src` }, encoding: 'utf8', maxBuffer: 2 ** 28 }));

const chefCount = (replay) => Object.keys(replay.initial_conditions.resources).filter((name) => name.startsWith('chef')).length;
const frameAt = (replay, event) => kitchenFrame(replay, replayAt(replay, event.time, event.sequence), event.sequence);

test('multi-chef fixtures really use several chefs and include partial stops', () => {
  assert.ok(fixtures.some((replay) => replay.result.completed));
  assert.ok(fixtures.some((replay) => !replay.result.completed));
  for (const replay of fixtures.filter((replay) => replay.result.completed)) {
    const used = new Set(replay.events.map((event) => event.chef).filter(Boolean));
    assert.ok(used.size >= 2, `${replay.scheduling_policy.name}: ${[...used]}`);
  }
});

test('replay rebuilds exact backend state with several chefs, including the final check', () => {
  for (const replay of fixtures) {
    validateReplay(replay);
    const actual = replayAt(replay, replay.result.finished_at);
    assert.deepEqual(actual, replay.final_state);
    assert.equal(statesMatch(actual, replay.final_state), true);
    assert.deepEqual(replayAt(replay, 0, 0), replay.initial_conditions);
  }
});

test('running tasks and resource owners name the assigned chef at every step', () => {
  for (const replay of fixtures) {
    for (const event of replay.events.filter((e) => e.action === 'task_started' && e.chef)) {
      const state = replayAt(replay, event.time, event.sequence);
      const task = state.running_tasks.find((t) => t.order_id === event.order_id && t.task_id === event.task_id);
      assert.ok(task.resources.includes(event.chef));
      assert.ok(!task.resources.includes('chef') || event.chef === 'chef');
      assert.deepEqual(state.resources[event.chef], [event.order_id, event.task_id]);
    }
  }
});

test('one Chef per chef, each following its own task', () => {
  for (const replay of fixtures) {
    const count = chefCount(replay);
    for (const event of replay.events) {
      const frame = frameAt(replay, event);
      assert.equal(frame.chefs.length, count);
      assert.equal(frame.chef, frame.chefs[0]);
      const state = replayAt(replay, event.time, event.sequence);
      for (const chef of frame.chefs) {
        const task = state.running_tasks.find((t) => t.resources.includes(chef.name));
        assert.equal(chef.taskId, task?.task_id ?? null, `${chef.name} at #${event.sequence}`);
        if (task) {
          assert.equal(chef.orderId, task.order_id);
          assert.equal(chef.station, TASK_STATIONS[task.task_id]);
          assert.notEqual(chef.motion, 'idle');
        }
      }
    }
  }
});

test('two chefs can be seen working at the same station at the same time', () => {
  const replay = fixtures.find((f) => chefCount(f) === 2 && f.scheduling_policy.name === 'priority' && f.result.completed);
  const seen = replay.events.some((event) => {
    const working = frameAt(replay, event).chefs.filter((chef) => chef.motion !== 'idle');
    return working.length === 2 && working[0].station === working[1].station;
  });
  assert.ok(seen);
});

test('service plays on the chef who last worked on that order', () => {
  const replay = fixtures.find((f) => chefCount(f) === 2 && f.result.completed);
  const service = replay.events.find((e) => e.action === 'order_served');
  const last = replay.events.filter((e) => e.sequence < service.sequence && e.action === 'task_started'
    && e.order_id === service.order_id && e.chef).at(-1);
  const frame = frameAt(replay, service);
  const server = frame.chefs.find((chef) => chef.name === last.chef);
  assert.equal(server.station, 'pass');
  assert.equal(server.motion, 'serve');
  assert.equal(frame.served.length, 1);
});

// Torso footprint: an ellipse 0.41 m wide and 0.26 m deep, the widest part of Chef.tsx.
function assertApart(frame) {
  const points = frame.chefs.map((chef) => chefStandPoint(stations.find((s) => s.type === chef.station), chef.offset));
  for (let a = 0; a < points.length; a++) {
    for (let b = a + 1; b < points.length; b++) {
      const dx = points[a][0] - points[b][0], dz = points[a][1] - points[b][1];
      assert.ok((dx / 0.41) ** 2 + (dz / 0.26) ** 2 >= 1, `${frame.chefs[a].name}/${frame.chefs[b].name} at ${points[a]} and ${points[b]}`);
    }
  }
}

test('chefs never overlap at any pair of stations, for every count', () => {
  const used = ['pantry', 'prep', 'boil', 'sauce', 'plating', 'pass'].map((type) => stations.find((s) => s.type === type));
  for (const count of [2, 3, 4]) {
    for (let a = 0; a < count; a++) {
      for (let b = a + 1; b < count; b++) {
        for (const first of used) {
          for (const second of used) {
            const p = chefStandPoint(first, chefOffset(a, count)), q = chefStandPoint(second, chefOffset(b, count));
            assert.ok(((p[0] - q[0]) / 0.41) ** 2 + ((p[1] - q[1]) / 0.26) ** 2 >= 1,
              `${count} chefs: ${a}@${first.type} ${b}@${second.type}`);
          }
        }
      }
    }
  }
  for (const replay of fixtures) for (const event of replay.events) assertApart(frameAt(replay, event));
});

test('chefs stay inside the kitchen walls', () => {
  const used = ['pantry', 'prep', 'boil', 'sauce', 'plating', 'pass'].map((type) => stations.find((s) => s.type === type));
  for (const count of [1, 2, 3, 4]) {
    for (let index = 0; index < count; index++) {
      for (const station of used) assert.ok(Math.abs(chefStandPoint(station, chefOffset(index, count))[0]) < 3.3 - 0.28);
    }
  }
});

test('before any replay, the selected number of idle chefs stand apart at the pass', () => {
  for (const count of [1, 2, 3, 4]) {
    const frame = kitchenFrame(null, null, 0, count);
    assert.equal(frame.chefs.length, count);
    assert.ok(frame.chefs.every((chef) => chef.station === 'pass' && chef.motion === 'idle'));
    assert.equal(new Set(frame.chefs.map((chef) => chef.name)).size, count);
    assertApart(frame);
    assert.equal(Object.keys(idleResources(count)).length, count + 3);
  }
  assert.deepEqual(Object.keys(idleResources(2)), ['chef', 'chef_2', 'burner', 'pot', 'pan']);
});

test('one chef keeps its original position and frame facts', () => {
  const frame = kitchenFrame(null, null, 0);
  assert.equal(frame.chefs.length, 1);
  assert.equal(frame.chef.name, 'chef');
  assert.deepEqual(frame.chef.offset, [0, 0]);
  const pass = stations.find((s) => s.type === 'pass');
  assert.deepEqual(chefStandPoint(pass, frame.chef.offset), [pass.chefSpot[0], pass.chefSpot[2] + 0.18]);
});

test('the chef count reaches POST /runs and invalid values never create a run', async () => {
  const cart = [{ menu: 'lemon_pasta', quantity: 1, time_limit: 900 }];
  const calls = [];
  const submit = createOrderSubmission(async (path, body) => { calls.push({ path, body }); return { run_id: 'r' }; });
  await submit(cart, 'priority', 1800, 3);
  assert.deepEqual(calls[0], { path: '/runs', body: { chefs: 3 } });
  calls.length = 0;
  await submit(cart, 'priority');
  assert.deepEqual(calls[0].body, { chefs: 1 });
  calls.length = 0;
  for (const chefs of [0, 5, 1.5, NaN]) await assert.rejects(submit(cart, 'priority', 1800, chefs), /셰프 수/);
  assert.equal(calls.length, 0);
});
