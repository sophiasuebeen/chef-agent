import { useEffect, useRef, useState, type FormEvent } from 'react';
import { describeAction, type ChatEntry } from '../live';

export function ChatPanel({ entries, busy, disabled, menuName, onSend }: {
  entries: ChatEntry[];
  busy: boolean;
  disabled: boolean;
  menuName: (menu: string) => string;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');
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
    <div className="chat-log" ref={log} role="log" aria-label="셰프와의 대화" aria-live="polite">
      {!entries.length && <p className="empty">메뉴를 보고 셰프에게 말을 걸어 보세요.</p>}
      {entries.map((entry, index) => entry.kind === 'action'
        ? <p key={index} className={`chat-action ${entry.action.type}`} data-testid="chat-action">
            {describeAction(entry.action, menuName)}</p>
        : <p key={index} className={`chat-bubble ${entry.kind} ${entry.kind === 'host' && entry.failed ? 'failed' : ''}`}>{entry.text}</p>)}
      {busy && <p className="chat-bubble host pending">셰프가 답하는 중…</p>}
    </div>
    <form className="chat-form" onSubmit={submit}>
      <input aria-label="셰프에게 할 말" placeholder="예: 레몬 파스타 하나 주세요" maxLength={500} value={draft}
        disabled={disabled} onChange={(event) => setDraft(event.target.value)} />
      <button disabled={busy || disabled || !draft.trim()}>보내기</button>
    </form>
  </div>;
}
