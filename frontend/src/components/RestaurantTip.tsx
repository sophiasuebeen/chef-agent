import { useEffect, useState } from 'react';
import type { Language } from '../game/language';
import './staff-assistance.css';

export function RestaurantTip({ language, waiting }: { language: Language; waiting: boolean }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const tips = language === 'ko'
    ? [...(waiting ? ['주문이 너무 안 나오나요? 웨이터한테 따져보세요.'] : []),
        '진상짓을 해보세요.', '웨이터한테 트집을 잡아보세요.', '응대가 마음에 안 드나요? 매니저에게 한마디 해보세요.']
    : [...(waiting ? ['Food taking too long? Give your waiter a hard time.'] : []),
        'Try being a difficult customer.', 'Find something to complain to your waiter about.', 'Unhappy with the service? Have a word with the manager.'];
  useEffect(() => {
    const hideTimer = window.setTimeout(() => setVisible(false), 5000);
    let nextHideTimer = 0;
    const showTimer = window.setInterval(() => {
      setIndex((current) => current + 1);
      setVisible(true);
      window.clearTimeout(nextHideTimer);
      nextHideTimer = window.setTimeout(() => setVisible(false), 5000);
    }, 20000);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(nextHideTimer);
      window.clearInterval(showTimer);
    };
  }, []);
  if (!visible) return null;
  return <aside className="restaurant-tip" role="note" data-testid="restaurant-tip">
    <span key={index} className="restaurant-tip-copy"><b>Tip:</b> {tips[index % tips.length]}</span>
  </aside>;
}
