import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrderSubmission, expandOrders } from '../src/ordering.ts';
const cart = [{ menu: 'lemon_pasta', quantity: 2, time_limit: 900 }];
test('quantity becomes independent orders and custom item deadlines are retained', () => {
  const orders = expandOrders([...cart, { menu: 'lemon_pasta', quantity: 1, time_limit: 42 }]);
  assert.equal(orders.length, 3); assert.notEqual(orders[0], orders[1]); assert.equal(orders[2].time_limit, 42);
  assert.throws(() => expandOrders([]));
  assert.throws(() => expandOrders([{ ...cart[0], quantity: 1.5 }]));
});
test('a mixed cart keeps each menu on its own order', () => {
  const orders = expandOrders([cart[0], { menu: 'seafood_tomato', quantity: 1, time_limit: 900 }]);
  assert.deepEqual(orders.map((o) => o.menu), ['lemon_pasta', 'lemon_pasta', 'seafood_tomato']);
});
test('one and two plates submit all orders then execute exactly once', async () => {
  for (const quantity of [1, 2]) {
    const calls = [];
    const api = async (path, body) => { calls.push({path, body}); return path === '/runs' ? {run_id:'r'} : { result: {completed:true} }; };
    await createOrderSubmission(api)([{...cart[0], quantity}], 'priority');
    assert.equal(calls.filter(c => c.path.endsWith('/orders')).length, quantity);
    assert.equal(calls.at(-1).path, '/runs/r/execute');
    assert.equal(calls.filter(c => c.path.endsWith('/execute')).length, 1);
  }
});
test('partial intake failure prevents execution, names stage, and allows a fresh retry', async () => {
  const calls = []; let fail = true;
  const submit = createOrderSubmission(async (path) => {
    calls.push(path);
    if (fail && calls.length === 3) throw new Error('intake unavailable');
    return {run_id:'r'};
  });
  await assert.rejects(submit(cart, 'scripted'), /주문 접수.*실패/);
  assert.ok(!calls.includes('/runs/r/execute'));
  fail = false; await submit(cart, 'scripted');
  assert.equal(calls.filter(c => c.endsWith('/execute')).length, 1);
});
test('synchronous submission guard rejects duplicates before another run is created', async () => {
  let release; let calls = 0;
  const gate = new Promise(resolve => {release = resolve;});
  const submit = createOrderSubmission(async (path) => { calls++; if(path === '/runs') {await gate; return {run_id:'r'};} return {}; });
  const first = submit(cart, 'scripted');
  await assert.rejects(submit(cart, 'scripted'), /이미/);
  assert.equal(calls, 1); release(); await first;
});
test('execution transport failure is surfaced without retrying execution', async () => {
  let executions = 0;
  const submit = createOrderSubmission(async (path) => { if(path.endsWith('/execute')) {executions++; throw new Error('offline');} return {run_id:'r'}; });
  await assert.rejects(submit(cart, 'scripted'), /조리 실행 실패: offline/);
  assert.equal(executions, 1);
});
