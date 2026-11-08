/** Live sessions in the browser. The backend decides everything; this only rebuilds what it reports. */
import type { Language } from './game/language';
import type { Replay, ReplayEvent, ReplayState } from './replay';

export interface LiveSessionInfo {
  session_id: string;
  speed: number;
  initial_state: ReplayState;
  recipes: Replay['recipes'];
}

export interface HostAction {
  type: 'order_accepted' | 'order_rejected' | 'manager_called' | 'waiter_reassigned' | 'kitchen_consulted';
  table_id?: string | null;
  waiter_id?: string | null;
  menu: string | null;
  quantity: number | null;
  order_ids: string[];
  ready_in_seconds: number | null;
  reason: string | null;
}

export interface HostReply {
  reply: string;
  actions: HostAction[];
  failed: boolean;
  speaker: string;
  progress?: StaffProgress | null;
}

export interface StaffProgress {
  turn: number;
  phase: 'checking' | 'checked' | 'unavailable';
  speaker: string;
}

export const chefLabel = (name: string, language: Language = 'ko') => {
  if (name === 'manager') return language === 'ko' ? '매니저' : 'Manager';
  if (name.startsWith('waiter_')) return `${language === 'ko' ? '웨이터' : 'Waiter'} ${name.slice(-1).toUpperCase()}`;
  const label = language === 'ko' ? '셰프' : 'Chef';
  return name === 'chef' ? label : name.replace('chef_', `${label} `);
};

export type ChatEntry =
  | { kind: 'customer'; text: string }
  | { kind: 'host'; text: string; failed: boolean; speaker?: string }
  | { kind: 'action'; action: HostAction };

/** A replay document that keeps growing, so the existing reducer and 3D scene can draw it. */
export function liveReplay(info: LiveSessionInfo, events: ReplayEvent[], now: number): Replay {
  return {
    schema_version: '1.0',
    run_id: info.session_id,
    initial_conditions: info.initial_state,
    recipes: info.recipes,
    scheduling_policy: { name: 'live', version: '1.0', model: null },
    limits: {},
    events,
    final_state: info.initial_state,
    final_orders: [],
    result: {
      status: 'running', completed: false, termination_reason: 'running', finished_at: now,
      total_lateness: 0, max_lateness: 0, unserved_order_ids: [], error: null,
    },
  };
}

/** Add stream events exactly once and in order, whatever a reconnect repeats. */
export function mergeEvents(known: ReplayEvent[], incoming: ReplayEvent[]): ReplayEvent[] {
  const added = incoming.filter((event, index) => event.sequence > known.length
    && incoming.findIndex((other) => other.sequence === event.sequence) === index);
  return added.length ? [...known, ...added].sort((a, b) => a.sequence - b.sequence) : known;
}

/** Simulated time from a local clock, never behind what the kitchen has already reported. */
export function simulatedNow(startedAtMs: number, nowMs: number, speed: number, events: ReplayEvent[]): number {
  const fromClock = Math.max(0, (nowMs - startedAtMs) / 1000 * speed);
  return Math.max(fromClock, events.at(-1)?.time ?? 0);
}

/** Words for what code recorded, so a card never depends on what the model said. */
export function describeAction(action: HostAction, menuName: (menu: string) => string, language: Language = 'ko'): string {
  if (action.type === 'kitchen_consulted') return language === 'ko' ? '담당 웨이터가 주방에 확인했어요' : 'Your waiter checked with the kitchen';
  if (action.type === 'manager_called') return language === 'ko' ? '매니저가 응대를 이어받았어요' : 'The manager has taken over';
  if (action.type === 'waiter_reassigned') return language === 'ko'
    ? `${chefLabel(action.waiter_id ?? 'waiter_a', language)}가 테이블을 담당해요`
    : `${chefLabel(action.waiter_id ?? 'waiter_a', language)} is now looking after your table`;
  if (language === 'en') {
    const dish = menuName(action.menu ?? '');
    if (action.type === 'order_accepted') {
      const minutes = Math.max(1, Math.round((action.ready_in_seconds ?? 0) / 60));
      return `Order accepted: ${action.quantity} × ${dish} · Ready in about ${minutes} min`;
    }
    if (action.reason === 'unsupported_menu') return `Cannot order: ${dish} is not on the menu`;
    if (action.reason === 'invalid_quantity') return `Cannot order: choose 1–20 plates at a time (${dish})`;
    return `Cannot order: ${dish}`;
  }
  const dish = menuName(action.menu ?? '');
  if (action.type === 'order_accepted') {
    const minutes = Math.max(1, Math.round((action.ready_in_seconds ?? 0) / 60));
    return `주문 접수: ${dish} ${action.quantity}접시 · 약 ${minutes}분 후 완성 예정`;
  }
  if (action.reason === 'unsupported_menu') return `주문 불가: 메뉴에 없는 요리예요 (${dish})`;
  if (action.reason === 'invalid_quantity') return `주문 불가: 한 번에 1~20접시만 주문할 수 있어요 (${dish})`;
  return `주문 불가: ${dish}`;
}
