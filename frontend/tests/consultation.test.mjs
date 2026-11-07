import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceConsultation, consultationTarget } from '../src/game/consultation.ts';

const initial = () => ({ turn: 1, stage: 'meeting', returnTo: 'wp.table.terrace.1', since: 0 });

test('even an instant kitchen answer waits for the announcement and the entire return journey', () => {
  let trip = initial();
  assert.equal(consultationTarget(trip), 'wp.table.terrace.1');
  trip = advanceConsultation(trip, 1, true, true, false);
  assert.equal(trip.stage, 'announce');
  assert.equal(advanceConsultation(trip, 2, true, true, false), trip);
  trip = advanceConsultation(trip, 2.5, true, true, false);
  assert.equal(trip.stage, 'to_kitchen');
  assert.equal(consultationTarget(trip), 'wp.pickup');
  assert.equal(advanceConsultation(trip, 8, false, true, false), trip);
  trip = advanceConsultation(trip, 12, true, true, false);
  assert.equal(trip.stage, 'waiting');
  trip = advanceConsultation(trip, 12.1, true, true, false);
  assert.equal(trip.stage, 'returning');
  assert.equal(consultationTarget(trip), 'wp.table.terrace.1');
  assert.equal(advanceConsultation(trip, 15, false, true, false), trip);
  trip = advanceConsultation(trip, 23, true, true, false);
  assert.equal(trip.stage, 'done');
  assert.equal(consultationTarget(trip), null);
});

test('the waiter waits at the kitchen until the complete customer reply is available', () => {
  const trip = { ...initial(), stage: 'waiting', since: 10 };
  assert.equal(advanceConsultation(trip, 20, true, false, false), trip);
  assert.equal(advanceConsultation(trip, 21, true, true, false).stage, 'returning');
});

test('an existing dish delivery finishes before continuing the consultation visit', () => {
  for (const stage of ['meeting', 'announce', 'to_kitchen', 'waiting', 'returning']) {
    const trip = { ...initial(), stage };
    assert.equal(advanceConsultation(trip, 100, true, true, true), trip);
  }
});
