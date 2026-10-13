// node backend/orders.test.js
// Each case fails on the original code and passes after the fix.

const assert = require('assert');
const { validateLine, releaseStock } = require('./logic/validation');
const { applyCoupon } = require('./logic/pricing');

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log('  pass  ' + name);
  } catch (err) {
    failures += 1;
    console.log('  FAIL  ' + name + '\n        ' + err.message);
  }
}

const noon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };

const dish = (over = {}) => ({
  id: 1, name: 'Samosa', stock: 2, disabled: false, category: 'Snacks',
  price: 20, veg: true, slot: 'allday', ...over,
});

console.log('\nCC-06 ordering more than the stock');

check('ordering 5 of a dish with 2 left is rejected', () => {
  const errors = validateLine({ dishId: 1, qty: 5 }, 0, [dish()], noon(), new Set());
  assert.ok(errors.some((e) => /only 2 left/.test(e)), 'got: ' + JSON.stringify(errors));
});

check('ordering exactly the stock is allowed', () => {
  const errors = validateLine({ dishId: 1, qty: 2 }, 0, [dish()], noon(), new Set());
  assert.deepStrictEqual(errors, []);
});

check('a sold out dish is still rejected', () => {
  const errors = validateLine({ dishId: 1, qty: 1 }, 0, [dish({ stock: 0 })], noon(), new Set());
  assert.ok(errors.some((e) => /sold out/i.test(e)), 'got: ' + JSON.stringify(errors));
});

console.log('\nCC-07 cancelling restores stock');

check('cancelling puts the plates back', () => {
  const menu = [dish({ stock: 3 })];
  const after = releaseStock([{ dishId: 1, qty: 2 }], menu);
  assert.strictEqual(after[0].stock, 5);
});

check('cancelling twice does not drive stock negative', () => {
  let menu = [dish({ stock: 0 })];
  menu = releaseStock([{ dishId: 1, qty: 2 }], menu);
  menu = releaseStock([{ dishId: 1, qty: 2 }], menu);
  assert.strictEqual(menu[0].stock, 4);
});

check('reserve then release returns to where it started', () => {
  const start = 6;
  const menu = releaseStock([{ dishId: 1, qty: 2 }], [dish({ stock: start - 2 })]);
  assert.strictEqual(menu[0].stock, start);
});

check('dishes not in the order are untouched', () => {
  const menu = [dish({ stock: 3 }), dish({ id: 2, name: 'Tea', stock: 9 })];
  const after = releaseStock([{ dishId: 1, qty: 1 }], menu);
  assert.strictEqual(after[1].stock, 9);
});

console.log('\nCC-08 expired coupons');

const coupons = [
  { code: 'FRESHERS24', type: 'percent', value: 20, minOrder: 0, usesLeft: 5, maxDiscount: 999, expiresAt: '2024-09-30T23:59:59.000Z' },
  { code: 'LIVE50', type: 'flat', value: 50, minOrder: 0, usesLeft: 5, maxDiscount: 999, expiresAt: '2099-12-31T23:59:59.000Z' },
];
const lines = [{ lineTotal: 200, qty: 2, veg: true }];

check('an expired coupon is refused', () => {
  const result = applyCoupon('FRESHERS24', lines, coupons, { now: new Date() });
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.discount, 0);
  assert.ok(/expired/i.test(result.reason || ''), 'reason was: ' + result.reason);
});

check('case and spacing do not sneak it past', () => {
  const result = applyCoupon('  freshers24 ', lines, coupons, { now: new Date() });
  assert.strictEqual(result.valid, false);
});

check('a live coupon still works', () => {
  const result = applyCoupon('LIVE50', lines, coupons, { now: new Date() });
  assert.strictEqual(result.valid, true);
  assert.ok(result.discount > 0);
});

check('it was valid before it expired', () => {
  const result = applyCoupon('FRESHERS24', lines, coupons, { now: new Date('2024-01-01') });
  assert.strictEqual(result.valid, true);
});

check('an unknown coupon is still not found', () => {
  assert.strictEqual(applyCoupon('NOPE', lines, coupons, {}).valid, false);
});

console.log('\n' + (failures ? failures + ' failed\n' : 'all passed\n'));
process.exit(failures ? 1 : 0);
