import { useEffect, useRef, useState, type FormEvent } from 'react';
import { gameText, type Language } from '../game/language';
import { chefLabel, describeAction, type ChatEntry, type StaffProgress } from '../live';
import './staff-assistance.css';

export function ChatPanel({ entries, busy, disabled, menuName, onSend, draft: sharedDraft, onDraftChange, autoFocus, language = 'ko', progress }: {
  entries: ChatEntry[];
  busy: boolean;
  disabled: boolean;
  menuName: (menu: string) => string;
  onSend: (text: string) => void;
  draft?: string;
  onDraftChange?: (text: string) => void;
  autoFocus?: boolean;
  language?: Language;
  progress?: StaffProgress | null;
}) {
  const t = gameText[language];
  const [ownDraft, setOwnDraft] = useState('');
  const draft = sharedDraft ?? ownDraft;
  const setDraft = onDraftChange ?? setOwnDraft;
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [entries, busy]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy || disabled) return;
    setDraft('');
    onSend(text);
  }

  return <div className="chat">
    <div className="chat-log" ref={log} role="log" aria-label={t.log} aria-live="polite">
      {!entries.length && <p className="empty">{t.emptyChat}</p>}
      {entries.map((entry, index) => entry.kind === 'action'
        ? <p key={index} className={`chat-action ${entry.action.type}`} data-testid="chat-action">
            {describeAction(entry.action, menuName, language)}</p>
        : <p key={index} className={`chat-bubble ${entry.kind} ${entry.kind === 'host' && entry.failed ? 'failed' : ''}`}>
            {entry.kind === 'host' && entry.speaker && <span className="chat-speaker">{chefLabel(entry.speaker, language)}</span>}{entry.text}</p>)}
      {busy && <p className="chat-bubble host pending">{progress?.phase === 'checking'
        ? (language === 'ko' ? '주방에 확인하고 있어요…' : 'Checking with the kitchen…') : t.thinking}</p>}
    </div>
    <form className="chat-form" onSubmit={submit}>
      <input aria-label={t.message} placeholder={t.placeholder} maxLength={500} value={draft}
        disabled={disabled} autoFocus={autoFocus} onChange={(event) => setDraft(event.target.value)} />
      <button disabled={busy || disabled || !draft.trim()}>{t.send}</button>
    </form>
  </div>;
}
