#!/usr/bin/env node
'use strict';

/**
 * install.js — the WilsonWorks Workspace installer: one command from nothing to a Hub, the starter
 * skills and a running office. `node install.js --help` lists the options; bin/install-suite.js
 * holds the parts and states their contract (plan first, --dry-run writes nothing, a second run
 * changes nothing, nothing of yours is overwritten; exit 0 done, 1 failed, 2 refused).
 *
 * This file is only the door. The repo's package.json says "type": "module" (for the page's React
 * sources), so Node loads this file as an ES module; a copy without that line would load it as
 * CommonJS. It works as either: no require(), no import statement, only a dynamic import() of the
 * CommonJS installer, whose answer becomes the exit code.
 */

import('./bin/install-suite.js')
  .then((m) => (m.default || m).main(process.argv.slice(2)))
  .then((code) => { process.exitCode = code; })
  .catch((e) => { process.stderr.write(`FAILED: ${(e && e.stack) || e}\n`); process.exitCode = 1; });
