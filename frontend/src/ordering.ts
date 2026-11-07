import type { Replay } from './replay';
export interface Menu { id: string; name: string; ingredients: string[] }
export interface CartItem { menu: string; quantity: number; time_limit: number }
export type Api = <T>(path: string, body?: unknown) => Promise<T>;

export function expandOrders(cart: CartItem[]) {
  if (!cart.length) throw new Error('주문 목록이 비어 있습니다.');
  return cart.flatMap((item) => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 20
      || !Number.isSafeInteger(item.time_limit) || item.time_limit < 1 || item.time_limit > Number.MAX_SAFE_INTEGER) {
      throw new Error('수량은 1–20, 마감 시간은 양의 정수로 입력해주세요.');
    }
    return Array.from({ length: item.quantity }, () => ({ menu: item.menu, time_limit: item.time_limit }));
  });
}

/** One synchronous guard shared by intake and execution, including the first render before busy updates. */
export function createOrderSubmission(api: Api) {
  let pending = false;
  return async (cart: CartItem[], policy: string, maxSimulatedTime = 1800, chefs = 1): Promise<Replay> => {
    if (pending) throw new Error('이미 주문을 처리하고 있습니다.');
    const orders = expandOrders(cart);
    if (!Number.isSafeInteger(maxSimulatedTime) || maxSimulatedTime < 1 || maxSimulatedTime > 86400) {
      throw new Error('전체 실행 제한 시간은 1–86400초 사이의 정수로 입력해주세요.');
    }
    if (!Number.isSafeInteger(chefs) || chefs < 1 || chefs > 4) throw new Error('셰프 수는 1–4 사이의 정수로 입력해주세요.');
    pending = true;
    let stage = '실행 준비';
    try {
      const { run_id } = await api<{ run_id: string }>('/runs', { chefs });
      for (let index = 0; index < orders.length; index++) {
        stage = `주문 접수 (${index + 1}/${orders.length})`;
        await api(`/runs/${run_id}/orders`, orders[index]);
      }
      stage = '조리 실행';
      return await api<Replay>(`/runs/${run_id}/execute`, { policy, max_simulated_time: maxSimulatedTime });
    } catch (error) {
      throw new Error(`${stage} 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally { pending = false; }
  };
}
