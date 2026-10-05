// promo-agents.js — Promo 2, the agents (about 50 s): an office of their own in their own colours,
// a door into the dashboard, Louise and Bryn (ours, free), knock for a joke, install ours by name or
// build your own with new-agent, the offer.

import { term } from './helpers';

export default function promoAgents(portrait) {
  const card = portrait ? { frame: 'card' } : {};
  const dashboard = () => (portrait
    ? { frame: 'card', keys: [{ at: 0, box: 'main', pad: 20 }] }
    : { keys: [{ at: 0, box: 'full' }, { at: 0.4, box: 'main', pad: 30 }] });
  return {
    id: portrait ? 'PromoAgents-9x16' : 'PromoAgents-16x9',
    out: portrait ? 'agents-promo-9x16.mp4' : 'agents-promo-16x9.mp4',
    width: portrait ? 1080 : 1920,
    height: portrait ? 1920 : 1080,
    scenes: [
      {
        scene: 'brand', props: { tag: 'Specialist agents, with an office of their own.' },
        lines: [{ text: 'Meet your specialist agents.', s: 3.4 }],
      },
      {
        scene: 'shot',
        props: Object.assign({ shot: 'agents', keys: portrait ? [{ at: 0, box: 'office:louise', pad: 30 }, { at: 'c1', box: 'office:bryn', pad: 30 }] : [{ at: 0, box: ['office:louise', 'office:bryn'], pad: 30, free: true }, { at: 'c1', box: 'office:louise', pad: 16, free: true }] }, card),
        lines: [{ text: 'Each one gets an office in your Workspace.', s: 3.6 }, { text: 'In its own colours, with its name on the door.', s: 3.8 }],
      },
      {
        scene: 'shot',
        props: Object.assign({ shot: 'agents', keys: [{ at: 0, box: 'office:louise', pad: 16, free: !portrait }], taps: [{ at: 1.7, box: 'door:louise' }] }, card),
        lines: [{ text: 'Its door opens its dashboard.', s: 2.5 }],
      },
      {
        scene: 'shot',
        props: Object.assign({ shot: 'louise-dashboard', address: "Louise's dashboard, on DESK", title: 'Louise' }, dashboard()),
        lines: [{ text: 'Louise, the Research Librarian: a source for every fact.', s: 3.8 }],
      },
      {
        scene: 'shot',
        props: Object.assign({ shot: 'bryn-dashboard', address: "Bryn's dashboard, on DESK", title: 'Bryn' }, dashboard()),
        lines: [{ text: 'Bryn, the Trail Guide, helps you think a decision through.', s: 3.8 }],
      },
      {
        scene: 'shot',
        props: Object.assign({
          shot: 'agents',
          keys: [{ at: 0, box: 'office:louise', pad: 16, free: !portrait }],
          taps: [{ at: 1.5, box: 'door:louise', button: 'right' }],
          swaps: [{ at: 2.1, shot: 'agents-knock' }],
        }, card),
        lines: [{ text: 'Knock, and she answers.', s: 5 }],
      },
      term('installAgent', 'Install one of ours by name. Louise and Bryn are free.'),
      {
        scene: 'shot',
        props: Object.assign({ shot: 'agents', keys: [{ at: 0, box: ['office:louise', 'office:bryn'], pad: 24 }] }, card),
        lines: [{ text: '…and they move straight in.', s: 3.2 }],
      },
      term('newAgent', 'Or build your own with new-agent, in your own words.'),
      {
        scene: 'offer', hl: ['paid', 'all'],
        props: { paid: 'Agents built for your work, installed and set up for you.' },
        lines: [{ text: 'Want one built for your work? WilsonWorks can do it.', s: 4.4 }, { text: 'Get in touch.', s: 3.6 }],
      },
    ],
  };
}
