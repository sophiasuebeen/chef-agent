import assert from 'node:assert/strict';
import test from 'node:test';
import { describeAction } from '../src/live.ts';
import { dishName, ingredientName, savedLanguage, LANGUAGE_KEY } from '../src/game/language.ts';
import { dishAsset } from '../src/data/menuPresentation.ts';

test('saved language defaults safely when storage is absent, unavailable or invalid', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    for (const value of ['ko', 'en', 'fr', null]) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem(key) { assert.equal(key, LANGUAGE_KEY); return value; },
      } });
      assert.equal(savedLanguage(), value === 'en' ? 'en' : 'ko');
    }
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    assert.equal(savedLanguage(), 'ko');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('switching card language preserves the accepted dish, quantity and kitchen estimate', () => {
  const action = { type: 'order_accepted', menu: 'lemon_pasta', quantity: 2, ready_in_seconds: 710 };
  const before = structuredClone(action);
  const card = (language) => describeAction(action, (id) => dishName(id, 'Lemon Pasta', language), language);
  assert.match(card('ko'), /레몬 파스타 2접시.*12분/);
  assert.match(card('en'), /2 × Lemon Pasta.*12 min/);
  assert.deepEqual(action, before);
  assert.match(card('ko'), /레몬 파스타/);
});

test('English chat cards distinguish rejection and conversation hand-off from accepted orders', () => {
  const rejected = describeAction({ type: 'order_rejected', menu: 'unknown', reason: 'unsupported_menu' }, (id) => id, 'en');
  assert.match(rejected, /not on the menu/);
  assert.doesNotMatch(rejected, /accepted/);
  assert.match(describeAction({ type: 'small_talk', decision: 'hand_off', chef: 'chef_2' }, (id) => id, 'en'), /Chef 2.*taken over/);
});

test('fig pasta keeps its name, ingredients and asset at each presentation point', () => {
  assert.equal(dishName('fig_pasta', 'Fig Pasta', 'ko'), '무화과 파스타');
  assert.equal(dishName('fig_pasta', 'Fig Pasta', 'en'), 'Fig Pasta');
  assert.equal(ingredientName('fig', 'ko'), '무화과');
  assert.equal(ingredientName('basil', 'ko'), '바질');
  assert.equal(dishAsset('fig_pasta'), 'food.figPasta');
  assert.equal(dishAsset('lemon_pasta'), 'food.pasta');
  assert.equal(dishAsset('seafood_tomato'), 'food.seafoodTomato');
});

test('kitchen consultation is shown as staff checking, without implying an order was placed', () => {
  const action = { type: 'kitchen_consulted' };
  assert.match(describeAction(action, String), /주방에 확인/);
  assert.match(describeAction(action, String, 'en'), /checked with the kitchen/);
  assert.doesNotMatch(describeAction(action, String, 'en'), /accepted|rejected/);
});
