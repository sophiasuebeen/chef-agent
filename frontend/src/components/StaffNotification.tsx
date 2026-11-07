import { useState } from 'react';
import { chefLabel, type StaffProgress } from '../live';
import type { Language } from '../game/language';
import './staff-assistance.css';

export function StaffNotification({ progress, busy, language = 'ko' }: {
  progress: StaffProgress | null; busy: boolean; language?: Language;
}) {
  const [dismissed, setDismissed] = useState('');
  if (!progress) return null;
  const key = `${progress.turn}:${progress.phase}`;
  if (key === dismissed) return null;
  const ko = language === 'ko', who = chefLabel(progress.speaker, language);
  const checking = progress.phase === 'checking';
  const title = checking || (progress.phase === 'checked' && busy)
    ? (ko ? '방금 직원이 주방에 문의했습니다!' : 'A staff member just asked the kitchen!')
    : progress.phase === 'checked' ? (ko ? '주방에 확인했어요' : 'The kitchen has replied')
    : (ko ? '주방 확인을 마치지 못했어요' : 'We could not finish checking with the kitchen');
  const detail = checking ? (ko ? '주방에 확인하고 돌아와서 알려드릴게요.' : "Your waiter will check and come back to let you know.")
    : progress.phase === 'checked' ? (ko ? (busy ? '확인한 내용을 가지고 돌아와 안내해 드릴게요.' : '담당 직원의 답변을 확인해 보세요.')
      : (busy ? 'Your waiter will bring the answer back to you.' : "Your waiter's answer is ready."))
    : (ko ? '담당 직원에게 다시 말씀해 주세요.' : 'Please ask your waiter to try again.');
  return <aside className={`staff-notification ${progress.phase}`} role="status" aria-live="polite" aria-atomic="true" data-testid="staff-notification"
    onPointerDown={(event) => event.stopPropagation()}>
    <span className={`staff-notification-icon${checking ? ' spinning' : ''}`} aria-hidden="true">{checking ? '' : progress.phase === 'checked' ? '✓' : '!'}</span>
    <div><strong>{title}</strong><p>{checking || (progress.phase === 'checked' && busy) ? `${who} · ${detail}` : detail}</p></div>
    <button type="button" aria-label={ko ? '알림 닫기' : 'Dismiss notification'} onClick={() => setDismissed(key)}>×</button>
  </aside>;
}
