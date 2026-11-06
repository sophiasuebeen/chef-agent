import { Component, lazy, Suspense, useState, type FormEvent, type ReactNode } from 'react';
import { useLiveKitchen } from './game/useLiveKitchen';
import { idleResources, isChefResource } from './scene/replayPresentation';
import type { CameraPresetId } from './data/cameraPresets';
import { ChatPanel } from './components/ChatPanel';
import './replay.css';

const RestaurantScene = lazy(() => import('./scene/BeachRestaurantScene').then(({ BeachRestaurantScene }) => ({ default: BeachRestaurantScene })));

class SceneBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <p className="scene-unavailable" role="alert">3D rendering is unavailable. Orders and kitchen status remain available below.</p> : this.props.children; }
}

const seconds = (value: number) => `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, '0')}`;
const humanize = (value: string) => value.replaceAll('_', ' ');
const CAMERAS = [
  { id: 'kitchen', label: 'Kitchen' }, { id: 'chef', label: 'Chef close-up' },
  { id: 'overview', label: 'Restaurant' }, { id: 'dining', label: 'Dining' },
] as const;

export function LiveApp() {
  const [chefCount, setChefCount] = useState(1);
  const [speed, setSpeed] = useState(10);
  const [camera, setCamera] = useState<CameraPresetId>('kitchen');
  const kitchen = useLiveKitchen(chefCount);
  const { menus, info, now, state, frame, entries, replying, opening, error, connected, menuName, send } = kitchen;

  function open(event: FormEvent) {
    event.preventDefault();
    void kitchen.open(speed);
  }

  return <main className="replay-app">
    <header className="page-header"><div><p className="eyebrow">Pasta Chef / live kitchen test</p>
      <h1>Order. Chat. Watch it cook.</h1><p>주문은 셰프와의 대화로, 조리는 스케줄러가 맡습니다.</p></div>
      <a href="./">게임으로 ↗</a></header>
    <div className="workspace live-workspace">
      <aside className="panel setup live-setup">
        <section aria-label="메뉴판"><h2>메뉴판</h2>
          {menus.map((menu) => <article className="menu-card" key={menu.id}><h3>{menu.name}</h3>
            <p className="muted">재료: {menu.ingredients.join(', ')}</p></article>)}
        </section>
        {!info ? <form onSubmit={open} aria-label="주방 열기">
          <label>셰프 수<input type="number" min="1" max="4" step="1" required value={chefCount}
            onChange={(event) => setChefCount(Math.min(4, Math.max(1, event.target.valueAsNumber || 1)))} /></label>
          <label>주방 속도 (실제 1초당 조리 시간)<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            {[1, 10, 30, 100].map((value) => <option key={value} value={value}>{value}초</option>)}</select></label>
          <button className="primary" disabled={opening}>{opening ? '여는 중…' : '주방 열기'}</button>
        </form> : <section aria-label="대화"><h2>셰프와 대화</h2>
          <ChatPanel entries={entries} busy={replying} disabled={false} menuName={menuName} onSend={send} />
          <p className="muted">메시지마다 모델 요금이 발생할 수 있습니다.</p></section>}
        {error && <div className="notice error" role="alert">{error}</div>}
      </aside>
      <section className="replay-main" aria-label="Live kitchen">
        <section className="scene-panel" aria-label="3D live kitchen" data-testid="kitchen-scene" data-time={Math.floor(frame.time)}
          data-chefs={frame.chefs.map((chef) => `${chef.name}:${chef.station}:${chef.motion}`).join(',')}>
          <div className="scene-toolbar"><span>LIVE / 3D KITCHEN</span>
            <div className="scene-cameras" role="group" aria-label="3D camera">
              {CAMERAS.map((view) => <button key={view.id} type="button" aria-pressed={camera === view.id}
                onClick={() => setCamera(view.id)}>{view.label}</button>)}
            </div></div>
          <div className="scene-viewport"><SceneBoundary><Suspense fallback={<p className="scene-unavailable">Loading the restaurant…</p>}>
            <RestaurantScene cameraPreset={camera} replayFrame={frame} />
          </Suspense></SceneBoundary></div>
          <div className="scene-caption" data-testid="scene-activity">
            <span>{frame.chefs.map((chef, index) => <span key={chef.name}>{index > 0 && ' · '}<strong>{chef.name.replace('_', ' ')}</strong>{' / '}{humanize(chef.taskId ?? chef.motion)}</span>)}</span>
            <span data-testid="clock">{info ? `${seconds(now)} · ${connected ? 'live' : '연결 중…'}` : '주방이 닫혀 있어요'}</span></div>
        </section>
        <div className="panel"><h2>Orders <span className="muted">{state?.orders.length ?? 0}</span></h2>
          {!state?.orders.length ? <p className="empty">주문이 들어오면 여기에 표시됩니다.</p>
            : <div className="table-scroll"><table><thead><tr><th>Order</th><th>Status</th><th>Tasks</th><th>Deadline</th><th>Served</th><th>Lateness</th></tr></thead>
              <tbody>{state.orders.map((order) => <tr key={order.id} data-testid={order.id}>
                <td><strong>{order.id}</strong><small>{menuName(order.menu)}</small></td>
                <td><span className={`badge ${order.status}`}>{order.status}</span></td>
                <td>{order.completed_tasks.length} / {info?.recipes[order.menu]?.tasks.length}</td>
                <td>{seconds(order.deadline)}</td><td>{order.served_at === null ? '—' : seconds(order.served_at)}</td>
                <td>{Math.max(0, (order.served_at ?? state.time) - order.deadline).toFixed(0)}s</td></tr>)}</tbody></table></div>}
        </div>
        <div className="status-grid"><div className="panel"><h2>Current tasks</h2>
          {!state?.running_tasks.length ? <p className="empty">Chef and equipment are idle.</p> : state.running_tasks.map((task) => <div className="task" key={`${task.order_id}/${task.task_id}`}>
            <strong>{humanize(task.task_id)}</strong><p>{task.order_id} · {Math.max(0, Math.ceil(task.remaining_time))}s remaining</p>
            <small>{task.resources.some(isChefResource) ? 'Chef working' : 'Background cooking'} · {task.resources.join(', ')}</small></div>)}
        </div><div className="panel"><h2>Equipment</h2><dl className="equipment">
          {Object.entries(state?.resources ?? idleResources(chefCount)).map(([name, owner]) =>
            <div key={name}><dt>{name}</dt><dd><span className={`dot ${owner ? 'occupied' : ''}`} />
              {owner ? `${owner[0]} · ${humanize(owner[1])}` : 'Available'}</dd></div>)}
        </dl></div></div>
      </section>
    </div>
  </main>;
}
