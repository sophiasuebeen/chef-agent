/** Pure presentation of recorded facts. No scheduling, duration estimates or cooking rules. */
import type { StationType } from '../data/layout';
import type { Replay, ReplayEvent, ReplayState } from '../replay';

export const TASK_STATIONS: Readonly<Record<string, StationType>> = {
  collect_ingredients: 'pantry', prepare_mint: 'prep', crush_garlic: 'prep',
  prepare_seafood: 'prep', chop_parsley: 'prep',
  boil_water: 'boil', cook_pasta_halfway: 'boil', reserve_water_and_drain: 'boil',
  prepare_sauce: 'sauce', start_tomato_sauce: 'sauce', simmer_tomato_sauce: 'sauce', cook_seafood: 'sauce',
  finish_pasta: 'sauce', finish_off_heat: 'plating',
};

export type ChefMotion = 'idle' | 'collect' | 'chop' | 'crush' | 'stir' | 'drain' | 'plate' | 'serve';
const MOTIONS: Record<string, ChefMotion> = {
  collect_ingredients: 'collect', prepare_mint: 'chop', crush_garlic: 'crush',
  prepare_seafood: 'chop', chop_parsley: 'chop',
  reserve_water_and_drain: 'drain', prepare_sauce: 'stir', start_tomato_sauce: 'stir', cook_seafood: 'stir',
  finish_pasta: 'stir', finish_off_heat: 'plate',
};
const STEAMING = ['boil_water', 'cook_pasta_halfway', 'reserve_water_and_drain', 'prepare_sauce',
  'start_tomato_sauce', 'simmer_tomato_sauce', 'cook_seafood', 'finish_pasta'];

export interface ChefActivity {
  station: StationType;
  fromStation: StationType;
  motion: ChefMotion;
  taskId: string | null;
  orderId: string | null;
  elapsed: number;
  travel: number;
}

export interface StationActivity {
  station: StationType;
  taskId: string;
  orderId: string;
  menu: string;
  heated: boolean;
  steam: boolean;
  elapsed: number;
  progress: number;
}

export interface KitchenFrame {
  time: number;
  sequence: number;
  chef: ChefActivity;
  stations: StationActivity[];
  served: { orderId: string; menu: string; servedAt: number; onTime: boolean; sequence: number }[];
}

export function kitchenFrame(replay: Replay | null, state: ReplayState | null, sequence: number): KitchenFrame {
  const time = state?.time ?? 0;
  const idle: ChefActivity = { station: 'pass', fromStation: 'pass', motion: 'idle',
    taskId: null, orderId: null, elapsed: 0, travel: 1 };
  if (!replay || !state) return { time, sequence, chef: idle, stations: [], served: [] };
  const events = replay.events.filter((event) => event.sequence <= sequence && event.time <= time);
  const starts = events.filter((event) => event.action === 'task_started').reverse();
  const menuOf = (orderId: string) => state.orders.find((order) => order.id === orderId)?.menu ?? '';
  const served = events.filter((event) => event.action === 'order_served').map((event) => ({
    orderId: event.order_id, menu: menuOf(event.order_id), servedAt: event.time, onTime: event.on_time, sequence: event.sequence,
  }));
  function needsChef(event: ReplayEvent): boolean {
    if (event.action === 'order_served') return true;
    if (event.action !== 'task_started') return false;
    const order = state!.orders.find((o) => o.id === event.order_id);
    return !!order && !!replay!.recipes[order.menu]?.tasks.find((t) => t.id === event.task_id)?.resources.includes('chef');
  }
  const actions = events.filter(needsChef);
  const activeChef = state.running_tasks.find((task) => task.resources.includes('chef'));
  // Service is an instantaneous simulator event and can occur while another
  // order owns the chef. Keep that chef's ongoing work; the pass still shows service.
  const latest = activeChef ? starts.find((event) => event.order_id === activeChef.order_id && event.task_id === activeChef.task_id)
    : actions.at(-1);
  const previous = latest ? actions.filter((event) => event.sequence < latest.sequence).at(-1) : undefined;
  const stationFor = (event: ReplayEvent | undefined): StationType =>
    event?.action === 'task_started' ? TASK_STATIONS[event.task_id] ?? 'prep' : 'pass';
  let chef = idle;
  if (latest && (latest.action === 'task_started' || latest.action === 'order_served')) {
    const running = latest.action === 'task_started' && state.running_tasks.some(
      (t) => t.order_id === latest.order_id && t.task_id === latest.task_id && t.resources.includes('chef'));
    const elapsed = Math.max(0, time - latest.time);
    // Service has no simulator duration. Hold its pose until a later chef action,
    // including a later action with the same timestamp but a higher sequence.
    chef = { station: stationFor(latest), fromStation: previous ? stationFor(previous) : stationFor(latest),
      motion: latest.action === 'order_served' ? 'serve' : running ? MOTIONS[latest.task_id] ?? 'idle' : 'idle',
      taskId: latest.action === 'task_started' && running ? latest.task_id : null,
      orderId: latest.order_id, elapsed, travel: latest.action === 'order_served' ? 1 : Math.min(1, elapsed / 0.8) };
  }
  const active = state.running_tasks.map((task): StationActivity => {
    const startedAt = starts.find((event) => event.order_id === task.order_id && event.task_id === task.task_id)?.time ?? time;
    const duration = task.finishes_at - startedAt;
    return { station: TASK_STATIONS[task.task_id] ?? 'prep', taskId: task.task_id, orderId: task.order_id,
      menu: menuOf(task.order_id), heated: task.resources.includes('burner'),
      steam: STEAMING.includes(task.task_id),
      elapsed: time - startedAt, progress: duration > 0 ? (time - startedAt) / duration : 0 };
  });
  return { time, sequence, chef, stations: active, served };
}
