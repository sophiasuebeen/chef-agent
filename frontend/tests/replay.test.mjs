import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { replayAt, statesMatch, validateReplay } from '../src/replay.ts';
import { kitchenFrame, TASK_STATIONS } from '../src/scene/replayPresentation.ts';

// Exercise the real frontend reducer against fresh API output, including stopped runs.
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = JSON.parse(execFileSync(`${root}/backend/.venv/bin/python`, ['-c', `
import json
from fastapi.testclient import TestClient
from pasta_chef.main import create_app
app = create_app()
client = TestClient(app)
fixtures = []
for policy in ('scripted', 'priority'):
    for limits in ({}, {'max_actions': 1}, {'max_simulated_time': 10}, {'max_simulated_time': 710}):
        run_id = client.post('/runs').json()['run_id']
        for deadline in (900, 1):
            client.post(f'/runs/{run_id}/orders', json={'menu': 'lemon_pasta', 'time_limit': deadline})
        if policy == 'priority':
            # Two completions at t=140; actual duration differs from recipe duration.
            app.state.runs.get(run_id).kitchen.duration_sampler = lambda o, t: 120 if t['id'] == 'prepare_mint' else t['duration']
        response = client.post(f'/runs/{run_id}/execute', json=dict(policy=policy, **limits))
        assert response.status_code == 200, response.text
        fixtures.append(response.json())
# Appended so index-based lemon fixtures above keep their meaning.
for policy in ('scripted', 'priority'):
    for menus in (['seafood_tomato'], ['seafood_tomato', 'lemon_pasta'], ['seafood_tomato', 'seafood_tomato'],
                  ['fig_pasta'], ['fig_pasta', 'lemon_pasta', 'seafood_tomato']):
        run_id = client.post('/runs').json()['run_id']
        for menu in menus:
            client.post(f'/runs/{run_id}/orders', json={'menu': menu, 'time_limit': 900})
        response = client.post(f'/runs/{run_id}/execute', json=dict(policy=policy, max_simulated_time=4000))
        assert response.status_code == 200 and response.json()['result']['completed'], response.text
        fixtures.append(response.json())
print(json.dumps(fixtures))
`], { cwd: root, env: { ...process.env, PYTHONPATH: `${root}/backend/src` }, encoding: 'utf8' }));

test('replaying API events exactly matches full backend state for both policies and partial stops', () => {
  for (const replay of fixtures) {
    validateReplay(replay);
    const actual = replayAt(replay, replay.result.finished_at);
    assert.deepEqual(actual, replay.final_state);
    assert.equal(statesMatch(actual, replay.final_state), true);
    assert.deepEqual(actual.orders, replay.final_orders.map(({ lateness, ...order }) => order));
  }
});

test('a chef held for a customer is shown as busy until released', () => {
  const empty = { time: 0, orders: [], resources: { chef: null, chef_2: null }, running_tasks: [] };
  const base = { ok: true, chef: 'chef_2' };
  const replay = {
    initial_conditions: empty, recipes: {}, result: { finished_at: 100 },
    events: [
      { ...base, sequence: 1, time: 10, action: 'chef_held' },
      { ...base, sequence: 2, time: 70, action: 'chef_released' },
    ],
  };
  assert.equal(replayAt(replay, 5).resources.chef_2, null);
  assert.deepEqual(replayAt(replay, 40).resources, { chef: null, chef_2: ['customer', 'chat'] });
  assert.equal(replayAt(replay, 80).resources.chef_2, null);
});

test('sequence seeking distinguishes actions at the same simulated timestamp', () => {
  const replay = fixtures[0];
  assert.deepEqual(replayAt(replay, 0, 0), replay.initial_conditions);
  assert.equal(replayAt(replay, 0, 1).orders.length, 1);
  assert.equal(replayAt(replay, 0, 2).orders.length, 2);
  assert.equal(replayAt(replay, 0, 2).running_tasks.length, 0);
  assert.equal(replayAt(replay, 0, 3).running_tasks.length, 1);
});

test('seek backward and forward is repeatable and never mutates the document', () => {
  for (const replay of fixtures) {
    const original = structuredClone(replay);
    const states = replay.events.map((event) => replayAt(replay, event.time, event.sequence));
    for (let index = replay.events.length - 1; index >= 0; index--) {
      const event = replay.events[index];
      assert.deepEqual(replayAt(replay, event.time, event.sequence), states[index]);
    }
    assert.deepEqual(replay, original);
  }
});

