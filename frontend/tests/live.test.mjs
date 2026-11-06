import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { describeAction, liveReplay, mergeEvents, simulatedNow } from '../src/live.ts';
import { replayAt } from '../src/replay.ts';
import { kitchenFrame } from '../src/scene/replayPresentation.ts';

// Real API output on a fake clock: what the browser would rebuild must equal the backend's state.
const root = fileURLToPath(new URL('../../', import.meta.url));
const scenarios = JSON.parse(execFileSync(`${root}/backend/.venv/bin/python`, ['-c', `
import json
from fastapi.testclient import TestClient
from pasta_chef.main import create_app
from pasta_chef.runtime.sessions import SessionStore

results = []
for chefs in (1, 2):
    now = [0.0]
    app = create_app()
    app.state.sessions = SessionStore(clock=lambda: now[0])
    client = TestClient(app)
    info = client.post('/sessions', json=dict(speed=10, chefs=chefs)).json()
    path = f"/sessions/{info['session_id']}"
    moments = []
    session = app.state.sessions.get(info['session_id'])

    def read():
        return dict(client.get(f'{path}/state').json(), event_count=len(session.events_after(0)))
    client.post(f'{path}/orders', json=dict(menu='lemon_pasta', time_limit=900))
    now[0] += 2.5
    client.post(f'{path}/chef-hold', json=dict(seconds=60))
    for _ in range(4):
        now[0] += 20
        moments.append(read())
    client.post(f'{path}/orders', json=dict(menu='seafood_tomato', time_limit=900, quantity=2))
    for _ in range(6):
        now[0] += 60
        moments.append(read())
    events = session.events_after(0)
    results.append(dict(info=info, moments=moments, events=events))
print(json.dumps(results))
`], { cwd: root, env: { ...process.env, PYTHONPATH: `${root}/backend/src` }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));

test('state rebuilt from stream events matches the backend at every moment', () => {
  for (const { info, moments, events } of scenarios) {
    for (const moment of moments) {
      const known = events.slice(0, moment.event_count);
      const rebuilt = replayAt(liveReplay(info, known, moment.time), moment.time);
      assert.equal(rebuilt.time, moment.time);
      assert.deepEqual(rebuilt.orders, moment.orders);
      assert.deepEqual(rebuilt.resources, moment.resources);
      assert.deepEqual(rebuilt.running_tasks, moment.running_tasks);
    }
  }
});

test('a held chef shows in the rebuilt state while background cooking continues', () => {
  const { info, events } = scenarios[0];
  const state = replayAt(liveReplay(info, events.filter((e) => e.time <= 60), 60), 60);
  assert.deepEqual(state.resources.chef, ['customer', 'chat']);
  assert.deepEqual(state.running_tasks.map((task) => task.task_id), ['boil_water']);
});

test('the 3D frame draws the configured chefs from a live document', () => {
  const { info, events } = scenarios[1];
  const replay = liveReplay(info, events.filter((e) => e.time <= 30), 30);
  const state = replayAt(replay, 30);
  const frame = kitchenFrame(replay, state, replay.events.length, 2);
  assert.equal(frame.chefs.length, 2);
  assert.ok(frame.chefs.some((chef) => chef.taskId));
});

test('an empty kitchen before any order still draws idle chefs', () => {
  const frame = kitchenFrame(null, null, 0, 3);
  assert.equal(frame.chefs.length, 3);
});

test('stream events merge once and in order, even when a reconnect repeats some', () => {
  const event = (sequence) => ({ sequence, time: sequence, ok: true, action: 'time_advanced' });
  const known = [event(1), event(2)];
  assert.deepEqual(mergeEvents(known, [event(3)]).map((e) => e.sequence), [1, 2, 3]);
  assert.equal(mergeEvents(known, [event(1), event(2)]), known);
  assert.deepEqual(mergeEvents(known, [event(2), event(3), event(3), event(4)]).map((e) => e.sequence), [1, 2, 3, 4]);
  assert.deepEqual(mergeEvents([], [event(2), event(1)]).map((e) => e.sequence), [1, 2]);
});

test('simulated time follows the clock and never falls behind reported events', () => {
  assert.equal(simulatedNow(1000, 3000, 10, []), 20);
  assert.equal(simulatedNow(1000, 500, 10, []), 0);
  assert.equal(simulatedNow(1000, 3000, 10, [{ time: 45 }]), 45);
});

test('order cards say what code recorded', () => {
  const name = (menu) => ({ lemon_pasta: 'Lemon Pasta' }[menu] ?? menu);
  const base = { order_ids: [], ready_in_seconds: null, reason: null };
  assert.match(describeAction({ ...base, type: 'order_accepted', menu: 'lemon_pasta', quantity: 2, ready_in_seconds: 1370 }, name),
    /Lemon Pasta 2접시.*약 23분/);
  assert.match(describeAction({ ...base, type: 'order_accepted', menu: 'lemon_pasta', quantity: 1, ready_in_seconds: 5 }, name), /약 1분/);
  assert.match(describeAction({ ...base, type: 'order_rejected', menu: 'pizza', quantity: 1, reason: 'unsupported_menu' }, name), /메뉴에 없는.*pizza/);
  assert.match(describeAction({ ...base, type: 'order_rejected', menu: 'lemon_pasta', quantity: 100, reason: 'invalid_quantity' }, name), /1~20접시/);
});
