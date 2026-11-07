import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryReducer, deliveryTarget, EMPTY_DELIVERY } from '../src/game/delivery.ts';
import { plateSlots, tables } from '../src/data/layout.ts';
import { blocked } from '../src/game/movement.ts';

const counter = { x: 0, z: 0.8 };
const table = tables.find((item) => item.id === 'table.hall.2');
const besideTable = { x: table.position[0] + 0.9, z: table.position[2] + 0.55 };
const act = (state, position, ready = ['order_1', 'order_2']) => deliveryReducer(state, { position, ready });

test('a ready dish moves from the pass to the hands and then to exactly one table slot', () => {
  assert.equal(blocked(besideTable.x, besideTable.z), false);
  const carried = act(EMPTY_DELIVERY, counter);
  assert.equal(carried.carried, 'order_1');
  assert.deepEqual(carried.placed, {});
  const placed = act(carried, besideTable);
  assert.equal(placed.carried, null);
  assert.equal(Object.keys(placed.placed).length, 1);
  assert.ok(plateSlots.some((slot) => slot.id === placed.placed.order_1 && table.seats.some((seat) => seat.id === slot.ownerId)));
  assert.deepEqual(EMPTY_DELIVERY, { carried: null, placed: {} });
  assert.equal(act(placed, counter).carried, 'order_2');
});

test('unready dishes, distant tables and occupied slots cannot be used', () => {
  assert.equal(act(EMPTY_DELIVERY, counter, []), EMPTY_DELIVERY);
  const carried = act(EMPTY_DELIVERY, counter);
  assert.equal(act(carried, { x: 0, z: 6 }), carried);
  const slots = plateSlots.filter((slot) => table.seats.some((seat) => seat.id === slot.ownerId));
  const full = { carried: 'order_1', placed: Object.fromEntries(slots.map((slot, i) => [`other_${i}`, slot.id])) };
  assert.equal(act(full, besideTable), full);
});

test('placed dishes can be picked up again and carry at most one dish', () => {
  const first = act(act(EMPTY_DELIVERY, counter), besideTable);
  const pickup = act(first, besideTable);
  assert.equal(pickup.carried, 'order_1');
  assert.deepEqual(pickup.placed, {});
  assert.equal(act(pickup, counter), pickup);
  assert.equal(deliveryTarget(EMPTY_DELIVERY, ['order_1'], { x: 0, z: 6 }), null);
});
