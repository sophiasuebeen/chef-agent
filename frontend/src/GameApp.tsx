import { Html } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { createBossaPlayer, type BossaPlayer } from './game/bossaNova';
import { SPAWN, type Zone } from './game/movement';
import { useLiveKitchen } from './game/useLiveKitchen';
import { BeachRestaurantScene } from './scene/BeachRestaurantScene';
import { Player, type PlayerState } from './scene/characters/Player';
import { MenuBoard } from './scene/props/MenuBoard';
import './replay.css';
import './game.css';

const STATUS: Record<string, string> = { pending: '대기 중', cooking: '조리 중', served: '완성' };
const clock = (value: number) => `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, '0')}`;
const DRAG_TURN = 0.006;

export function GameApp() {
  const [chefCount, setChefCount] = useState(2);
  const [speed, setSpeed] = useState(10);
  const [playing, setPlaying] = useState(false);
  const [zone, setZone] = useState<Zone>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [volume, setVolume] = useState(0.5);
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState('');
  const kitchen = useLiveKitchen(chefCount);
  const { info, state, frame, speech, menus, menuName } = kitchen;
  const player = useRef<PlayerState>({ x: SPAWN[0], z: SPAWN[1], heading: Math.PI / 2, yaw: 0, target: null });
  const music = useRef<BossaPlayer | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; moved: number } | null>(null);
  const talked = useRef(false);
  const servedCount = useRef(0);
  const overlayOpen = menuOpen;

  useEffect(() => () => music.current?.stop(), []);
  useEffect(() => { music.current?.setVolume(muted ? 0 : volume); }, [volume, muted]);

  function leaveChat() {
    setChatOpen(false);
    if (talked.current) kitchen.releaseChef();
    talked.current = false;
  }

  useEffect(() => { if (zone !== 'counter' && zone !== 'menu' && chatOpen) leaveChat(); }, [zone]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const served = kitchen.events.filter((event) => event.action === 'order_served');
    if (served.length > servedCount.current) {
      const latest = served.at(-1);
      if (latest?.action === 'order_served') {
        const order = state?.orders.find((candidate) => candidate.id === latest.order_id);
        setToast(`${order ? menuName(order.menu) : latest.order_id} 완성! 카운터에 나왔어요`);
      }
    }
    servedCount.current = served.length;
  }, [kitchen.events]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!playing) return undefined;
    const onKey = (event: KeyboardEvent) => {
      const typing = document.activeElement instanceof HTMLInputElement;
      if (event.key === 'Escape') {
        if (menuOpen) setMenuOpen(false);
        else if (chatOpen) leaveChat();
        (document.activeElement as HTMLElement | null)?.blur?.();
      } else if (!typing && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        if (zone === 'menu') setMenuOpen((open) => !open);
        else if (zone === 'counter') setChatOpen(true);
      } else if (!typing && event.key === 'Enter' && zone === 'counter') setChatOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // Reads current zone and panels every render.

  async function start(event: FormEvent) {
    event.preventDefault();
    // Sound must start inside this click, or the browser keeps it muted.
    music.current ??= createBossaPlayer(muted ? 0 : volume);
    if (await kitchen.open(speed)) setPlaying(true);
  }

  function orderFromMenu(name: string) {
    setMenuOpen(false);
    setChatOpen(true);
    setDraft(`${name} 하나 주세요`);
  }

  function send(text: string) {
    talked.current = true;
    void kitchen.send(text);
  }

  function pointerDown(event: ReactPointerEvent) {
    if (event.button === 0 || event.button === 2) drag.current = { x: event.clientX, moved: 0 };
  }
  function pointerMove(event: ReactPointerEvent) {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    drag.current.x = event.clientX;
    drag.current.moved += Math.abs(dx);
    if (drag.current.moved > 4) player.current.yaw -= dx * DRAG_TURN;
  }
  function pointerUp() {
    window.setTimeout(() => { drag.current = null; }, 0);
  }
  function floorClick(x: number, z: number) {
    if (!playing || (drag.current?.moved ?? 0) > 4) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    player.current.target = [x, z];
  }

  const orders = state?.orders ?? [];
  const waiting = orders.filter((order) => order.status !== 'served').length;
  const talkingChef = useMemo(() => state ? Object.entries(state.resources).find(([, owner]) => owner?.[0] === 'customer')?.[0] : undefined, [state]);
  const prompt = !playing || chatOpen || menuOpen ? null
    : zone === 'menu' ? '메뉴판 보기' : zone === 'counter' ? '셰프에게 말 걸기' : null;

  return <div className="game" ref={root} data-testid="game" data-zone={zone ?? ''} data-playing={playing}
    onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onContextMenu={(event) => event.preventDefault()}>
    <div className="game-canvas">
      <BeachRestaurantScene cameraPreset={playing ? 'kitchen' : 'terrace'} replayFrame={frame} live speech={speech && speech.speaker !== 'customer' ? speech : undefined}
        ownCamera={playing} onFloorClick={floorClick}>
        {menus.length > 0 && <MenuBoard menus={menus} />}
        {playing && <Player state={player} enabled={!overlayOpen} onZone={setZone} debugOutput={root}
          speech={speech?.speaker === 'customer' ? speech.text : undefined} />}
        {playing && <Html position={[0, 1.55, 0.05]} center zIndexRange={[6, 0]}><span className="map-label">주문 카운터</span></Html>}
      </BeachRestaurantScene>
    </div>

    {!playing && <form className="game-start" onSubmit={start} aria-label="식당 입장">
      <p className="game-eyebrow">Beach Pasta</p>
      <h1>바닷가 파스타 식당</h1>
      <p>식당을 걸어 다니며 메뉴를 보고, 셰프에게 말로 주문하세요.</p>
      <div className="game-start-options">
        <label>셰프 수<input type="number" min="1" max="4" step="1" required value={chefCount}
          onChange={(event) => setChefCount(Math.min(4, Math.max(1, event.target.valueAsNumber || 1)))} /></label>
        <label>주방 속도<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
          <option value={1}>실제 시간</option><option value={10}>10배</option><option value={30}>30배</option></select></label>
      </div>
      <button className="game-enter" disabled={kitchen.opening || !menus.length}>{kitchen.opening ? '여는 중…' : '입장하기'}</button>
      <p className="game-note">소리가 납니다 · 대화할 때마다 모델 요금이 발생할 수 있어요</p>
      {kitchen.error && <p className="game-error" role="alert">{kitchen.error}</p>}
    </form>}

    {playing && <>
      <div className="hud hud-top-left">
        <strong data-testid="clock">{clock(kitchen.now)}</strong>
        <span>{kitchen.connected ? '영업 중' : '연결 중…'}</span>
        {talkingChef && <span className="hud-chat-tag">{talkingChef === 'chef' ? '셰프' : talkingChef.replace('chef_', '셰프 ')} 대화 중</span>}
      </div>
      <div className="hud hud-sound" aria-label="배경 음악">
        <button type="button" aria-pressed={!muted} onClick={() => setMuted((value) => !value)}>{muted ? '음악 꺼짐' : '보사노바'}</button>
        <input aria-label="음악 크기" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => { setVolume(event.target.valueAsNumber); setMuted(false); }} />
      </div>
      <aside className="hud hud-orders" aria-label="내 주문">
        <h2>내 주문 <span>{waiting ? `${waiting}개 준비 중` : orders.length ? '모두 완성' : ''}</span></h2>
        {!orders.length && <p>아직 주문이 없어요.</p>}
        {orders.slice(-6).map((order) => <div key={order.id} className={`hud-order ${order.status}`} data-testid={order.id}>
          <b>{menuName(order.menu)}</b>
          <small>{STATUS[order.status] ?? order.status} · {order.completed_tasks.length}/{info?.recipes[order.menu]?.tasks.length}
            {order.status === 'served' ? (order.on_time ? ' · 제시간' : ' · 늦음') : ''}</small>
        </div>)}
      </aside>
      {prompt && <div className="game-prompt" role="status"><kbd>E</kbd> {prompt}</div>}
      {toast && <div className="game-toast" role="status">{toast}</div>}
      {kitchen.error && <div className="game-toast error" role="alert">{kitchen.error}</div>}
      {!chatOpen && !menuOpen && <p className="game-help"><kbd>WASD</kbd> 이동 · 클릭으로 걷기 · 드래그 또는 <kbd>Q</kbd><kbd>R</kbd> 시점 · <kbd>E</kbd> 상호작용</p>}

      {chatOpen && <section className="game-chat" aria-label="셰프와 대화" onPointerDown={(event) => event.stopPropagation()}>
        <header><h2>셰프와 대화</h2><button type="button" aria-label="대화 닫기" onClick={leaveChat}>닫기 (Esc)</button></header>
        <ChatPanel entries={kitchen.entries} busy={kitchen.replying} disabled={false} menuName={menuName} onSend={send}
          draft={draft} onDraftChange={setDraft} autoFocus />
      </section>}

      {menuOpen && <section className="game-menu" aria-label="메뉴판" onPointerDown={(event) => event.stopPropagation()}>
        <header><h2>메뉴</h2><button type="button" onClick={() => setMenuOpen(false)}>닫기 (Esc)</button></header>
        {menus.map((menu) => <article key={menu.id}><div><h3>{menu.name}</h3><p>{menu.ingredients.join(', ')}</p></div>
          <button type="button" onClick={() => orderFromMenu(menu.name)}>이걸로 말하기</button></article>)}
      </section>}
    </>}
  </div>;
}
