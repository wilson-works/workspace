'use strict';

/**
 * events-archive.js — keeps the hook stream from growing forever.
 *
 * events.jsonl is appended to by every hook in every session on the machine
 * (several MB a day on a busy machine) and nothing else shortens it. The office reads only
 * its newest 3 MB (sources.readEvents), so everything older is history.
 *
 * Past ROTATE_AT bytes:
 *   1. rename events.jsonl -> events.rotating      (hooks start a fresh events.jsonl)
 *   2. append its newest KEEP bytes to events.jsonl (the office keeps its window;
 *      readEvents orders by time, so it does not matter that hooks wrote first)
 *   3. gzip everything older into events-archive/events-<stamp>.jsonl.gz
 *   4. read the archive back and compare it byte for byte (sha256)
 *   5. only then delete events.rotating
 * Copy, verify, then delete. A failure at any step leaves
 * events.rotating on disk and is retried next hour; nothing is lost.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROTATE_AT = 24 * 1024 * 1024;
const KEEP = 3 * 1024 * 1024;

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

function rotateEvents(home, opts) {
  const o = opts || {};
  const limit = o.rotateAt || ROTATE_AT;
  const keep = o.keep || KEEP;
  const live = path.join(home, 'events.jsonl');
  const rotating = path.join(home, 'events.rotating');
  try {
    // A rotation that stopped half way is finished before a new one starts.
    if (!fs.existsSync(rotating)) {
      if (!fs.existsSync(live) || fs.statSync(live).size < limit) return { rotated: false };
      fs.renameSync(live, rotating);
    }
    const all = fs.readFileSync(rotating);
    // Cut on a line boundary so neither half holds half an event.
    let cut = Math.max(0, all.length - keep);
    if (cut > 0) {
      const nl = all.indexOf(0x0a, cut);
      cut = nl < 0 ? all.length : nl + 1;
    }
    const older = all.subarray(0, cut);
    const newer = all.subarray(cut);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(home, 'events-archive');
    fs.mkdirSync(dir, { recursive: true });
    const gz = path.join(dir, `events-${stamp}.jsonl.gz`);
    fs.writeFileSync(gz, zlib.gzipSync(older));
    if (sha(zlib.gunzipSync(fs.readFileSync(gz))) !== sha(older)) {
      fs.unlinkSync(gz);
      return { rotated: false, error: 'archive did not read back identical; kept events.rotating' };
    }
    if (newer.length) fs.appendFileSync(live, newer);
    fs.unlinkSync(rotating);
    return { rotated: true, archived_bytes: older.length, kept_bytes: newer.length, archive: gz };
  } catch (e) {
    return { rotated: false, error: e.message };
  }
}

module.exports = { rotateEvents, ROTATE_AT, KEEP };
