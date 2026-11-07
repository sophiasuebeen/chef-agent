/** Dining-room contracts and movement over the layout's existing waiter graph. */
import { waypoints } from '../data/layout.ts';

export interface StaffTask { id: number; kind: 'greet' | 'pickup' | 'deliver'; table_id: string; order_id: string | null }
export interface WaiterState { id: 'waiter_a' | 'waiter_b'; task: StaffTask | null; carrying: string | null }
export interface TableService { id: string; seat_id: string; waiter_id: string; seated: boolean; greeted: boolean; order_ids: string[] }
export interface RestaurantState {
  active_table: string | null;
  tables: TableService[];
  waiters: WaiterState[];
  delivered: Record<string, { table_id: string; seat_id: string; waiter_id: string }>;
}
export interface ServiceNotice { id: number; speaker: string; text: string; table_id: string; kind: StaffTask['kind'] }
export const EMPTY_RESTAURANT: RestaurantState = { active_table: null, tables: [], waiters: [], delivered: {} };

/** Shortest route through aisles and arch doors, rather than straight through furniture. */
export function staffRoute(from: string, to: string): string[] {
  const distances = new Map([[from, 0]]), previous = new Map<string, string>();
  const remaining = new Set(waypoints.map((point) => point.id));
  while (remaining.size) {
    const current = [...remaining].sort((a, b) => (distances.get(a) ?? Infinity) - (distances.get(b) ?? Infinity))[0]!;
    if (!distances.has(current)) break;
    if (current === to) {
      const route = [to];
      while (route[0] !== from) route.unshift(previous.get(route[0]!)!);
      return route;
    }
    remaining.delete(current);
    const node = waypoints.find((p) => p.id === current)!;
    for (const next of node.links) {
      const point = waypoints.find((p) => p.id === next)!;
      const distance = distances.get(current)! + Math.hypot(node.position[0] - point.position[0], node.position[2] - point.position[2]);
      if (distance < (distances.get(next) ?? Infinity)) { distances.set(next, distance); previous.set(next, current); }
    }
  }
  return [];
}

export function taskWaypoint(task: StaffTask): string {
  return task.kind === 'pickup' ? 'wp.pickup' : `wp.${task.table_id}`;
}
