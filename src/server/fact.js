'use strict';

/**
 * fact.js — the one mechanism that makes this wall honest.
 *
 * The rule, as a structural defence:
 *
 *   No raw number reaches a component. Every panel renders a
 *   {value, source_path, observed_at, status} object, and there is NO
 *   constructor that can produce one without all four.
 *
 * So this module exports no way to make a displayable fact without saying where
 * it came from and when it was read. `fact()` throws rather than defaulting.
 * That is the point: a default would be a lie with a timestamp on it.
 *
 * Statuses (states that must never be confused):
 *
 *   OK        we read it and it is fine
 *   PROBLEM   we read it and it is bad          -> solid, shows the value
 *   STALE     we read it, a while ago           -> value dimmed, age explicit
 *   NOT_READ  we could not read it              -> value REMOVED, hatched
 *   EMPTY     we read it and there was nothing  -> distinct from NOT_READ
 *
 * EMPTY matters most: a source returning a valid-but-empty result must be
 * visually distinct from a source returning nothing. A comms DB opened from the wrong CWD is EMPTY and
 * looks exactly like a quiet night unless the two are different objects.
 */

const STATUS = Object.freeze({
  OK: 'OK',
  PROBLEM: 'PROBLEM',
  STALE: 'STALE',
  NOT_READ: 'NOT_READ',
  EMPTY: 'EMPTY',
});

const RENDERED = Object.freeze({
  // NOT_READ is the internal enum; `NOT READ` is what a tired person reads at
  // 2 a.m.
  NOT_READ: 'NOT READ',
});

class FactContractError extends Error {}

/**
 * Build a displayable fact. Throws unless all four fields are present.
 *
 * @param {object} o
 * @param {*}      o.value        the thing to show. May be null ONLY when the
 *                                status is NOT_READ — a missing value with any
 *                                other status is the bug this file exists to
 *                                catch.
 * @param {string} o.source_path  where it came from. A path, a command, or a
 *                                DB URI. Never a sentence, never "derived".
 * @param {number} o.observed_at  epoch ms, stamped BY THE SERVER when the
 *                                underlying read happened — never by a client,
 *                                never at render time.
 * @param {string} o.status       one of STATUS.
 * @param {string} [o.note]       optional plain-words reason. Required in
 *                                practice for PROBLEM and NOT_READ.
 * @param {number} [o.max_age_ms] the threshold this fact was judged against.
 * @param {number} [o.config_mtime] mtime of the config file that supplied it
 *                                (a threshold edited after boot must either
 *                                apply or visibly show it did not).
 */
function fact(o) {
  if (o === null || typeof o !== 'object') {
    throw new FactContractError('fact() takes an object');
  }
  const { value, source_path, observed_at, status } = o;

  if (typeof source_path !== 'string' || source_path.length === 0) {
    throw new FactContractError(
      'fact() requires source_path — a fact with no source is exactly what this wall may not render'
    );
  }
  if (typeof observed_at !== 'number' || !Number.isFinite(observed_at)) {
    throw new FactContractError(
      `fact(${source_path}) requires observed_at as epoch ms, stamped by the server`
    );
  }
  if (!Object.prototype.hasOwnProperty.call(STATUS, status)) {
    throw new FactContractError(
      `fact(${source_path}) requires a status in {${Object.keys(STATUS).join(', ')}}, got ${String(status)}`
    );
  }
  if (!Object.prototype.hasOwnProperty.call(o, 'value')) {
    throw new FactContractError(
      `fact(${source_path}) requires a value key (use null with status NOT_READ)`
    );
  }
  if (value === undefined) {
    throw new FactContractError(
      `fact(${source_path}) value is undefined — say null and NOT_READ, or say what you read`
    );
  }
  if (value === null && status !== STATUS.NOT_READ) {
    throw new FactContractError(
      `fact(${source_path}) has a null value with status ${status} — a missing value is NOT_READ or it is a bug`
    );
  }

  const f = {
    value: status === STATUS.NOT_READ ? null : value,
    source_path,
    observed_at,
    status,
  };
  if (o.note) f.note = String(o.note);
  if (typeof o.max_age_ms === 'number') f.max_age_ms = o.max_age_ms;
  if (typeof o.config_mtime === 'number') f.config_mtime = o.config_mtime;
  return Object.freeze(f);
}

/** A fact we could not read. `why` is shown to the owner, so write it in words. */
function notRead(source_path, why, observed_at) {
  return fact({
    value: null,
    source_path,
    observed_at: typeof observed_at === 'number' ? observed_at : Date.now(),
    status: STATUS.NOT_READ,
    note: why || 'could not read',
  });
}

/**
 * A fact we read successfully, then aged against its threshold.
 *
 * The ladder: fresh -> STALE past max_age_ms -> NOT_READ
 * past `demoteMultiple` x max_age_ms, with the VALUE REMOVED. A value that is
 * merely greyed still reads as a value.
 */
function aged(o, now, maxAgeMs, demoteMultiple, configMtime) {
  const age = now - o.observed_at;
  let status = o.status || STATUS.OK;
  let note = o.note;
  if (status === STATUS.OK || status === STATUS.EMPTY) {
    if (age > maxAgeMs * demoteMultiple) {
      return fact({
        value: null,
        source_path: o.source_path,
        observed_at: o.observed_at,
        status: STATUS.NOT_READ,
        note: `no reading for ${Math.round(age / 1000)}s`,
        max_age_ms: maxAgeMs,
        config_mtime: configMtime,
      });
    }
    if (age > maxAgeMs) {
      status = STATUS.STALE;
      note = note || `last read ${Math.round(age / 1000)}s ago`;
    }
  }
  return fact({
    value: o.value,
    source_path: o.source_path,
    observed_at: o.observed_at,
    status,
    note,
    max_age_ms: maxAgeMs,
    config_mtime: configMtime,
  });
}

/**
 * The rule for aggregates: **an aggregate inherits the weakest input's status.**
 *
 * An aggregate of three read facts and one unread one is unread. Returns the
 * worst status present and the source_paths of every input that went dark, so
 * the wall can name them underneath the number instead of swallowing them.
 */
const WEAKNESS = [STATUS.NOT_READ, STATUS.PROBLEM, STATUS.STALE, STATUS.EMPTY, STATUS.OK];

function weakest(facts) {
  let worst = STATUS.OK;
  const dark = [];
  for (const f of facts) {
    if (f.status === STATUS.NOT_READ) dark.push(f.source_path);
    if (WEAKNESS.indexOf(f.status) < WEAKNESS.indexOf(worst)) worst = f.status;
  }
  return { status: worst, dark };
}

/**
 * Build an aggregate fact from its inputs. There is deliberately no way to
 * build one from a bare number — the inputs travel with it.
 */
function aggregate(o) {
  const inputs = o.inputs || [];
  const { status, dark } = weakest(inputs);
  const f = fact({
    value: status === STATUS.NOT_READ ? null : o.value,
    source_path: o.source_path,
    observed_at: o.observed_at,
    status,
    note: dark.length ? `${dark.length} input(s) not read` : o.note,
  });
  return Object.freeze(Object.assign({}, f, {
    inputs: inputs.map((i) => i.source_path),
    dark,
  }));
}

module.exports = { fact, notRead, aged, aggregate, weakest, STATUS, RENDERED, FactContractError };
