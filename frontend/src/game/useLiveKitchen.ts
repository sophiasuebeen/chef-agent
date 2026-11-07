import { useEffect, useMemo, useRef, useState } from 'react';
import { gameText, type Language } from './language';
import { liveReplay, mergeEvents, simulatedNow, visibleActions, type ChatEntry, type HostReply, type LiveSessionInfo, type StaffProgress } from '../live';
import { replayAt, type ReplayEvent } from '../replay';
import { kitchenFrame } from '../scene/replayPresentation';

export interface Menu { id: string; name: string; ingredients: string[] }
export interface Speech { speaker: string; text: string; id: number }

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new Error(problem?.detail ?? `API request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

/** A live session and conversation in the browser. Shared by the game and the test page. */
export function useLiveKitchen(chefCount: number, language: Language = 'ko', expandedKitchen = false) {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [info, setInfo] = useState<LiveSessionInfo | null>(null);
  const [events, setEvents] = useState<ReplayEvent[]>([]);
  const [now, setNow] = useState(0);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [replying, setReplying] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [speech, setSpeech] = useState<Speech | null>(null);
  const [staffProgress, setStaffProgress] = useState<StaffProgress | null>(null);
  const replyInFlight = useRef(false), turnVersion = useRef(0);
  const queuedAnswer = useRef<{ answer: HostReply; version: number } | null>(null);
  const [awaitingWaiter, setAwaitingWaiter] = useState(false);
  const startedAt = useRef(0);
  const eventsRef = useRef<ReplayEvent[]>([]);
  const speaker = useRef('chef');
  const speechId = useRef(0);

  useEffect(() => {
    fetch('/api/menus').then((response) => {
      if (!response.ok) throw new Error('Could not load the menu.');
      return response.json();
    }).then(setMenus).catch((problem: Error) => setError(problem.message));
  }, []);

  useEffect(() => {
    if (!info) return undefined;
    // EventSource reconnects by itself and resumes through Last-Event-ID.
    const source = new EventSource(`/api/sessions/${info.session_id}/events`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (message) => {
      eventsRef.current = mergeEvents(eventsRef.current, [JSON.parse(message.data) as ReplayEvent]);
      setEvents(eventsRef.current);
    };
    return () => source.close();
  }, [info]);

  useEffect(() => {
    if (!info) return undefined;
    const timer = window.setInterval(() => {
      setNow(simulatedNow(startedAt.current, performance.now(), info.speed, eventsRef.current));
    }, 100);
    return () => window.clearInterval(timer);
  }, [info]);

  useEffect(() => {
    if (!speech) return undefined;
    const timer = window.setTimeout(() => setSpeech((current) => current?.id === speech.id ? null : current), 7000);
    return () => window.clearTimeout(timer);
  }, [speech]);

  useEffect(() => {
    if (!info || !replying || awaitingWaiter) return undefined;
    let stopped = false, polling = false;
    const version = turnVersion.current;
    const poll = async () => {
      if (polling || stopped) return;
      polling = true;
      try {
        const response = await fetch(`/api/sessions/${info.session_id}/messages/progress`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
        if (!response.ok) return;
        const result = await response.json() as { busy: boolean; progress: StaffProgress | null };
        if (!stopped && replyInFlight.current && version === turnVersion.current && result.busy && result.progress) {
          const next = result.progress;
          setStaffProgress((current) => current?.turn === next.turn && current.phase === next.phase && current.speaker === next.speaker ? current : next);
        }
      } catch { /* Reply delivery still works if the optional progress request fails. */ }
      finally { polling = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 250);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [info, replying, awaitingWaiter]);

  useEffect(() => {
    if (!staffProgress || replying) return undefined;
    const timer = window.setTimeout(() => setStaffProgress(null), 6000);
    return () => window.clearTimeout(timer);
  }, [staffProgress, replying]);

  const replay = useMemo(() => info ? liveReplay(info, events, now) : null, [info, events, now]);
  const state = useMemo(() => replay ? replayAt(replay, now) : null, [replay, now]);
  const sequence = useMemo(() => events.filter((event) => event.time <= now).length, [events, now]);
  const frame = useMemo(() => kitchenFrame(replay, state, sequence, chefCount), [replay, state, sequence, chefCount]);
  const menuName = (menu: string) => info?.recipes[menu]?.name ?? menus.find((m) => m.id === menu)?.name ?? menu;

  async function open(speed: number) {
    setOpening(true); setError('');
    try {
      const created = await post<LiveSessionInfo>('/sessions', { speed, chefs: chefCount, equipment: expandedKitchen ? 'expanded' : 'standard' });
      startedAt.current = performance.now();
      eventsRef.current = [];
      speaker.current = 'chef';
      turnVersion.current += 1; replyInFlight.current = false; setStaffProgress(null);
      queuedAnswer.current = null; setAwaitingWaiter(false);
      setEvents([]); setEntries([]); setNow(0); setSpeech(null);
      setInfo(created);
      return true;
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : gameText[language].openError);
      return false;
    } finally { setOpening(false); }
  }

  function say(who: string, text: string) {
    speechId.current += 1;
    setSpeech({ speaker: who, text, id: speechId.current });
  }

  function announce(who: string, text: string) {
    setEntries((current) => [...current, { kind: 'host', text, speaker: who, failed: false }]);
    say(who, text);
  }

  function publishAnswer(answer: HostReply) {
    const handedOff = answer.actions.some((action) => action.type === 'small_talk' && action.decision === 'hand_off');
    const who = handedOff ? speaker.current : answer.speaker;
    speaker.current = answer.speaker;
    setEntries((current) => [...current,
      { kind: 'host', text: answer.reply, failed: answer.failed, speaker: who },
      ...visibleActions(answer.actions).map((action) => ({ kind: 'action' as const, action }))]);
    say(who, answer.reply);
  }

  function finishConsultation(turn: number) {
    const queued = queuedAnswer.current;
    if (!queued || queued.version !== turnVersion.current || queued.answer.progress?.turn !== turn) return;
    queuedAnswer.current = null;
    setAwaitingWaiter(false);
    publishAnswer(queued.answer);
    replyInFlight.current = false;
    setReplying(false);
  }

  async function send(text: string, options?: { waitForWaiter?: boolean }) {
    if (!info || replyInFlight.current) return;
    replyInFlight.current = true;
    const version = ++turnVersion.current;
    setStaffProgress(null);
    setEntries((current) => [...current, { kind: 'customer', text }]);
    say('customer', text);
    setReplying(true); setError('');
    let heldForReturn = false;
    try {
      const answer = await post<HostReply>(`/sessions/${info.session_id}/messages`, { text, language });
      if (version !== turnVersion.current) return;
      setStaffProgress(answer.progress ?? null);
      if (options?.waitForWaiter && answer.progress) {
        queuedAnswer.current = { answer, version };
        setAwaitingWaiter(true);
        heldForReturn = true;
      } else publishAnswer(answer);
    } catch (problem) {
      if (version !== turnVersion.current) return;
      replyInFlight.current = false;
      setStaffProgress((current) => current ? { ...current, phase: 'unavailable' } : null);
      setError(problem instanceof Error ? problem.message : gameText[language].sendError);
    } finally {
      if (version === turnVersion.current && !heldForReturn) { replyInFlight.current = false; setReplying(false); }
    }
  }

  /** The customer walked away, so whoever was chatting goes back to work. */
  function releaseChef() {
    if (info) void fetch(`/api/sessions/${info.session_id}/chef-hold`, { method: 'DELETE' }).catch(() => undefined);
  }

  return { menus, info, events, now, state, frame, entries, replying, opening, error: error === 'Could not load the menu.' ? gameText[language].loadError : error, connected, speech, staffProgress, awaitingWaiter, finishConsultation, menuName, open, send, releaseChef, announce };
}
