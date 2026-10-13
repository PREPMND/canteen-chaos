// Plain node, no test runner: node backend/search.test.js
// Each case fails on the original code and passes after the fix.

const assert = require('assert');
const { sortDishes, paginate, SORTERS } = require('./logic/search');

const dishes = [
  { id: 1, name: 'Cheap', price: 20, rating: 4, prepMinutes: 5, orderable: true },
  { id: 2, name: 'Mid', price: 60, rating: 3, prepMinutes: 8, orderable: true },
  { id: 3, name: 'Dear', price: 120, rating: 5, prepMinutes: 2, orderable: true },
];

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

console.log('\nCC-10 price sorting');

check('price-asc puts the cheapest first', () => {
  const prices = sortDishes(dishes, 'price-asc').map((d) => d.price);
  assert.deepStrictEqual(prices, [20, 60, 120]);
});

check('price-desc puts the dearest first', () => {
  const prices = sortDishes(dishes, 'price-desc').map((d) => d.price);
  assert.deepStrictEqual(prices, [120, 60, 20]);
});

check('the two price sorters are exact opposites', () => {
  const asc = sortDishes(dishes, 'price-asc').map((d) => d.id);
  const desc = sortDishes(dishes, 'price-desc').map((d) => d.id);
  assert.deepStrictEqual(asc, desc.slice().reverse());
});

check('sortDishes does not mutate its input', () => {
  const before = dishes.map((d) => d.id);
  sortDishes(dishes, 'price-asc');
  assert.deepStrictEqual(dishes.map((d) => d.id), before);
});

console.log('\nCC-09 pagination');

const many = Array.from({ length: 37 }, (_u, i) => ({ id: i + 1, price: i }));

check('a page of 5 returns 5 items, not the whole list', () => {
  const page = paginate(many, 1, 5);
  assert.strictEqual(page.items.length, 5, 'got ' + page.items.length + ' items');
});

check('page 2 returns the next 5, not the first 5', () => {
  const page = paginate(many, 2, 5);
  assert.deepStrictEqual(page.items.map((d) => d.id), [6, 7, 8, 9, 10]);
});

check('the last page returns only what is left', () => {
  const page = paginate(many, 8, 5);
  assert.strictEqual(page.items.length, 2);
  assert.strictEqual(page.hasMore, false);
});

check('total still counts the whole list, not the page', () => {
  assert.strictEqual(paginate(many, 1, 5).total, 37);
});

check('every page together returns each item exactly once', () => {
  const seen = [];
  for (let p = 1; p <= paginate(many, 1, 5).pages; p += 1) {
    seen.push(...paginate(many, p, 5).items.map((d) => d.id));
  }
  assert.deepStrictEqual(seen, many.map((d) => d.id));
});

console.log('\nguards against the obvious regressions');

check('other sorters are untouched', () => {
  assert.deepStrictEqual(sortDishes(dishes, 'rating-desc').map((d) => d.rating), [5, 4, 3]);
  assert.deepStrictEqual(sortDishes(dishes, 'prep-asc').map((d) => d.prepMinutes), [2, 5, 8]);
  assert.deepStrictEqual(sortDishes(dishes, 'name-asc').map((d) => d.name), ['Cheap', 'Dear', 'Mid']);
});

check('an unknown sort key still falls back to default', () => {
  assert.strictEqual(typeof SORTERS.default, 'function');
  assert.strictEqual(sortDishes(dishes, 'nonsense').length, 3);
});

console.log('\n' + (failures ? failures + ' failed\n' : 'all passed\n'));
process.exit(failures ? 1 : 0);
