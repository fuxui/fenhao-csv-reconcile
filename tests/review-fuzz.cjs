'use strict';
// Independent review checks. Reproduce with: node tests/review-fuzz.cjs
const C = require('../core.js');
const assert = require('node:assert/strict');
const INITIAL_SEED = 713;
let seed = INITIAL_SEED;
const rnd = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
const atoms = ['中文', 'a', ',', '"', '\r', '\n', '\r\n', '0', ' ', '\t'];
const quote = x => '"' + x.replace(/"/g, '""') + '"';
for (let t = 0; t < 2000; t++) {
  const expected = Array.from({length: 1 + rnd(12)}, () =>
    Array.from({length: 3}, () =>
      Array.from({length: rnd(12)}, () => atoms[rnd(atoms.length)]).join('')));
  const csv = '编号,金额,备注\r\n' + expected.map(row => row.map(quote).join(',')).join('\r\n');
  assert.deepEqual(C.parseCSV(csv).rows.map(x => x.cells), expected, `round trip ${t}, initial seed ${INITIAL_SEED}`);
}
const v = C.validate(C.parseCSV('id,amount\n001,0.10\n1,0.20'), 0, 1);
assert.equal(v.errors.length, 0);
assert.deepEqual(v.entries.map(x => x.id), ['001', '1']);
const huge = C.validate(C.parseCSV('id,amount\na,9999999999999999.99\nb,9999999999999999.99'), 0, 1);
assert.equal(huge.errors.length, 0);
assert.equal(huge.total, 1999999999999999998n);
console.log(`PASS: 2,000 seeded quoted CSV round trips (initial seed ${INITIAL_SEED}).`);
console.log('PASS: 001 and 1 remain distinct text IDs.');
console.log('PASS: exact aggregate above single-entry limit = 1999999999999999998 cents.');
