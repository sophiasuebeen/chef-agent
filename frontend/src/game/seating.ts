import { tables, type Seat } from '../data/layout.ts';
import { blocked } from './movement.ts';

export const SEATS: readonly Seat[] = tables.flatMap((table) => table.seats);
export const SEAT_REACH = 0.9;
export const SEAT_HEIGHT = 0.45;
export interface StandingPosition { x: number; z: number; heading: number }
export interface SittingState { seatId: string; returnTo: StandingPosition }

/** Approach from walkable floor; the seated player may occupy the chair's collision area. */
export function nearestSeat(position: { x: number; z: number }): Seat | null {
  if (blocked(position.x, position.z)) return null;
  return SEATS.filter((seat) => Math.hypot(position.x - seat.position[0], position.z - seat.position[2]) <= SEAT_REACH)
    .sort((a, b) => Math.hypot(position.x - a.position[0], position.z - a.position[2])
      - Math.hypot(position.x - b.position[0], position.z - b.position[2]))[0] ?? null;
}

export function sitDown(position: StandingPosition): SittingState | null {
  const seat = nearestSeat(position);
  return seat ? { seatId: seat.id, returnTo: { x: position.x, z: position.z, heading: position.heading } } : null;
}

/** Prefer the exact floor position used to sit down. Never stand inside furniture or a wall. */
export function standUp(sitting: SittingState): StandingPosition | null {
  if (!blocked(sitting.returnTo.x, sitting.returnTo.z)) return { ...sitting.returnTo };
  const seat = SEATS.find((candidate) => candidate.id === sitting.seatId);
  if (!seat) return null;
  for (const distance of [0.55, 0.75, 1, 1.25]) {
    for (let i = 0; i < 16; i++) {
      const angle = seat.rotationY + i * Math.PI / 8;
      const x = seat.position[0] + Math.sin(angle) * distance;
      const z = seat.position[2] + Math.cos(angle) * distance;
      if (!blocked(x, z)) return { x, z, heading: sitting.returnTo.heading };
    }
  }
  return null;
}
