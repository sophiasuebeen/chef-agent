import assert from 'node:assert/strict';
import test from 'node:test';
import { BAR_SECONDS, barScore, CLAVE, PROGRESSION } from '../src/game/bossaNova.ts';
import { blocked, clampCamera, MENU_BOARD, moveVector, OBSTACLES, SPAWN, step, zoneAt } from '../src/game/movement.ts';
import { describeAction, visibleActions } from '../src/live.ts';
import { replayAt } from '../src/replay.ts';
import { kitchenFrame } from '../src/scene/replayPresentation.ts';

/** Everything reachable from spawn on a fine grid, using the real collision rule. */
function reachable(cell = 0.1) {
  const key = (x, z) => `${Math.round(x / cell)},${Math.round(z / cell)}`;
  const seen = new Set([key(SPAWN[0], SPAWN[1])]);
  const queue = [[Math.round(SPAWN[0] / cell) * cell, Math.round(SPAWN[1] / cell) * cell]];
  while (queue.length) {
    const [x, z] = queue.pop();
    for (const [dx, dz] of [[cell, 0], [-cell, 0], [0, cell], [0, -cell]]) {
      const nx = x + dx, nz = z + dz;
      if (seen.has(key(nx, nz)) || blocked(nx, nz)) continue;
      seen.add(key(nx, nz));
      queue.push([nx, nz]);
    }
  }
  return { seen, has: (x, z) => seen.has(key(x, z)) };
}

test('the customer starts on free floor and can reach the counter, menu and terrace', () => {
  assert.equal(blocked(SPAWN[0], SPAWN[1]), false);
  const walk = reachable();
  const near = (predicate) => [...walk.seen].some((entry) => {
    const [x, z] = entry.split(',').map((value) => Number(value) * 0.1);
    return predicate(x, z);
  });
  assert.ok(near((x, z) => zoneAt(x, z) === 'counter'), 'counter zone');
  assert.ok(near((x, z) => zoneAt(x, z) === 'menu'), 'menu zone');
  assert.ok(near((x, z) => z > 13 && z < 16.5), 'terrace');
  assert.ok(near((x, z) => z > 6 && z < 11 && Math.abs(x) < 2), 'back of the hall');
});

test('the customer can never reach the kitchen, leave the building or pass through walls', () => {
  for (const entry of reachable().seen) {
    const [x, z] = entry.split(',').map((value) => Number(value) * 0.1);
    assert.ok(z > 0, `kitchen side at ${x},${z}`);
    if (z < 12.6) assert.ok(Math.abs(x) < 8, `outside the hall at ${x},${z}`);
    else assert.ok(Math.abs(x) < 10 && z < 19, `off the terrace at ${x},${z}`);
    // The sea wall is only passable through its four doors.
    if (z > 12.05 && z < 12.55) assert.ok([-6, -2, 2, 6].some((door) => Math.abs(x - door) < 0.65), `through the wall at ${x},${z}`);
  }
});

test('walking into a wall slides along it instead of sticking', () => {
  assert.deepEqual(step(0, 0.5, 0, -1), [0, 0.5]);
  const [x, z] = step(0, 0.5, 0.2, -1);
  assert.equal(z, 0.5);
  assert.ok(Math.abs(x - 0.2) < 1e-9);
});

test('tables and the menu board are solid, including at speed', () => {
  assert.ok(blocked(-2.15, 2.85));
  assert.ok(blocked(0, 6.4), 'olive tree');
  assert.ok(blocked(MENU_BOARD[0], MENU_BOARD[1]));
  assert.ok(OBSTACLES.length > 40);
  let [x, z] = [-2.15, 1.2]; // Straight at a table from in front.
  for (let i = 0; i < 300; i++) [x, z] = step(x, z, 0, 0.04);
  assert.equal(blocked(x, z), false);
  assert.ok(z < 2.85);
});

