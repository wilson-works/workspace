'use strict';

/**
 * fact-contract.test.js — acceptance OFF-08, OFF-21.
 *
 * OFF-08: "Every displayed fact carries {value, source_path, observed_at,
 * status}. There is no code path that can construct a displayed fact without
 * all four — the constructor throws."
 *
 * OFF-21 (amendment): "The verdict inherits the weakest input's status. Any
 * dark input makes the verdict word UNKNOWN, and the dark inputs are named
 * beneath it." Proven here at the aggregate() level, which is what the
 * verdict is built from.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { fact, aged, aggregate, STATUS, FactContractError } = require('../src/server/fact');

test('OFF-08 fact() throws FactContractError on any of the four missing required fields, on a null value outside NOT_READ, forces NOT_READ to REMOVE the value, and returns a frozen four-field object when fully specified', () => {
  const now = Date.now();

  // Each of the four required fields, missing independently.
  assert.throws(
    () => fact({ value: 1, observed_at: now, status: STATUS.OK }),
    FactContractError,
    'missing source_path must throw'
  );
  assert.throws(
    () => fact({ value: 1, source_path: 'x', status: STATUS.OK }),
    FactContractError,
    'missing observed_at must throw'
  );
  assert.throws(
    () => fact({ value: 1, source_path: 'x', observed_at: now }),
    FactContractError,
    'missing status must throw'
  );
  assert.throws(
    () => fact({ source_path: 'x', observed_at: now, status: STATUS.OK }),
    FactContractError,
    'missing the value key entirely must throw'
  );

  // A null value with any status other than NOT_READ is the bug this file exists to catch.
  assert.throws(
    () => fact({ value: null, source_path: 'x', observed_at: now, status: STATUS.OK }),
    FactContractError,
    'null value with status OK must throw'
  );
  assert.throws(
    () => fact({ value: null, source_path: 'x', observed_at: now, status: STATUS.STALE }),
    FactContractError,
    'null value with status STALE must throw'
  );

  // NOT_READ forces the value to be REMOVED, not merely greyed — pass a value
  // anyway and it must still come back null.
  const notRead = fact({
    value: 'should never render',
    source_path: 'x',
    observed_at: now,
    status: STATUS.NOT_READ,
  });
  assert.equal(notRead.value, null, 'NOT_READ must REMOVE the value, never pass it through');

  // Positive control: a suite that only proves things throw would pass even if
  // every legal call also threw. Prove the happy path actually returns a fact.
  const f = fact({ value: 42, source_path: 'x', observed_at: now, status: STATUS.OK });
  assert.equal(f.value, 42);
  assert.equal(f.source_path, 'x');
  assert.equal(f.observed_at, now);
  assert.equal(f.status, STATUS.OK);
  assert.ok(Object.isFrozen(f), 'fact() must return a frozen object');
});

test('OFF-21 aggregate() inherits the weakest input status and names every dark input, while four healthy inputs stay OK with nothing dark', () => {
  const now = Date.now();
  const ok = (p) => fact({ value: 1, source_path: p, observed_at: now, status: STATUS.OK });
  const notReadInput = fact({ value: null, source_path: 'd', observed_at: now, status: STATUS.NOT_READ });

  // Positive control: four healthy inputs aggregate to OK with dark.length === 0.
  const healthy = aggregate({
    value: 4,
    source_path: 'verdict (aggregate)',
    observed_at: now,
    inputs: [ok('a'), ok('b'), ok('c'), ok('d')],
  });
  assert.equal(healthy.status, STATUS.OK);
  assert.equal(healthy.dark.length, 0);

  // Three OK inputs plus one NOT_READ input must demote the whole aggregate.
  const mixed = aggregate({
    value: 4,
    source_path: 'verdict (aggregate)',
    observed_at: now,
    inputs: [ok('a'), ok('b'), ok('c'), notReadInput],
  });
  assert.equal(mixed.status, STATUS.NOT_READ);
  assert.equal(mixed.dark.length, 1);
  assert.deepEqual(mixed.dark, ['d']);
  assert.equal(mixed.value, null, 'a NOT_READ aggregate must also have its own value removed');
});

test('fact.aged() moves a reading through OK, STALE and NOT_READ as it crosses max_age_ms and the demote multiple, with an explicit now', () => {
  const now = 1_000_000;
  const maxAgeMs = 1000;
  const demoteMultiple = 3;
  const base = { value: 'v', source_path: 'src', status: STATUS.OK };

  const fresh = aged({ ...base, observed_at: now - 100 }, now, maxAgeMs, demoteMultiple);
  assert.equal(fresh.status, STATUS.OK);
  assert.equal(fresh.value, 'v');

  const stale = aged({ ...base, observed_at: now - (maxAgeMs + 1) }, now, maxAgeMs, demoteMultiple);
  assert.equal(stale.status, STATUS.STALE);
  assert.equal(stale.value, 'v', 'STALE keeps the value present — only STALE names its age explicitly');

  const gone = aged({ ...base, observed_at: now - (maxAgeMs * demoteMultiple + 1) }, now, maxAgeMs, demoteMultiple);
  assert.equal(gone.status, STATUS.NOT_READ);
  assert.equal(gone.value, null, 'past the demote multiple the value must be REMOVED, never greyed-but-present');
});
