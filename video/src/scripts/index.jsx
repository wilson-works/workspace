// scripts/index.js — every video, as the list of its caption scripts. Root.jsx registers one
// composition per entry; tools/captions.js prints every line from here for the release scan.

import promoWorkspace from './promo-workspace';
import promoAgents from './promo-agents';
import walkthrough1 from './walkthrough-1';
import walkthrough2 from './walkthrough-2';
import walkthrough3 from './walkthrough-3';

export const VIDEOS = [
  promoWorkspace(false),
  promoWorkspace(true),
  promoAgents(false),
  promoAgents(true),
  walkthrough1,
  walkthrough2,
  walkthrough3,
];
