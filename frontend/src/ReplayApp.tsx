import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { replayAt, statesMatch, validateReplay, type Replay } from './replay';
import { idleResources, isChefResource, kitchenFrame } from './scene/replayPresentation';
import type { CameraPresetId } from './data/cameraPresets';
import { OrderPanel } from './OrderPanel';
import { createOrderSubmission, type CartItem } from './ordering';
import './replay.css';

const RestaurantScene = lazy(() => import('./scene/BeachRestaurantScene').then(({ BeachRestaurantScene }) => ({ default: BeachRestaurantScene })));

class SceneBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <p className="scene-unavailable" role="alert">3D rendering is unavailable. Replay controls and backend verification remain available below.</p> : this.props.children; }
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new Error(problem?.detail ?? `API request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

const submitOrders = createOrderSubmission(api);
const start = { time: 0, sequence: 0 };
const REPLAY_CAMERAS = [
  { id: 'kitchen', label: 'Kitchen' }, { id: 'chef', label: 'Chef close-up' },
  { id: 'overview', label: 'Restaurant' }, { id: 'dining', label: 'Dining' },
] as const;
const humanize = (value: string) => value.replaceAll('_', ' ');
const seconds = (value: number) => `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, '0')}`;

export function ReplayApp() {
  const submitLock = useRef(false);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(20);
  const [position, setPosition] = useState(start);
  const [timeDraft, setTimeDraft] = useState<string | null>(null);
  const [camera, setCamera] = useState<CameraPresetId>('kitchen');
  const [loadId, setLoadId] = useState(new URLSearchParams(window.location.search).get('run') ?? '');
  const [chefCount, setChefCount] = useState(1);
  const idleChefs = Number.isInteger(chefCount) && chefCount >= 1 && chefCount <= 4 ? chefCount : 1;

  const state = useMemo(() => replay ? replayAt(replay, position.time, position.sequence) : null,
    [replay, position]);
  const match = useMemo(() => replay
    ? statesMatch(replayAt(replay, replay.result.finished_at), replay.final_state) : false, [replay]);
  const atEnd = replay !== null && position.sequence === replay.events.length;
  const frame = useMemo(() => kitchenFrame(replay, state, position.sequence, idleChefs), [replay, state, position.sequence, idleChefs]);

  useEffect(() => {
    if (!playing || !replay) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = (now - previous) / 1000 * speed;
      previous = now;
      setPosition((current) => {
        const time = Math.min(current.time + elapsed, replay.result.finished_at);
        const sequence = replay.events.filter((event) => event.time <= time).length;
        return { time, sequence };
      });
    }, 50);
    return () => window.clearInterval(timer);
  }, [playing, replay, speed]);

  useEffect(() => { if (atEnd) setPlaying(false); }, [atEnd]);

  function showReplay(data: Replay) {
    const validated = validateReplay(data);
    // Fail visibly on any reducer/contract discrepancy before playback starts.
    replayAt(validated, validated.result.finished_at);
    setReplay(validated);
    setPosition(start);
    setLoadId(validated.run_id);
    const url = new URL(window.location.href);
    url.searchParams.set('run', validated.run_id);
    window.history.replaceState(null, '', url);
  }

  async function execute(cart: CartItem[], policy: string, maxSimulatedTime: number, chefs: number) {
    if (busy || submitLock.current || !cart.length) return;
    submitLock.current = true;
    setBusy(true); setError(''); setPlaying(false);
    try {
      const data = await submitOrders(cart, policy, maxSimulatedTime, chefs);
      showReplay(data);
      if (!data.result.completed) setError(`조리 실행 중단: ${data.result.termination_reason}${data.result.error ? ` · ${data.result.error}` : ''}`);
      else setPlaying(true);
    } catch (problem) { setError(problem instanceof Error ? problem.message : '주문 처리 실패'); }
    finally { submitLock.current = false; setBusy(false); }
  }

  async function load(event: FormEvent) {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setBusy(true); setError(''); setPlaying(false);
    try { showReplay(await api<Replay>(`/runs/${encodeURIComponent(loadId.trim())}/replay`)); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Unable to load replay.'); }
    finally { submitLock.current = false; setBusy(false); }
  }

  function seek(sequence: number) {
    if (!replay) return;
    setPlaying(false);
    setPosition({ sequence, time: replay.events[sequence - 1]?.time ?? replay.initial_conditions.time });
  }

  function seekTime(value: number) {
    if (!replay || !Number.isFinite(value)) return;
    const time = Math.max(replay.initial_conditions.time, Math.min(value, replay.result.finished_at));
    setPlaying(false);
    setPosition({ time, sequence: replay.events.filter((event) => event.time <= time).length });
  }

  return <main className="replay-app">
    <header className="page-header"><div><p className="eyebrow">Pasta Chef / kitchen simulator</p>
      <h1>Cook. Replay. Compare.</h1><p>Watch {frame.chefs.length === 1 ? 'one chef' : `${frame.chefs.length} chefs`} work through real kitchen constraints.</p></div>
      <div className="page-links"><a href="?live">실시간 주방 ↗</a><a href="?scene">Restaurant development view ↗</a></div></header>
    <div className="workspace">
      <aside className="panel setup">
        <OrderPanel busy={busy} chefs={chefCount} onChefsChange={setChefCount} onCook={execute} />
        {error && <div className="notice error" role="alert">{error}</div>}
        <form onSubmit={load} className="load-form"><label>Open a replay<input value={loadId} placeholder="Run ID" required disabled={busy}
          onChange={(e) => setLoadId(e.target.value)} /></label><button disabled={busy}>Load replay</button></form>
        <p className="muted">Runs live in server memory. Each run executes once; create another to compare policies.</p>
      </aside>
      <section className="replay-main" aria-label="Kitchen replay">
        <section className="scene-panel" aria-label="3D kitchen replay" data-testid="kitchen-scene"
          data-time={frame.time} data-sequence={frame.sequence} data-station={frame.chef.station}
          data-chefs={frame.chefs.map((chef) => `${chef.name}:${chef.station}:${chef.motion}`).join(',')}
          data-motion={frame.chef.motion} data-heated={frame.stations.filter((s) => s.heated).map((s) => s.station).join(',')}>
          <div className="scene-toolbar"><span>LIVE REPLAY / 3D KITCHEN</span>
            <div className="scene-cameras" role="group" aria-label="3D camera">
              {REPLAY_CAMERAS.map((view) => <button key={view.id} type="button" aria-pressed={camera === view.id}
                onClick={() => setCamera(view.id)}>{view.label}</button>)}
            </div></div>
          <div className="scene-viewport"><SceneBoundary><Suspense fallback={<p className="scene-unavailable">Loading the restaurant…</p>}>
            <RestaurantScene cameraPreset={camera} replayFrame={frame} />
          </Suspense></SceneBoundary></div>
          <div className="scene-caption" data-testid="scene-activity"><span>{frame.chefs.map((chef, index) => <span key={chef.name}>{index > 0 && ' · '}<strong>{frame.chefs.length === 1 ? 'Chef' : humanize(chef.name)} · {chef.station}</strong>
            {' / '}{humanize(chef.taskId ?? chef.motion)}{chef.orderId ? ` · ${chef.orderId}` : ''}</span>)}</span>
            <span>{frame.stations.filter((s) => s.heated).map((s) => `${s.station}: heating + steam`).join(' · ') || 'Heating off'}
              {frame.served.length > 0 ? ` · Pass: ${frame.served.length} served` : ''}</span></div>
        </section>
        <div className="panel transport"><div className="transport-heading"><h2>Kitchen replay</h2>
          <span className="clock" data-testid="clock">{seconds(position.time)} / {seconds(replay?.result.finished_at ?? 0)}</span></div>
          <div className="transport-buttons"><button disabled={!replay || busy} onClick={() => {
            if (atEnd) setPosition(start);
            setPlaying((value) => !value);
          }}>{playing ? 'Pause' : atEnd ? 'Play again' : 'Play'}</button>
            <button disabled={!replay || position.sequence === 0} onClick={() => seek(position.sequence - 1)}>Previous event</button>
            <button disabled={!replay || atEnd} onClick={() => seek(position.sequence + 1)}>Next event</button>
            <button disabled={!replay} onClick={() => seek(replay?.events.length ?? 0)}>Jump to end</button>
            <label className="time-seek">Time (seconds)<input aria-label="Replay time in seconds" type="number" min="0"
              max={replay?.result.finished_at ?? 0} step="0.1" value={timeDraft ?? Math.round(position.time * 10) / 10} disabled={!replay}
              onFocus={() => { setPlaying(false); setTimeDraft(String(Math.round(position.time * 10) / 10)); }}
              onBlur={() => setTimeDraft(null)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
              onChange={(event) => { setTimeDraft(event.target.value); if (event.target.value !== '') seekTime(event.target.valueAsNumber); }} /></label>
            <label className="speed">Speed<select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {[1, 5, 20, 100].map((value) => <option key={value} value={value}>{value}×</option>)}</select></label></div>
          <label className="seek-label">Seek events <span>{position.sequence} / {replay?.events.length ?? 0}</span>
            <input aria-label="Seek events" type="range" min="0" max={replay?.events.length ?? 0} step="1"
              value={position.sequence} disabled={!replay} onChange={(e) => seek(Number(e.target.value))} /></label>
          <p className="muted">{replay ? `${replay.scheduling_policy.name} v${replay.scheduling_policy.version} · schema ${replay.schema_version}`
            : 'Add an order and run the kitchen to begin.'}</p>
        </div>
        {error && <div className="notice error" role="alert">{error}</div>}
        {replay && <div className={`notice ${match ? 'success' : 'error'}`} data-testid="verification">
          {match ? 'Replay verified · final state matches the backend.' : 'Replay mismatch · final state differs from the backend.'}
        </div>}
        <div className="panel"><h2>Orders <span className="muted">{state?.orders.length ?? 0}</span></h2>
          {!state?.orders.length ? <p className="empty">Orders appear when their acceptance events play.</p>
            : <div className="table-scroll"><table><thead><tr><th>Order</th><th>Status</th><th>Tasks</th><th>Deadline</th><th>Served</th><th>Lateness</th></tr></thead>
              <tbody>{state.orders.map((order) => <tr key={order.id} data-testid={order.id}>
                <td><strong>{order.id}</strong><small>{replay?.recipes[order.menu]?.name}</small></td>
                <td><span className={`badge ${order.status}`}>{order.status}</span></td>
                <td>{order.completed_tasks.length} / {replay?.recipes[order.menu]?.tasks.length}</td>
                <td>{seconds(order.deadline)}</td><td>{order.served_at === null ? '—' : seconds(order.served_at)}</td>
                <td>{Math.max(0, (order.served_at ?? state.time) - order.deadline).toFixed(0)}s</td></tr>)}</tbody></table></div>}
        </div>
        <div className="status-grid"><div className="panel"><h2>Current tasks</h2>
          {!state?.running_tasks.length ? <p className="empty">Chef and equipment are idle.</p> : state.running_tasks.map((task) => <div className="task" key={`${task.order_id}/${task.task_id}`}>
            <strong>{humanize(task.task_id)}</strong><p>{task.order_id} · {Math.ceil(task.remaining_time)}s remaining</p>
            <small>{task.resources.some(isChefResource) ? 'Chef working' : 'Background cooking'} · {task.resources.join(', ')}</small></div>)}
        </div><div className="panel"><h2>Equipment</h2><dl className="equipment">
          {Object.entries(state?.resources ?? idleResources(idleChefs)).map(([name, owner]) =>
            <div key={name}><dt>{name}</dt><dd><span className={`dot ${owner ? 'occupied' : ''}`} />
              {owner ? `${owner[0]} · ${humanize(owner[1])}` : 'Available'}</dd></div>)}
        </dl></div></div>
        {replay && <div className="panel result" data-testid="result"><h2>Backend result · {replay.result.status}</h2>
          <p>Stop reason: <strong>{humanize(replay.result.termination_reason)}</strong> · Total lateness: {replay.result.total_lateness}s
            {' · '}{replay.final_orders.filter((order) => order.status === 'served').length} / {replay.final_orders.length} orders served</p>
          {replay.result.error && <p role="alert">{replay.result.error}</p>}
          <small>Run {replay.run_id}</small></div>}
        {replay && <details className="panel"><summary>Event history · {replay.events.length} events</summary><ol className="events">
          {replay.events.map((event) => <li key={event.sequence} className={event.sequence <= position.sequence ? 'applied' : ''}>
            <button onClick={() => seek(event.sequence)}>#{event.sequence} · {seconds(event.time)} · {humanize(event.action)}
              {'order_id' in event ? ` · ${event.order_id}` : ''}{'task_id' in event ? ` / ${humanize(event.task_id)}` : ''}</button></li>)}
        </ol></details>}
      </section>
    </div>
  </main>;
}
