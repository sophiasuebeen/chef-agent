import assert from 'node:assert/strict';
import test from 'node:test';
import { nearestSeat, SEATS, sitDown, standUp } from '../src/game/seating.ts';
import { blocked } from '../src/game/movement.ts';

function approach(seat) {
  for (const radius of [0.55, 0.7, 0.85]) {
    for (let i = 0; i < 64; i++) {
      const angle = i * Math.PI / 32;
      const position = { x: seat.position[0] + Math.sin(angle) * radius,
        z: seat.position[2] + Math.cos(angle) * radius, heading: 0.7 };
      if (nearestSeat(position)?.id === seat.id) return position;
    }
  }
  return null;
}

test('every hall and terrace seat has a walkable approach and a safe way back', () => {
  assert.ok(SEATS.some((seat) => seat.type === 'banquette'));
  assert.ok(SEATS.some((seat) => seat.type === 'chair'));
  for (const seat of SEATS) {
    const position = approach(seat);
    assert.ok(position, `cannot reach ${seat.id}`);
    assert.equal(blocked(position.x, position.z), false);
    const sitting = sitDown(position);
    assert.equal(sitting.seatId, seat.id);
    assert.deepEqual(standUp(sitting), position);
    position.x += 10;
    assert.notEqual(sitting.returnTo.x, position.x, 'return position must be a snapshot');
  }
});

test('E cannot select distant chairs or approach through table collision areas', () => {
  assert.equal(sitDown({ x: 0, z: 0.8, heading: 0 }), null);
  const seat = SEATS[0];
  assert.equal(nearestSeat({ x: seat.position[0], z: seat.position[2] }), null);
});

test('a blocked exit falls back to walkable floor beside the chair', () => {
  const seat = SEATS[0];
  const next = standUp({ seatId: seat.id, returnTo: { x: seat.position[0], z: seat.position[2], heading: 1 } });
  assert.ok(next);
  assert.equal(blocked(next.x, next.z), false);
  assert.equal(next.heading, 1);
  assert.ok(Math.hypot(next.x - seat.position[0], next.z - seat.position[2]) <= 1.25 + 1e-9);
});
