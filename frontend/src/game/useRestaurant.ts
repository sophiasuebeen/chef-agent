import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language } from './language';
import { EMPTY_RESTAURANT, type RestaurantState, type ServiceNotice } from './restaurant';

export function useRestaurant(sessionId: string | undefined, language: Language) {
  const [state, setState] = useState<RestaurantState>(EMPTY_RESTAURANT);
  const [notice, setNotice] = useState<ServiceNotice | null>(null);
  const [error, setError] = useState('');
  const [seating, setSeating] = useState(false);
  const serial = useRef(0), noticeId = useRef(0);
  const arrivals = useRef(new Set<number>());
  const currentSession = useRef(sessionId);
  currentSession.current = sessionId;

  const request = useCallback(async (suffix = '', method = 'GET', body?: unknown) => {
    const version = ++serial.current;
    const response = await fetch(`/api/sessions/${sessionId}/restaurant${suffix}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail ?? 'Service request failed.');
    if (currentSession.current === sessionId && version === serial.current) setState(result.restaurant ?? result);
    return result;
  }, [sessionId]);

  useEffect(() => {
    setState(EMPTY_RESTAURANT); setNotice(null); setError(''); arrivals.current.clear();
    if (!sessionId) return undefined;
    let pending = false, stopped = false;
    const poll = async () => {
      if (pending || stopped) return;
      pending = true;
      try { await request(); } catch (problem) {
        if (!stopped) setError(problem instanceof Error ? problem.message : 'Service unavailable.');
      } finally { pending = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 500);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [sessionId, request]);

  async function seat(seatId: string | null) {
    if (!sessionId || seating) return false;
    setSeating(true); setError('');
    try {
      await request('/seat', seatId ? 'POST' : 'DELETE', seatId ? { seat_id: seatId } : undefined);
      return true;
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not take this seat.'); return false; }
    finally { setSeating(false); }
  }

  const arrive = useCallback(async (waiterId: string, taskId: number) => {
    if (arrivals.current.has(taskId)) return;
    arrivals.current.add(taskId);
    try {
      const result = await request('/arrivals', 'POST', { waiter_id: waiterId, task_id: taskId, language });
      if (result.notice && currentSession.current === sessionId) {
        setNotice({ ...result.notice, id: ++noticeId.current });
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Staff could not complete the delivery.');
      // Polling reconciles obsolete tasks; transient failures can retry after a second.
      window.setTimeout(() => arrivals.current.delete(taskId), 1000);
    }
  }, [request, language, sessionId]);

  return { state, notice, error, seating, seat, arrive };
}
