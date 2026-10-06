// promo-workspace.js — Promo 1, the Workspace (about 50 s): the Hub, the starter skills, the office
// floor, the phone, the Agents' wing, and the offer. Short headline captions.

export default function promoWorkspace(portrait) {
  return {
    id: portrait ? 'PromoWorkspace-9x16' : 'PromoWorkspace-16x9',
    out: portrait ? 'workspace-promo-9x16.mp4' : 'workspace-promo-16x9.mp4',
    width: portrait ? 1080 : 1920,
    height: portrait ? 1920 : 1080,
    scenes: [
      {
        scene: 'brand', props: { tag: 'The Hub, the skills and the office, for Claude Code.' },
        lines: [{ text: 'Everything you do with Claude, in one place.', s: 3.8 }],
      },
      {
        scene: 'zones', props: { compact: true }, hl: [null, 'all'],
        lines: [{ text: 'One Hub holds all your work.', s: 3.2 }, { text: 'The same folders on every computer.', s: 3.2 }],
      },
      {
        scene: 'nav', hl: [[0, 1], 'rule'],
        lines: [{ text: 'Claude finds its way with a plain-English map.', s: 3.6 }, { text: 'It follows the map. It never digs through everything.', s: 3.6 }],
      },
      {
        scene: 'skills', props: { limit: portrait ? 8 : 9 },
        lines: [{ text: 'Starter skills, ready on day one.', s: 3.8 }],
      },
      portrait
        ? {
          scene: 'shot',
          props: { shot: 'floor-all', frame: 'card', keys: [{ at: 0, box: 'desk:Cedar', pad: 16 }, { at: 'c1', box: 'desk:Rowan', pad: 16 }] },
          lines: [{ text: 'Every session is a person at a desk.', s: 3.6 }, { text: 'See what each one is doing, live.', s: 3.6 }],
        }
        : {
          scene: 'shot',
          props: {
            shot: 'floor-all',
            keys: [{ at: 0, box: 'full' }, { at: 'c1', box: 'room:garden planner@DESK', pad: 24 }],
            marks: [{ from: 'c1+1', to: 'c1+3.4', box: 'desk:Cedar' }],
          },
          lines: [{ text: 'Every session is a person at a desk.', s: 3.6 }, { text: 'See what each one is doing, live.', s: 3.8 }],
        },
      {
        scene: 'phone', props: { shot: 'phone-floor', swaps: [{ at: 'c1', shot: 'phone-questions' }], beside: portrait ? null : 'floor-all', besideAddress: 'on DESK' },
        lines: [{ text: 'Check in from your phone.', s: 3 }, { text: 'Answer their questions in one tap.', s: 3.2 }],
      },
      {
        scene: 'shot',
        props: portrait
          ? { shot: 'agents', frame: 'card', keys: [{ at: 0, box: 'office:louise', pad: 20 }, { at: 'c1', box: 'office:bryn', pad: 20 }] }
          : { shot: 'agents', keys: [{ at: 0, box: ['office:louise', 'office:bryn'], pad: 30, free: true }] },
        lines: [{ text: 'Specialist agents get an office of their own.', s: 3.8 }, { text: 'Louise and Bryn are ours, and free to install.', s: 3.6 }],
      },
      {
        scene: 'offer', hl: ['free', 'paid', 'all'],
        lines: [
          { text: 'Free to set up yourself.', s: 3.4 },
          { text: 'Or have WilsonWorks set it up, with agents built for you.', s: 4.4 },
          { text: 'Get in touch.', s: 3.6 },
        ],
      },
    ],
  };
}