test('simultaneous completions release equipment and use recorded actual durations', () => {
  const replay = fixtures[4];
  const event = replay.events.find((e) => e.action === 'tasks_completed' && e.completed.length > 1);
  assert.ok(event, 'fixture must exercise simultaneous completions');
  const after = replayAt(replay, event.time, event.sequence);
  for (const completed of event.completed) {
    assert.ok(after.orders.find((o) => o.id === completed.order_id).completed_tasks.includes(completed.task_id));
    assert.ok(!after.running_tasks.some((t) => t.order_id === completed.order_id && t.task_id === completed.task_id));
  }
  const start = replay.events.find((e) => e.action === 'task_started' && e.task_id === 'prepare_mint');
  assert.equal(start.finishes_at - start.time, 120);
  const middle = replayAt(replay, start.time + 5, start.sequence);
  assert.equal(middle.running_tasks.find((t) => t.task_id === 'prepare_mint').remaining_time, 115);
});

test('invalid schema or event order fails visibly and final mismatch is detected', () => {
  assert.throws(() => validateReplay({ ...fixtures[0], schema_version: '2.0' }), /schema/);
  const invalid = structuredClone(fixtures[0]);
  invalid.events[1].sequence = 1;
  assert.throws(() => validateReplay(invalid), /order/);
  const mismatch = structuredClone(fixtures[0].final_state);
  mismatch.orders[0].served_at++;
  assert.equal(statesMatch(mismatch, fixtures[0].final_state), false);
});

test('every recorded task maps to its existing kitchen station and chef-required work gets a motion', () => {
  const expected = { collect_ingredients: 'pantry', prepare_mint: 'prep', crush_garlic: 'prep',
    prepare_seafood: 'prep', chop_parsley: 'prep',
    slice_figs: 'prep', prepare_basil: 'prep', prepare_fig_sauce: 'sauce',
    boil_water: 'boil', cook_pasta_halfway: 'boil', reserve_water_and_drain: 'boil',
    prepare_sauce: 'sauce', start_tomato_sauce: 'sauce', simmer_tomato_sauce: 'sauce', cook_seafood: 'sauce',
    finish_pasta: 'sauce', finish_off_heat: 'plating' };
  assert.deepEqual(TASK_STATIONS, expected);
  for (const replay of fixtures) {
    for (const event of replay.events.filter((event) => event.action === 'task_started')) {
      const state = replayAt(replay, event.time, event.sequence);
      const frame = kitchenFrame(replay, state, event.sequence);
      const activity = frame.stations.find((s) => s.taskId === event.task_id && s.orderId === event.order_id);
      assert.equal(activity.station, expected[event.task_id]);
      const started = state.running_tasks.find((t) => t.task_id === event.task_id && t.order_id === event.order_id);
      if (started.resources.includes('chef')) {
        assert.equal(frame.chef.station, expected[event.task_id]);
        assert.equal(frame.chef.orderId, event.order_id);
        assert.notEqual(frame.chef.motion, 'idle');
      }
    }
  }
});

test('water keeps boiling and steaming while the chef prepares mint and garlic elsewhere', () => {
  const replay = fixtures[0];
  for (const taskId of ['prepare_mint', 'crush_garlic']) {
    const start = replay.events.find((e) => e.action === 'task_started' && e.task_id === taskId);
    const state = replayAt(replay, start.time + 2, start.sequence);
    const frame = kitchenFrame(replay, state, start.sequence);
    assert.equal(frame.chef.station, 'prep');
    assert.equal(frame.chef.taskId, taskId);
    const boil = frame.stations.find((s) => s.station === 'boil');
    assert.equal(boil.heated, true);
    assert.equal(boil.steam, true);
    assert.equal(boil.taskId, 'boil_water');
    assert.equal(frame.stations.filter((s) => s.heated).length, 1);
  }
});

test('a completed prep task does not keep animating while only background pasta cooking remains', () => {
  const replay = fixtures[0];
  const start = replay.events.find((e) => e.action === 'task_started' && e.task_id === 'cook_pasta_halfway');
  const state = replayAt(replay, start.time + 5, start.sequence);
  const frame = kitchenFrame(replay, state, start.sequence);
  assert.equal(frame.chef.motion, 'idle');
  assert.equal(frame.chef.taskId, null);
  assert.equal(frame.stations.find((s) => s.station === 'boil').heated, true);
});

