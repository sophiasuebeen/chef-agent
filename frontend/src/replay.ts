/** Replay is presentation only. Cooking decisions and durations come from the server. */
export interface Order {
  id: string;
  menu: string;
  created_at: number;
  deadline: number;
  status: string;
  completed_tasks: string[];
  served_at: number | null;
  on_time: boolean | null;
}

export interface RunningTask {
  order_id: string;
  task_id: string;
  finishes_at: number;
  resources: string[];
  remaining_time: number;
}

export interface ReplayState {
  time: number;
  orders: Order[];
  resources: Record<string, [string, string] | null>;
  running_tasks: RunningTask[];
}

interface EventBase { sequence: number; time: number; ok: boolean }
export type ReplayEvent = EventBase & (
  | { action: 'order_accepted'; order_id: string; menu: string; deadline: number }
  | { action: 'task_started'; order_id: string; task_id: string; finishes_at: number }
  | { action: 'tasks_completed'; completed: { order_id: string; task_id: string }[] }
  | { action: 'order_served'; order_id: string; on_time: boolean }
  | { action: 'time_advanced' }
  | { action: 'chef_held'; chef: string }
  | { action: 'chef_released'; chef: string }
);

export interface Replay {
  schema_version: '1.0';
  run_id: string;
  initial_conditions: ReplayState;
  recipes: Record<string, { name: string; tasks: {
    id: string; description: string; duration: number; resources: string[];
    holds?: { resources: string[]; until: string };
  }[] }>;
  scheduling_policy: { name: string; version: string; model: string | null };
  limits: Record<string, number>;
  events: ReplayEvent[];
  final_state: ReplayState;
  final_orders: (Order & { lateness: number })[];
  result: {
    status: string; completed: boolean; termination_reason: string; finished_at: number;
    total_lateness: number; max_lateness: number; unserved_order_ids: string[];
    error: string | null;
  };
}

export function validateReplay(replay: Replay): Replay {
  if (replay.schema_version !== '1.0') throw new Error('Unsupported replay schema.');
  let time = replay.initial_conditions.time;
  let sequence = 0;
  for (const event of replay.events) {
    if (!Number.isSafeInteger(event.sequence) || event.sequence !== sequence + 1 || event.time < time) {
      throw new Error('Replay events are out of order.');
    }
    time = event.time;
    sequence = event.sequence;
  }
  return replay;
}

export function replayAt(replay: Replay, time: number, sequence = Infinity): ReplayState {
  const state = structuredClone(replay.initial_conditions);
  for (const event of replay.events) {
    if (event.time > time || event.sequence > sequence) break;
    state.time = event.time;
    if (event.action === 'order_accepted') {
      state.orders.push({ id: event.order_id, menu: event.menu, created_at: event.time,
        deadline: event.deadline, status: 'pending', completed_tasks: [], served_at: null, on_time: null });
    } else if (event.action === 'task_started') {
      const order = state.orders.find((o) => o.id === event.order_id)!;
      const tasks = replay.recipes[order.menu]!.tasks;
      const task = tasks.find((t) => t.id === event.task_id)!;
      order.status = 'cooking';
      // Same rule as Kitchen.start_task: equipment held for this step is handed over.
      for (const [resource, owner] of Object.entries(state.resources)) {
        if (owner?.[0] !== order.id) continue;
        const hold = tasks.find((t) => t.id === owner[1])?.holds;
        if (hold?.until === task.id && hold.resources.includes(resource)) state.resources[resource] = null;
      }
      state.running_tasks.push({ order_id: order.id, task_id: task.id, finishes_at: event.finishes_at,
        resources: [...task.resources], remaining_time: event.finishes_at - event.time });
      for (const resource of task.resources) state.resources[resource] = [order.id, task.id];
    } else if (event.action === 'tasks_completed') {
      for (const completed of event.completed) {
        const order = state.orders.find((o) => o.id === completed.order_id)!;
        order.completed_tasks.push(completed.task_id);
        const task = state.running_tasks.find((t) => t.order_id === completed.order_id && t.task_id === completed.task_id)!;
        const kept = replay.recipes[order.menu]!.tasks.find((t) => t.id === task.task_id)?.holds?.resources ?? [];
        for (const resource of task.resources) {
          const owner = state.resources[resource];
          if (owner?.[0] === task.order_id && owner[1] === task.task_id && !kept.includes(resource)) state.resources[resource] = null;
        }
        state.running_tasks = state.running_tasks.filter((t) => t !== task);
      }
    } else if (event.action === 'chef_held') {
      state.resources[event.chef] = ['customer', 'chat'];
    } else if (event.action === 'chef_released') {
      state.resources[event.chef] = null;
    } else if (event.action === 'order_served') {
      const order = state.orders.find((o) => o.id === event.order_id)!;
      order.status = 'served';
      order.served_at = event.time;
      order.on_time = event.on_time;
    }
  }
  state.time = Math.max(replay.initial_conditions.time, Math.min(time, replay.result.finished_at));
  for (const task of state.running_tasks) task.remaining_time = task.finishes_at - state.time;
  return state;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function statesMatch(actual: ReplayState, expected: ReplayState): boolean {
  return canonical(actual) === canonical(expected);
}
