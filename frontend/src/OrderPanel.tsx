import { useEffect, useState, type FormEvent } from 'react';
import type { CartItem, Menu } from './ordering';
export function OrderPanel({ busy, onCook }: { busy: boolean; onCook: (cart: CartItem[], policy: string, maxSimulatedTime: number) => void }) {
  const [menus, setMenus] = useState<Menu[]>([]), [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0), [policy, setPolicy] = useState('scripted');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [maxSimulatedTime, setMaxSimulatedTime] = useState(1800);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    fetch('/api/menus').then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: Menu[] = await response.json();
      if (!cancelled) setMenus(data);
    }).catch((problem) => { if (!cancelled) setError(`메뉴 로딩 실패: ${problem.message}`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);
  function submit(event: FormEvent) { event.preventDefault(); if (!busy && cart.length) onCook(cart, policy, maxSimulatedTime); }

  return <>
    <h2>메뉴 선택</h2>
    {loading && <p role="status">메뉴를 불러오는 중…</p>}
    {error && <div role="alert" className="notice error">{error}<button disabled={busy} onClick={() => setAttempt((v) => v + 1)}>다시 시도</button></div>}
    {!loading && !error && !menus.length && <p>현재 주문 가능한 메뉴가 없습니다.</p>}
    {menus.map((menu) => <article className="menu-card" key={menu.id}>
      <h3>{menu.name}</h3><p className="muted">재료: {menu.ingredients.join(', ')}</p>
      <label>수량<input aria-label={`${menu.name} 수량`} type="number" min="1" max="20" step="1" disabled={busy}
        value={Number.isNaN(quantities[menu.id]) ? '' : quantities[menu.id] ?? 1}
        onChange={(event) => setQuantities((values) => ({ ...values, [menu.id]: event.target.valueAsNumber }))} /></label>
      <button disabled={busy || !Number.isInteger(quantities[menu.id] ?? 1) || (quantities[menu.id] ?? 1) < 1 || (quantities[menu.id] ?? 1) > 20}
        onClick={() => setCart((items) => [...items, { menu: menu.id, quantity: quantities[menu.id] ?? 1, time_limit: 900 }])}>주문에 추가</button>
    </article>)}
    <form onSubmit={submit} aria-label="주문 목록">
      <h2>주문 목록 · {cart.reduce((sum, item) => sum + (item.quantity || 0), 0)}접시</h2>
      {!cart.length && <p className="muted">메뉴를 선택해 주문에 추가해주세요.</p>}
      {cart.map((item, index) => <div className="cart-item" key={index}>
        <strong>{menus.find((menu) => menu.id === item.menu)?.name ?? item.menu}</strong>
        <label>주문 수량<input aria-label={`주문 항목 ${index + 1} 수량`} type="number" min="1" max="20" step="1" required disabled={busy}
          value={Number.isNaN(item.quantity) ? '' : item.quantity} onChange={(event) => setCart((items) => items.map((v, i) => i === index ? { ...v, quantity: event.target.valueAsNumber } : v))} /></label>
        <button type="button" disabled={busy} onClick={() => setCart((items) => items.filter((_, i) => i !== index))}>삭제</button>
        <details><summary>고급 설정</summary><label>마감 시간 (simulated seconds)<input type="number" min="1" max="9007199254740991" step="1" required disabled={busy}
          value={Number.isNaN(item.time_limit) ? '' : item.time_limit} onChange={(event) => setCart((items) => items.map((v, i) => i === index ? { ...v, time_limit: event.target.valueAsNumber } : v))} /></label></details>
      </div>)}
      <label>실행 모드<select value={policy} disabled={busy} onChange={(event) => setPolicy(event.target.value)}>
        <option value="scripted">Scripted baseline</option><option value="priority">Priority · earliest deadline</option><option value="agent">LLM chef · comparison</option>
      </select></label>
      <label>전체 실행 제한 시간 (simulated seconds)<input type="number" min="1" max="86400" step="1" required disabled={busy}
        value={Number.isNaN(maxSimulatedTime) ? '' : maxSimulatedTime}
        onChange={(event) => setMaxSimulatedTime(event.target.valueAsNumber)} /></label>
      {policy === 'agent' && <p className="muted">서버의 모델과 인증 정보를 사용하며 제공자 요금이 발생할 수 있습니다.</p>}
      <button className="primary" disabled={busy || !cart.length}>{busy ? '주문 처리 중…' : '조리 시작'}</button>
    </form>
  </>;
}
