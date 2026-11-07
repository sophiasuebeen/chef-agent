/** A physical service visit, independent of how quickly the model returns its findings. */
export type ConsultationStage = 'meeting' | 'announce' | 'to_kitchen' | 'waiting' | 'returning' | 'done';
export interface ConsultationTrip { turn: number; stage: ConsultationStage; returnTo: string; since: number }

export function consultationTarget(trip: ConsultationTrip): string | null {
  if (trip.stage === 'done') return null;
  return trip.stage === 'to_kitchen' || trip.stage === 'waiting' ? 'wp.pickup' : trip.returnTo;
}

export function advanceConsultation(trip: ConsultationTrip, now: number, arrived: boolean, replyReady: boolean, carrying: boolean): ConsultationTrip {
  if (carrying) return trip;
  let stage = trip.stage;
  if (stage === 'meeting' && arrived) stage = 'announce';
  else if (stage === 'announce' && arrived && now - trip.since >= 1.5) stage = 'to_kitchen';
  else if (stage === 'to_kitchen' && arrived) stage = 'waiting';
  else if (stage === 'waiting' && arrived && replyReady) stage = 'returning';
  else if (stage === 'returning' && arrived) stage = 'done';
  return stage === trip.stage ? trip : { ...trip, stage, since: now };
}
