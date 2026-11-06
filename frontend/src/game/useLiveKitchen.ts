import { useEffect, useMemo, useRef, useState } from 'react';
import { liveReplay, mergeEvents, simulatedNow, visibleActions, type ChatEntry, type HostReply, type LiveSessionInfo } from '../live';
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
export function useLiveKitchen(chefCount: number) {
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
  const startedAt = useRef(0);
  const eventsRef = useRef<ReplayEvent[]>([]);
  const speaker = useRef('chef');
  const speechId = useRef(0);

  useEffect(() => {
    fetch('/api/menus').then((response) => {
      if (!response.ok) throw new Error('메뉴를 불러오지 못했습니다.');
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

  const replay = useMemo(() => info ? liveReplay(info, events, now) : null, [info, events, now]);
  const state = useMemo(() => replay ? replayAt(replay, now) : null, [replay, now]);
  const sequence = useMemo(() => events.filter((event) => event.time <= now).length, [events, now]);
  const frame = useMemo(() => kitchenFrame(replay, state, sequence, chefCount), [replay, state, sequence, chefCount]);
  const menuName = (menu: string) => info?.recipes[menu]?.name ?? menus.find((m) => m.id === menu)?.name ?? menu;

  async function open(speed: number) {
    setOpening(true); setError('');
    try {
      const created = await post<LiveSessionInfo>('/sessions', { speed, chefs: chefCount });
      startedAt.current = performance.now();
      eventsRef.current = [];
      speaker.current = 'chef';
      setEvents([]); setEntries([]); setNow(0); setSpeech(null);
      setInfo(created);
      return true;
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : '주방을 열지 못했습니다.');
      return false;
    } finally { setOpening(false); }
  }

  function say(who: string, text: string) {
    speechId.current += 1;
    setSpeech({ speaker: who, text, id: speechId.current });
  }

  async function send(text: string) {
    if (!info || replying) return;
    setEntries((current) => [...current, { kind: 'customer', text }]);
    say('customer', text);
    setReplying(true); setError('');
    try {
      const answer = await post<HostReply>(`/sessions/${info.session_id}/messages`, { text });
      // The chef handing off says the goodbye; the helper answers from the next message.
      const handedOff = answer.actions.some((action) => action.type === 'small_talk' && action.decision === 'hand_off');
      const who = handedOff ? speaker.current : answer.speaker;
      speaker.current = answer.speaker;
      setEntries((current) => [...current,
        { kind: 'host', text: answer.reply, failed: answer.failed, speaker: who },
        ...visibleActions(answer.actions).map((action) => ({ kind: 'action' as const, action }))]);
      say(who, answer.reply);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : '메시지를 보내지 못했습니다.');
    } finally { setReplying(false); }
  }

  /** The customer walked away, so whoever was chatting goes back to work. */
  function releaseChef() {
    if (info) void fetch(`/api/sessions/${info.session_id}/chef-hold`, { method: 'DELETE' }).catch(() => undefined);
  }

  return { menus, info, events, now, state, frame, entries, replying, opening, error, connected, speech, menuName, open, send, releaseChef };
}
