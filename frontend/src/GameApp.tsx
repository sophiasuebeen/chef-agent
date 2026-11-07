import { Html } from '@react-three/drei';
import { useEffect, useMemo, useRef, useReducer, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { DEFAULT_TIME_OF_DAY, TIME_OF_DAY_IDS, type TimeOfDayId } from './data/timeOfDay';
import { plateSlots } from './data/layout';
import { dishAsset } from './data/menuPresentation';
import { Asset } from './scene/props/Asset';
import { nearestSeat, SEATS, sitDown, standUp, type SittingState } from './game/seating';
import { deliveryReducer, deliveryTarget, EMPTY_DELIVERY } from './game/delivery';
import { ChatPanel } from './components/ChatPanel';
import { StaffNotification } from './components/StaffNotification';
import { RestaurantTip } from './components/RestaurantTip';
import { createBossaPlayer, type BossaPlayer } from './game/bossaNova';
import { chefLabel } from './live';
import { dishName, gameText, ingredientName, LANGUAGE_KEY, orderDraft, readyToast, savedLanguage, waitingText, type Language } from './game/language';
import { SPAWN, type Zone } from './game/movement';
import { useLiveKitchen } from './game/useLiveKitchen';
import { useRestaurant } from './game/useRestaurant';
import { RestaurantStaff } from './scene/characters/RestaurantStaff';
import type { ConsultationTrip } from './game/consultation';
import { BeachRestaurantScene } from './scene/BeachRestaurantScene';
import { Player, type PlayerState } from './scene/characters/Player';
import { MenuBoard } from './scene/props/MenuBoard';
import './replay.css';
import './game.css';

const clock = (value: number) => `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, '0')}`;
const DRAG_TURN = 0.006;

export function GameApp() {
  const [language, setLanguage] = useState<Language>(savedLanguage);
  const t = gameText[language];
  const status: Record<string, string> = { pending: t.pending, cooking: t.cooking, served: t.served };
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayId>(() => {
    try {
      const saved = new URLSearchParams(window.location.search).get('time') ?? localStorage.getItem('beach-pasta-time');
      return TIME_OF_DAY_IDS.find((id) => id === saved) ?? DEFAULT_TIME_OF_DAY;
    } catch { return DEFAULT_TIME_OF_DAY; }
  });
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [delivery, dispatchDelivery] = useReducer(deliveryReducer, EMPTY_DELIVERY);
  const [sitting, setSitting] = useState<SittingState | null>(null);
  const [nearbySeat, setNearbySeat] = useState<string | null>(null);
  const [nearbyTable, setNearbyTable] = useState<string | null>(null);
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
  const [consultationTrip, setConsultationTrip] = useState<ConsultationTrip | null>(null);
  const kitchen = useLiveKitchen(chefCount, language, true);
  const { info, state, frame, speech, menus } = kitchen;
  const restaurant = useRestaurant(info?.session_id, language);
  const service = restaurant.state;
  const assignedTable = service.tables.find((table) => table.id === service.active_table);
  const staffOrders = new Set(service.tables.flatMap((table) => table.order_ids));
  const manualReady = frame.served.filter((order) => !staffOrders.has(order.orderId)).map((order) => order.orderId);
  const placements = useMemo(() => ({ ...delivery.placed, ...Object.fromEntries(Object.entries(service.delivered)
    .map(([id, served]) => [id, served.seat_id.replace(/^seat\./, 'plate.')])) }), [delivery.placed, service.delivered]);
  const staffCarried = useMemo(() => new Set(service.waiters.flatMap((waiter) => waiter.carrying ? [waiter.carrying] : [])), [service.waiters]);
  const menuName = (id: string) => dishName(id, kitchen.menuName(id), language);
  const localizedMenus = useMemo(() => menus.map((menu) => ({ ...menu, name: dishName(menu.id, menu.name, language),
    ingredients: menu.ingredients.map((ingredient) => ingredientName(ingredient, language)) })), [menus, language]);
  const ingredients = useMemo(() => [...new Set(menus.flatMap((menu) => menu.ingredients))], [menus]);
  const displayFrame = useMemo(() => ({ ...frame, served: frame.served.filter((order) =>
    order.orderId !== delivery.carried && !placements[order.orderId] && !staffCarried.has(order.orderId)) }), [frame, delivery.carried, placements, staffCarried]);
  const carriedOrder = frame.served.find((order) => order.orderId === delivery.carried);
  const player = useRef<PlayerState>({ x: SPAWN[0], z: SPAWN[1], heading: Math.PI / 2, yaw: 0, target: null });
  const music = useRef<BossaPlayer | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; moved: number } | null>(null);
  const talked = useRef(false);
  const servedCount = useRef(0);
  const overlayOpen = menuOpen;

  useEffect(() => () => music.current?.stop(), []);
  useEffect(() => { music.current?.setVolume(muted ? 0 : volume); }, [volume, muted]);

  useEffect(() => {
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* Storage may be unavailable. */ }
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    try { localStorage.setItem('beach-pasta-time', timeOfDay); } catch { /* Storage may be unavailable. */ }
  }, [timeOfDay]);

  async function toggleSeat() {
    if (restaurant.seating || kitchen.replying) return;
    if (sitting) {
      const position = standUp(sitting);
      if (!position) return;
      if (!await restaurant.seat(null)) return;
      Object.assign(player.current, position, { target: null });
      setSitting(null);
      leaveChat();
    } else if (!delivery.carried) {
      const next = sitDown(player.current);
      const seat = SEATS.find((candidate) => candidate.id === next?.seatId);
      if (!next || !seat) return;
      player.current.target = null;
      if (!await restaurant.seat(seat.id)) return;
      player.current.x = seat.position[0];
      player.current.z = seat.position[2];
      player.current.heading = seat.rotationY;
      player.current.target = null;
      setSitting(next);
    }
  }

  function leaveChat() {
    setChatOpen(false);
    if (talked.current) kitchen.releaseChef();
    talked.current = false;
  }

  useEffect(() => { if (!sitting && zone !== 'counter' && zone !== 'menu' && chatOpen) leaveChat(); }, [zone, sitting]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const notice = restaurant.notice;
    if (!notice || notice.table_id !== service.active_table) return;
    kitchen.announce(notice.speaker, notice.text);
    if (notice.kind === 'greet') setChatOpen(true);
  }, [restaurant.notice]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const served = kitchen.events.filter((event) => event.action === 'order_served');
    if (served.length > servedCount.current) {
      const latest = served.at(-1);
      if (latest?.action === 'order_served') {
        const order = state?.orders.find((candidate) => candidate.id === latest.order_id);
        setToast(readyToast(order ? menuName(order.menu) : latest.order_id, language));
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
      const element = document.activeElement;
      const typing = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
      if (event.key === 'Escape') {
        if (menuOpen) setMenuOpen(false);
        else if (chatOpen) leaveChat();
        (document.activeElement as HTMLElement | null)?.blur?.();
      } else if (!typing && event.code === 'KeyE' && !event.repeat) {
        event.preventDefault();
        if (!chatOpen && !menuOpen && (sitting || (!delivery.carried && nearestSeat(player.current)))) {
          toggleSeat();
        } else if (!chatOpen && !menuOpen && deliveryTarget(delivery, manualReady, player.current)) {
          player.current.target = null;
          dispatchDelivery({ ready: manualReady, position: { ...player.current } });
        } else if (zone === 'menu') setMenuOpen((open) => !open);
        else if (zone === 'counter') setChatOpen(true);
      } else if (!typing && event.key === 'Enter' && (sitting || zone === 'counter')) setChatOpen(true);
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
    setDraft(orderDraft(name, language));
  }

  function send(text: string) {
    talked.current = true;
    void kitchen.send(text, { waitForWaiter: !!assignedTable });
  }

  function consultationStage(trip: ConsultationTrip) {
    setConsultationTrip(trip);
    if (trip.stage === 'announce' && kitchen.staffProgress) {
      kitchen.announce(kitchen.staffProgress.speaker, language === 'ko'
        ? '주방에 확인해 볼게요. 잠시만 기다려 주세요.' : "I'll check with the kitchen. I'll be right back.");
    }
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
    if (!playing || sitting || chatOpen || menuOpen || (drag.current?.moved ?? 0) > 4) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    player.current.target = [x, z];
  }

  const orders = state?.orders ?? [];
  const waiting = orders.filter((order) => order.status !== 'served').length;
  const talkingChef = useMemo(() => state ? Object.entries(state.resources).find(([, owner]) => owner?.[0] === 'customer')?.[0] : undefined, [state]);
  const plateTarget = deliveryTarget(delivery, manualReady, player.current);
  const prompt = !playing || chatOpen || menuOpen ? null
    : sitting ? t.stand : !delivery.carried && nearbySeat ? t.sit
    : plateTarget ? (plateTarget.kind === 'pickup' ? t.pickup : t.place)
    : zone === 'menu' ? t.viewMenu : zone === 'counter' ? t.talk : null;

  return <div className="game" lang={language} ref={root} data-testid="game" data-zone={zone ?? ''} data-playing={playing} data-seated={sitting?.seatId ?? ''} data-carried={delivery.carried ?? ''} data-nearby-table={nearbyTable ?? ''}
    onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onContextMenu={(event) => event.preventDefault()}>
    <label className={`hud game-language${playing ? ' playing' : ''}`} onPointerDown={(event) => event.stopPropagation()}>
      {t.language}
      <select value={language} onChange={(event) => { setLanguage(event.target.value as Language); event.currentTarget.blur(); }}>
        <option value="ko">한국어</option><option value="en">English</option>
      </select>
    </label>
    <div className="game-canvas">
      <BeachRestaurantScene cameraPreset={playing ? 'kitchen' : 'terrace'} replayFrame={displayFrame} timeOfDay={timeOfDay} equipmentCount={3} pantryIngredients={ingredients} language={language} live speech={speech && speech.speaker !== 'customer' ? speech : undefined}
        ownCamera={playing} onFloorClick={floorClick}>
        {menus.length > 0 && <MenuBoard menus={localizedMenus} />}
        {playing && <Player state={player} enabled={!overlayOpen} onZone={setZone} onNearbyTable={setNearbyTable} onNearbySeat={setNearbySeat} seated={!!sitting} carriedMenu={carriedOrder?.menu} debugOutput={root}
          speech={speech?.speaker === 'customer' ? speech.text : undefined} />}
        {playing && <RestaurantStaff key={info?.session_id} state={service} speech={speech} language={language} onArrive={restaurant.arrive}
          conversationTable={chatOpen ? service.active_table : null}
          consultation={kitchen.staffProgress} consultationReady={kitchen.awaitingWaiter || !kitchen.replying}
          onConsultationStage={consultationStage} onConsultationReturn={kitchen.finishConsultation}
          orderMenu={(id) => state?.orders.find((order) => order.id === id)?.menu} />}
        {Object.entries(placements).map(([orderId, slotId]) => {
          const slot = plateSlots.find((candidate) => candidate.id === slotId);
          const order = frame.served.find((candidate) => candidate.orderId === orderId);
          return slot && order ? <group key={orderId} name={`delivered.${orderId}`} position={[slot.position[0], slot.position[1] + 0.008, slot.position[2]]}>
            <Asset id={dishAsset(order.menu)} />
          </group> : null;
        })}
        {playing && <Html position={[0, 1.55, 0.05]} center zIndexRange={[6, 0]}><span className="map-label">{t.counter}</span></Html>}
      </BeachRestaurantScene>
    </div>

    {!playing && <form className="game-start" onSubmit={start} aria-label={t.enter}>
      <p className="game-eyebrow">Beach Pasta</p>
      <h1>{t.title}</h1>
      <p>{t.intro}</p>
      <div className="game-start-options">
        <label>{t.chefs}<input type="number" min="1" max="4" step="1" required value={chefCount}
          onChange={(event) => setChefCount(Math.min(4, Math.max(1, event.target.valueAsNumber || 1)))} /></label>
        <label>{t.speed}<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
          <option value={1}>{t.realTime}</option><option value={10}>10×</option><option value={30}>30×</option></select></label>
      </div>
      <button className="game-enter" disabled={kitchen.opening || !menus.length}>{kitchen.opening ? t.opening : t.enter}</button>
      <label className="start-time">{t.timeOfDay}<select value={timeOfDay} onChange={(event) => setTimeOfDay(event.target.value as TimeOfDayId)}>
        {TIME_OF_DAY_IDS.map((id) => <option key={id} value={id}>{t[id]}</option>)}
      </select></label>
      <p className="game-note">{t.note}</p>
      {kitchen.error && <p className="game-error" role="alert">{kitchen.error}</p>}
    </form>}

    {playing && <>
      <RestaurantTip key={`${language}:${waiting > 0}`} language={language} waiting={waiting > 0} />
      <div className="hud hud-top-left" onPointerDown={(event) => event.stopPropagation()}>
        <div className="hud-clock"><strong data-testid="clock">{clock(kitchen.now)}</strong>
          {!kitchen.connected && <span className="connection-dot" role="status" aria-label={t.reconnect} title={t.reconnect} />}
        </div>
        <div className="hud-tools">
          <div className="volume-control">
            <button type="button" className="hud-icon" aria-label={t.volume} title={t.volume} aria-expanded={volumeOpen}
              aria-controls="music-volume-panel" onClick={() => setVolumeOpen((open) => !open)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4Z" />
                {muted || volume === 0 ? <path d="m16 9 5 6m0-6-5 6" /> : <><path d="M15 8a6 6 0 0 1 0 8" /><path d="M18 5a10 10 0 0 1 0 14" /></>}
              </svg>
            </button>
            {volumeOpen && <div className="volume-panel" id="music-volume-panel" role="group" aria-label={t.music}>
              <button type="button" className="volume-mute" aria-label={muted ? t.unmuteMusic : t.muteMusic}
                aria-pressed={muted} onClick={() => setMuted((value) => !value)}>{muted ? t.unmuteMusic : t.muteMusic}</button>
              <input aria-label={t.volume} type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
                onChange={(event) => { setVolume(event.target.valueAsNumber); setMuted(false); }} />
            </div>}
          </div>
          <label className="time-control" title={t.timeOfDay}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              {timeOfDay === 'night' ? <path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z" />
                : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>}
            </svg>
            <select aria-label={t.timeOfDay} value={timeOfDay} onChange={(event) => { setTimeOfDay(event.target.value as TimeOfDayId); event.currentTarget.blur(); }}>
              {TIME_OF_DAY_IDS.map((id) => <option key={id} value={id}>{t[id]}</option>)}
            </select>
          </label>
        </div>
        {talkingChef && <span className="hud-chat-tag">{chefLabel(talkingChef, language)} · {t.chatting}</span>}
      </div>
      <aside className="hud hud-orders" aria-label={t.orders}>
        <h2>{t.orders} <span>{waiting ? waitingText(waiting, language) : orders.length ? t.allReady : ''}</span></h2>
        {!orders.length && <p>{t.noOrders}</p>}
        {orders.slice(-6).map((order) => <div key={order.id} className={`hud-order ${order.status}`} data-testid={order.id}>
          <b>{menuName(order.menu)}</b>
          <small>{delivery.carried === order.id || staffCarried.has(order.id) ? t.carrying : placements[order.id] ? t.onTable : status[order.status] ?? order.status} · {order.completed_tasks.length}/{info?.recipes[order.menu]?.tasks.length}
            {order.status === 'served' ? (order.on_time ? ` · ${t.onTime}` : ` · ${t.late}`) : ''}</small>
        </div>)}
      </aside>
      {carriedOrder && <div className="carry-status" role="status"><span>{t.carrying}</span><b>{menuName(carriedOrder.menu)}</b><small>{t.carryHint}</small></div>}
      {prompt && <div className="game-prompt" role="status"><kbd>E</kbd> {prompt}</div>}
      <StaffNotification key={info?.session_id} progress={kitchen.error || restaurant.error || (assignedTable && (!consultationTrip || consultationTrip.turn !== kitchen.staffProgress?.turn || ['meeting', 'announce'].includes(consultationTrip.stage)))
        ? null : kitchen.staffProgress} busy={kitchen.replying} language={language} />
      {toast && <div className={`game-toast${kitchen.staffProgress ? ' with-staff-notice' : ''}`} role="status">{toast}</div>}
      {kitchen.error && <div className="game-toast error" role="alert">{kitchen.error}</div>}
      {restaurant.error && <div className="game-toast error" role="alert">{restaurant.error}</div>}
      {sitting && <nav className={`hud table-service${chatOpen ? ' chatting' : ''}`} aria-label={language === 'ko' ? '테이블 서비스' : 'Table service'} onPointerDown={(event) => event.stopPropagation()}>
        <span>{assignedTable ? chefLabel(assignedTable.waiter_id, language) : (language === 'ko' ? '직원이 오는 중…' : 'Staff is on the way…')}</span>
        <button type="button" onClick={() => { setChatOpen(false); setMenuOpen(true); }}>{t.menu}</button>
        <button type="button" onClick={() => { setMenuOpen(false); setChatOpen(true); }}>{t.talk}</button>
        <button type="button" disabled={restaurant.seating || kitchen.replying} onClick={() => void toggleSeat()}>{t.stand}</button>
      </nav>}
      {!chatOpen && !menuOpen && <p className="game-help"><kbd>WASD</kbd> {t.move} · {t.clickWalk} · {t.drag} <kbd>Q</kbd><kbd>R</kbd> {t.camera} · <kbd>E</kbd> {t.interact}</p>}

      {chatOpen && <section className="game-chat" aria-label={t.chat} onPointerDown={(event) => event.stopPropagation()}>
        <header><h2>{t.chat}</h2><button type="button" aria-label={t.closeChat} onClick={leaveChat}>{t.close}</button></header>
        <ChatPanel entries={kitchen.entries} busy={kitchen.replying} disabled={false} menuName={menuName} onSend={send}
          progress={kitchen.staffProgress}
          draft={draft} onDraftChange={setDraft} language={language} autoFocus />
      </section>}

      {menuOpen && <section className="game-menu" aria-label={t.menu} onPointerDown={(event) => event.stopPropagation()}>
        <header><h2>{t.menu}</h2><button type="button" onClick={() => setMenuOpen(false)}>{t.close}</button></header>
        {localizedMenus.map((menu) => <article key={menu.id}><div><h3>{menu.name}</h3><p>{menu.ingredients.join(', ')}</p></div>
          <button type="button" onClick={() => orderFromMenu(menu.name)}>{t.orderThis}</button></article>)}
      </section>}
    </>}
  </div>;
}
