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

export const isChefResource = (name: string) => name === 'chef' || name.startsWith('chef_');

/** Same names as the simulator: chef, chef_2, ... */
export const chefNamesFor = (count: number) =>
  Array.from({ length: count }, (_, index) => index === 0 ? 'chef' : `chef_${index + 1}`);

export const idleResources = (chefs: number): ReplayState['resources'] =>
  Object.fromEntries([...chefNamesFor(chefs), 'burner', 'pot', 'pan'].map((name) => [name, null]));

const STATION_PITCH = 1.6;
const COUNTER_REACH = 0.18;

/**
 * Where a chef stands relative to a station's spot: [sideways, extra step toward the counter].
 * Each chef keeps one lane everywhere, spaced so lanes never coincide even at the next station
 * along. Three or four lanes are narrower than a chef's arms, so odd lanes also step forward.
 */
export function chefOffset(index: number, count: number): [number, number] {
  return [(index - (count - 1) / 2) * STATION_PITCH / count, count >= 3 && index % 2 === 1 ? 0.14 : 0];
}

export function chefStandPoint(station: { position: readonly number[]; chefSpot: readonly number[] },
  offset: readonly [number, number]): [x: number, z: number] {
  const toCounter = Math.sign(station.position[2]! - station.chefSpot[2]!);
  return [station.chefSpot[0]! + offset[0], station.chefSpot[2]! + toCounter * (COUNTER_REACH + offset[1])];
}

export interface ChefActivity {
  name: string;
  offset: [number, number];
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
  /** The first chef. One entry of `chefs`, kept for single-chef camera and captions. */
  chef: ChefActivity;
  chefs: ChefActivity[];
  stations: StationActivity[];
  served: { orderId: string; menu: string; servedAt: number; onTime: boolean; sequence: number }[];
}

export function kitchenFrame(replay: Replay | null, state: ReplayState | null, sequence: number, idleChefs = 1): KitchenFrame {
  const time = state?.time ?? 0;
  const idle = (name: string, index: number, count: number): ChefActivity => ({ name, offset: chefOffset(index, count),
    station: 'pass', fromStation: 'pass', motion: 'idle', taskId: null, orderId: null, elapsed: 0, travel: 1 });
  if (!replay || !state) {
    const chefs = chefNamesFor(idleChefs).map((name, index) => idle(name, index, idleChefs));
    return { time, sequence, chef: chefs[0]!, chefs, stations: [], served: [] };
  }
  const names = Object.keys(replay.initial_conditions.resources).filter(isChefResource);
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
  // The simulator does not say who serves. Show the chef who last worked on that order.
  const actionsByChef = new Map<string, ReplayEvent[]>(names.map((name) => [name, []]));
  const lastChefOfOrder = new Map<string, string>();
  for (const event of events.filter(needsChef)) {
    if (event.action !== 'task_started' && event.action !== 'order_served') continue;
    const name = event.action === 'task_started' ? event.chef ?? names[0]! : lastChefOfOrder.get(event.order_id) ?? names[0]!;
    lastChefOfOrder.set(event.order_id, name);
    actionsByChef.get(name)?.push(event);
  }
  const stationFor = (event: ReplayEvent | undefined): StationType =>
    event?.action === 'task_started' ? TASK_STATIONS[event.task_id] ?? 'prep' : 'pass';
  const chefs = names.map((name, index): ChefActivity => {
    const actions = actionsByChef.get(name) ?? [];
    const activeChef = state.running_tasks.find((task) => task.resources.includes(name));
    // Service is an instantaneous simulator event and can occur while another
    // order owns the chef. Keep that chef's ongoing work; the pass still shows service.
    const latest = activeChef ? starts.find((event) => event.order_id === activeChef.order_id && event.task_id === activeChef.task_id)
      : actions.at(-1);
    const previous = latest ? actions.filter((event) => event.sequence < latest.sequence).at(-1) : undefined;
    if (!latest || (latest.action !== 'task_started' && latest.action !== 'order_served')) return idle(name, index, names.length);
    const running = latest.action === 'task_started' && state.running_tasks.some(
      (t) => t.order_id === latest.order_id && t.task_id === latest.task_id && t.resources.includes(name));
    const elapsed = Math.max(0, time - latest.time);
    // Service has no simulator duration. Hold its pose until a later chef action,
    // including a later action with the same timestamp but a higher sequence.
    return { name, offset: chefOffset(index, names.length), station: stationFor(latest),
      fromStation: previous ? stationFor(previous) : stationFor(latest),
      motion: latest.action === 'order_served' ? 'serve' : running ? MOTIONS[latest.task_id] ?? 'idle' : 'idle',
      taskId: latest.action === 'task_started' && running ? latest.task_id : null,
      orderId: latest.order_id, elapsed, travel: latest.action === 'order_served' ? 1 : Math.min(1, elapsed / 0.8) };
  });
  const active = state.running_tasks.map((task): StationActivity => {
    const startedAt = starts.find((event) => event.order_id === task.order_id && event.task_id === task.task_id)?.time ?? time;
    const duration = task.finishes_at - startedAt;
    return { station: TASK_STATIONS[task.task_id] ?? 'prep', taskId: task.task_id, orderId: task.order_id,
      menu: menuOf(task.order_id), heated: task.resources.includes('burner'),
      steam: STEAMING.includes(task.task_id),
      elapsed: time - startedAt, progress: duration > 0 ? (time - startedAt) / duration : 0 };
  });
  return { time, sequence, chef: chefs[0]!, chefs, stations: active, served };
}