test('movement keys follow the camera', () => {
  const close = (actual, expected) => actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-9, `${actual} vs ${expected}`));
  close(moveVector(1, 0, 0), [0, -1]); // Forward looks at the kitchen.
  close(moveVector(0, 1, 0), [1, 0]);
  close(moveVector(1, 0, Math.PI), [0, 1]); // Turned around, forward looks at the sea.
  close(moveVector(1, 1, 0), [Math.SQRT1_2, -Math.SQRT1_2]); // Diagonals are not faster.
  close(moveVector(0, 0, 1), [0, 0]);
});

test('zones are where the customer expects', () => {
  assert.equal(zoneAt(0, 1), 'counter');
  assert.equal(zoneAt(0, 3), null);
  assert.equal(zoneAt(6, 1), null);
  assert.equal(zoneAt(MENU_BOARD[0] + 0.8, MENU_BOARD[1]), 'menu');
});

test('the camera stays inside the customer\'s room', () => {
  const close = ([x, z], [ex, ez]) => assert.ok(Math.abs(x - ex) < 1e-9 && Math.abs(z - ez) < 1e-9, `${x},${z}`);
  close(clampCamera(0, 15, 10), [0, 11.55]);
  close(clampCamera(20, 5, 5), [7.55, 5]);
  close(clampCamera(0, 5, 14), [0, 13.05]);
  close(clampCamera(0, 25, 18), [0, 25]);
});

test('bossa nova loop: same bar, same notes, and it repeats every phrase', () => {
  assert.deepEqual(barScore(3), barScore(3));
  assert.deepEqual(barScore(0), barScore(PROGRESSION.length));
  assert.notDeepEqual(barScore(0), barScore(1));
  assert.ok(BAR_SECONDS > 1.5 && BAR_SECONDS < 2.5);
});

test('bossa nova loop: guitar follows the two-bar clave and melody stays in the chord', () => {
  const steps = [...barScore(0).guitar.map((hit) => hit.step), ...barScore(1).guitar.map((hit) => hit.step + 8)];
  assert.deepEqual(steps, [...CLAVE]);
  for (let bar = 0; bar < PROGRESSION.length; bar++) {
    const score = barScore(bar);
    assert.ok(score.bass.length >= 2);
    assert.equal(score.shaker.length, 8);
    for (const hit of score.melody) assert.ok(score.guitar[0]?.notes.includes(hit.note - 12) || PROGRESSION[bar].voicing.includes(hit.note - 12));
  }
});

const held = (chef) => ({ time: 100, orders: [], running_tasks: [],
  resources: { chef: chef === 'chef' ? ['customer', 'chat'] : null, chef_2: chef === 'chef_2' ? ['customer', 'chat'] : null, burner: null, pot: null, pan: null } });

test('a chef held for a customer comes to the counter to talk, and nobody else does', () => {
  const replay = { initial_conditions: { time: 0, orders: [], running_tasks: [], resources: { chef: null, chef_2: null, burner: null, pot: null, pan: null } },
    recipes: {}, result: { finished_at: 100 }, events: [{ sequence: 1, time: 40, ok: true, action: 'chef_held', chef: 'chef_2' }] };
  const frame = kitchenFrame(replay, replayAt(replay, 100), 1, 2);
  const [first, second] = frame.chefs;
  assert.equal(second.motion, 'talk');
  assert.equal(second.station, 'pass');
  assert.notEqual(first.motion, 'talk');
  assert.deepEqual(held('chef_2').resources, replayAt(replay, 100).resources);
});

test('conversation cards: chat stays quiet, hand-off and ending are stated', () => {
  const chat = { type: 'small_talk', decision: 'chat', chef: 'chef' };
  const off = { type: 'small_talk', decision: 'hand_off', chef: 'chef_2' };
  const end = { type: 'small_talk', decision: 'end', chef: 'chef' };
  assert.deepEqual(visibleActions([chat, off, end]), [off, end]);
  assert.match(describeAction(off, (m) => m), /셰프 2/);
  assert.match(describeAction(end, (m) => m), /바빠/);
});
