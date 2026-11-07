/** Session-local plate placement. Cooking readiness always comes from the server. */
import { plateSlots, tables } from '../data/layout.ts';
import { zoneAt } from './movement.ts';

export interface DeliveryState {
  carried: string | null;
  placed: Record<string, string>;
}
export const EMPTY_DELIVERY: DeliveryState = { carried: null, placed: {} };
export interface Position { x: number; z: number }
export type DeliveryTarget = { kind: 'pickup'; orderId: string } | { kind: 'place'; slotId: string };

export function nearbyTableAt({ x, z }: Position): string | null {
  return tables.filter((table) => Math.hypot(x - table.position[0], z - table.position[2]) < 1.65)
    .sort((a, b) => Math.hypot(x - a.position[0], z - a.position[2]) - Math.hypot(x - b.position[0], z - b.position[2]))[0]?.id ?? null;
}

export function deliveryTarget(state: DeliveryState, ready: readonly string[], position: Position): DeliveryTarget | null {
  const table = tables.find((candidate) => candidate.id === nearbyTableAt(position));
  const slots = table ? plateSlots.filter((slot) => table.seats.some((seat) => seat.id === slot.ownerId))
    .filter((slot) => Math.hypot(position.x - slot.position[0], position.z - slot.position[2]) < 1.45)
    .sort((a, b) => Math.hypot(position.x - a.position[0], position.z - a.position[2]) - Math.hypot(position.x - b.position[0], position.z - b.position[2])) : [];
  if (state.carried) {
    const free = slots.find((slot) => !Object.values(state.placed).includes(slot.id));
    return free ? { kind: 'place', slotId: free.id } : null;
  }
  if (zoneAt(position.x, position.z) === 'counter') {
    const orderId = ready.find((id) => !state.placed[id]);
    return orderId ? { kind: 'pickup', orderId } : null;
  }
  for (const slot of slots) {
    const orderId = Object.keys(state.placed).find((id) => state.placed[id] === slot.id && ready.includes(id));
    if (orderId) return { kind: 'pickup', orderId };
  }
  return null;
}

export function deliveryReducer(state: DeliveryState, action: { ready: readonly string[]; position: Position }): DeliveryState {
  const target = deliveryTarget(state, action.ready, action.position);
  if (!target) return state;
  if (target.kind === 'place' && state.carried) {
    return { carried: null, placed: { ...state.placed, [state.carried]: target.slotId } };
  }
  if (target.kind === 'pickup') {
    const placed = { ...state.placed };
    delete placed[target.orderId];
    return { carried: target.orderId, placed };
  }
  return state;
}
