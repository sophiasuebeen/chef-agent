export type Language = 'ko' | 'en';
export const LANGUAGE_KEY = 'beach-pasta-language';

export function savedLanguage(): Language {
  try { return localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'ko'; }
  catch { return 'ko'; }
}

export const gameText = {
  ko: {
    language: '언어', timeOfDay: '시간대', golden: '골든아워', noon: '낮', dusk: '해질녘', night: '밤',
    sit: '의자에 앉기', stand: '일어나기', pickup: '파스타 집기', place: '테이블에 놓기', carrying: '들고 있는 접시', onTable: '테이블에 놓음',
    carryHint: '테이블 가까이에서 E로 내려놓으세요', muteMusic: '음악 음소거', unmuteMusic: '음악 켜기', reconnect: '주방에 다시 연결하는 중', title: '바닷가 파스타 식당', intro: '마음에 드는 자리에 앉아 보세요. 담당 웨이터가 주문과 서빙을 도와드려요.',
    chefs: '셰프 수', speed: '주방 속도', realTime: '실제 시간', opening: '여는 중…', enter: '입장하기',
    note: '소리가 납니다 · 대화할 때마다 모델 요금이 발생할 수 있어요', counter: '주문 카운터',
    open: '영업 중', connecting: '연결 중…', chatting: '대화 중', music: '배경 음악', muted: '음악 꺼짐', bossa: '보사노바', volume: '음악 크기',
    orders: '내 주문', allReady: '모두 완성', noOrders: '아직 주문이 없어요.', pending: '대기 중', cooking: '조리 중', served: '완성',
    onTime: '제시간', late: '늦음', viewMenu: '메뉴판 보기', talk: '직원에게 말 걸기',
    move: '이동', clickWalk: '클릭으로 걷기', drag: '드래그 또는', camera: '시점', interact: '상호작용',
    chat: '직원과 대화', closeChat: '대화 닫기', close: '닫기 (Esc)', menu: '메뉴', orderThis: '이걸로 말하기',
    log: '직원과의 대화', emptyChat: '메뉴를 보고 직원에게 말을 걸어 보세요.', thinking: '직원이 답하는 중…',
    message: '직원에게 할 말', placeholder: '예: 레몬 파스타 하나 주세요', send: '보내기',
    loadError: '메뉴를 불러오지 못했습니다.', openError: '주방을 열지 못했습니다.', sendError: '메시지를 보내지 못했습니다.',
  },
  en: {
    language: 'Language', timeOfDay: 'Time of day', golden: 'Golden hour', noon: 'Noon', dusk: 'Dusk', night: 'Night',
    sit: 'Sit down', stand: 'Stand up', pickup: 'Pick up pasta', place: 'Place on table', carrying: 'Carrying', onTable: 'On the table',
    carryHint: 'Walk to a table and press E to put it down', muteMusic: 'Mute music', unmuteMusic: 'Unmute music', reconnect: 'Reconnecting to the kitchen', title: 'Beach Pasta Restaurant', intro: 'Take a seat. Your waiter will help you order and bring your meal.',
    chefs: 'Chefs', speed: 'Kitchen speed', realTime: 'Real time', opening: 'Opening…', enter: 'Enter restaurant',
    note: 'Sound is on · Conversations may incur model charges', counter: 'Order counter',
    open: 'Open', connecting: 'Connecting…', chatting: 'chatting', music: 'Background music', muted: 'Music off', bossa: 'Bossa nova', volume: 'Music volume',
    orders: 'My orders', allReady: 'All ready', noOrders: 'No orders yet.', pending: 'Waiting', cooking: 'Cooking', served: 'Ready',
    onTime: 'On time', late: 'Late', viewMenu: 'View menu', talk: 'Talk to staff',
    move: 'move', clickWalk: 'click to walk', drag: 'drag or', camera: 'look around', interact: 'interact',
    chat: 'Chat with staff', closeChat: 'Close chat', close: 'Close (Esc)', menu: 'Menu', orderThis: 'Order this',
    log: 'Conversation with staff', emptyChat: 'Browse the menu and say hello to your waiter.', thinking: 'Staff is replying…',
    message: 'Message to staff', placeholder: 'e.g. One lemon pasta, please', send: 'Send',
    loadError: 'Could not load the menu.', openError: 'Could not open the kitchen.', sendError: 'Could not send the message.',
  },
} satisfies Record<Language, Record<string, string>>;

const dishNames: Record<string, string> = { lemon_pasta: '레몬 파스타', seafood_tomato: '해산물 토마토 파스타', fig_pasta: '무화과 파스타' };
const ingredientNames: Record<string, string> = {
  spaghetti: '스파게티', water: '물', salt: '소금', lemon: '레몬', butter: '버터', garlic: '마늘', mint: '민트', cheese: '치즈',
  shrimp: '새우', mussels: '홍합', squid: '오징어', tomato: '토마토', 'olive oil': '올리브 오일', parsley: '파슬리',
  fig: '무화과', basil: '바질',
};
export const dishName = (id: string, fallback: string, language: Language) => language === 'ko' ? dishNames[id] ?? fallback : fallback;
export const ingredientName = (name: string, language: Language) => language === 'ko' ? ingredientNames[name] ?? name : name;
export const orderDraft = (name: string, language: Language) => language === 'ko' ? `${name} 하나 주세요` : `One ${name}, please`;
export const readyToast = (name: string, language: Language) => language === 'ko' ? `${name} 완성! 카운터에 나왔어요` : `${name} is ready at the counter!`;
export const waitingText = (count: number, language: Language) => language === 'ko' ? `${count}개 준비 중` : `${count} preparing`;