test('same-timestamp service moves to pass only at its sequence, and seeking removes future dishes', () => {
  const replay = fixtures[0];
  const service = replay.events.find((e) => e.action === 'order_served');
  const before = kitchenFrame(replay, replayAt(replay, service.time, service.sequence - 1), service.sequence - 1);
  const after = kitchenFrame(replay, replayAt(replay, service.time, service.sequence), service.sequence);
  assert.equal(before.chef.station, 'plating');
  assert.equal(before.served.length, 0);
  assert.equal(after.chef.station, 'pass');
  assert.equal(after.chef.motion, 'serve');
  assert.equal(after.served.length, 1);
  const initial = kitchenFrame(replay, replayAt(replay, 0, 0), 0);
  assert.deepEqual(initial.served, []);
  assert.deepEqual(initial.stations, []);
});

test('paused and reverse-seek presentation is deterministic, including partial stops', () => {
  for (const replay of fixtures) {
    const original = structuredClone(replay);
    const frames = replay.events.map((e) => kitchenFrame(replay, replayAt(replay, e.time, e.sequence), e.sequence));
    for (const event of [...replay.events].reverse()) {
      const state = replayAt(replay, event.time, event.sequence);
      assert.deepEqual(kitchenFrame(replay, state, event.sequence), frames[event.sequence - 1]);
      assert.deepEqual(kitchenFrame(replay, state, event.sequence), kitchenFrame(replay, state, event.sequence));
    }
    const final = kitchenFrame(replay, replayAt(replay, replay.result.finished_at), replay.events.length);
    assert.equal(final.served.length, replay.final_orders.filter((o) => o.status === 'served').length);
    assert.equal(final.stations.length, replay.final_state.running_tasks.length);
    assert.deepEqual(replay, original);
  }
});

test('seafood orders carry their menu to the pan and pass, separately from lemon orders', () => {
  const replay = fixtures.find((f) => f.final_orders.some((o) => o.menu === 'seafood_tomato')
    && f.final_orders.some((o) => o.menu === 'lemon_pasta'));
  const seafood = replay.final_orders.find((o) => o.menu === 'seafood_tomato');
  const simmer = replay.events.find((e) => e.action === 'task_started' && e.task_id === 'simmer_tomato_sauce');
  const frame = kitchenFrame(replay, replayAt(replay, simmer.time + 5, simmer.sequence), simmer.sequence);
  const pan = frame.stations.find((s) => s.taskId === 'simmer_tomato_sauce');
  assert.deepEqual([pan.station, pan.menu, pan.orderId, pan.heated, pan.steam], ['sauce', 'seafood_tomato', seafood.id, true, true]);
  assert.equal(frame.chef.motion, 'idle');
  const end = replay.events.length;
  const served = kitchenFrame(replay, replayAt(replay, replay.result.finished_at), end).served;
  assert.deepEqual(Object.fromEntries(served.map((s) => [s.orderId, s.menu])),
    Object.fromEntries(replay.final_orders.map((o) => [o.id, o.menu])));
});

test('fig pasta prep, sauce and plating animate and retain their menu through service', () => {
  const replay = fixtures.find((f) => f.final_orders.length === 1 && f.final_orders[0].menu === 'fig_pasta');
  for (const [task, station, motion] of [['slice_figs', 'prep', 'chop'], ['prepare_basil', 'prep', 'chop'],
    ['prepare_fig_sauce', 'sauce', 'stir'], ['finish_off_heat', 'plating', 'plate']]) {
    const start = replay.events.find((event) => event.action === 'task_started' && event.task_id === task);
    const frame = kitchenFrame(replay, replayAt(replay, start.time + 1, start.sequence), start.sequence);
    assert.equal(frame.chef.motion, motion);
    const active = frame.stations.find((item) => item.taskId === task);
    assert.equal(active.station, station);
    assert.equal(active.menu, 'fig_pasta');
    if (task === 'prepare_fig_sauce') assert.equal(active.steam, true);
  }
  const final = kitchenFrame(replay, replayAt(replay, replay.result.finished_at), replay.events.length);
  assert.equal(final.served[0].menu, 'fig_pasta');
});
