'use strict';

/**
 * figure.js — draws an assistant's door figure and mark in the house style of Kody and Louise: the
 * collectible vinyl-toy model (a rounded-square head bigger than the small body, big cartoon eyes with
 * catch-lights, a soft shadow under the feet, one arm holding a clipboard in its crook, the other
 * waving). The shapes and the palette are theirs; only the choices below change. Node built-ins only.
 *
 *   figureSvg({ key, name, skin, hair, outfit, glasses })  the 200x220 door figure (art.svg)
 *   markSvg({ key, name, outfit })                        the 64x64 door sign (mark.svg)
 *
 * skin: a key of SKIN; hair: a key of HAIR; outfit: a key of OUTFIT; glasses: true or false.
 * Every id is scoped to the agent's key, so two figures on one page never clash. The wave stops
 * under prefers-reduced-motion; the still pose is the resting wave.
 */

// Kody's and Louise's skin, plus three more tones on the same three-step ramp (base, shadow, light).
const SKIN = {
  fair: { base: '#F3D2B8', shadow: '#DDB096', light: '#F8DECA', label: 'fair' },
  light: { base: '#E9BE9F', shadow: '#D29C7E', light: '#F1C9AC', label: 'light (Louise)' },
  medium: { base: '#D9A27A', shadow: '#BF865F', light: '#E3B38F', label: 'medium' },
  brown: { base: '#B97850', shadow: '#9A5F3C', light: '#C68B62', label: 'brown' },
  deep: { base: '#7A4B30', shadow: '#5E3622', light: '#8C5A3C', label: 'deep' },
};

const HAIR = {
  short: { label: 'short' },
  bun: { label: 'swept with a bun (like Louise)' },
  curly: { label: 'curly' },
};

const HAIR_COLOUR = { base: '#2A1E17', light: '#3F2F26' }; // Kody's hair and its highlight, for every style

// Outfits: Kody's navy and Louise's bottle green, then four more in the same main / shadow / light steps.
// accent is the brighter tone the agent's room and dashboard are painted from (agent.json brand).
const OUTFIT = {
  navy: { main: '#23345C', shadow: '#14213D', light: '#2E4370', accent: '#5B7FCC', label: 'navy' },
  green: { main: '#2F5A45', shadow: '#24473A', light: '#3E7259', accent: '#4FA37A', label: 'bottle green (Louise)' },
  burgundy: { main: '#6E2A26', shadow: '#4E1C1A', light: '#8A3A33', accent: '#C2554B', label: 'burgundy' },
  teal: { main: '#2F6F73', shadow: '#1F5155', light: '#3F8A8E', accent: '#3FA7AC', label: 'teal' },
  plum: { main: '#4A3358', shadow: '#33223F', light: '#5E4470', accent: '#9A6BC0', label: 'plum' },
  charcoal: { main: '#3A3F4A', shadow: '#262A33', light: '#4C5260', accent: '#8A93A6', label: 'charcoal' },
};

const HEAD = 'M82 22H118A34 34 0 0 1 152 56V88A30 30 0 0 1 122 118H78A30 30 0 0 1 48 88V56A34 34 0 0 1 82 22Z';
const BRASS = { base: '#C9A24A', light: '#E3C277', shadow: '#9E7B2F' };

const pick = (table, k, d) => table[k] || table[d];
const esc = (s) => require('./agents').xmlEscape(s);
const idFor = (key) => `ea-${String(key || 'assistant').replace(/[^a-z0-9-]/g, '')}`;

/** Kody's mitt hand: a palm, three fingers and a thumb, in skin and its shadow. */
function hand(transform, s) {
  const parts = '<ellipse cy="1.500" rx="8.400" ry="7.600"/><ellipse cx="-4.900" cy="-7.200" rx="2.900" ry="5.100" transform="rotate(-10 -4.900 -7.200)"/><ellipse cx="0" cy="-8.600" rx="2.900" ry="5.400"/><ellipse cx="4.900" cy="-7.200" rx="2.900" ry="5.100" transform="rotate(10 4.900 -7.200)"/><ellipse cx="-9" cy="2.500" rx="3.500" ry="5" transform="rotate(-30 -9 2.500)"/>';
  return `<g transform="${transform}"><g fill="${s.shadow}">${parts}</g><g fill="${s.base}" transform="translate(-1.100 -1.100)">${parts}</g></g>`;
}

/** A sleeve: the shadow stroke and the lit stroke over it. */
const sleeve = (d, o, w) => `<path d="${d}" stroke="${o.shadow}" stroke-width="${w}"/><path transform="translate(-1.200 -1)" d="${d}" stroke="${o.main}" stroke-width="${w - 3.5}"/>`;

function eye(id, cx, s) {
  return `<g><ellipse cx="${cx}" cy="78" rx="12.500" ry="13.500" fill="#FFFDF7"/><g clip-path="url(#${id}-e${cx})"><g transform="translate(${cx} 80.5)"><circle r="10" fill="#5A3420"/><path d="M-8.200 5.700A10 10 0 0 0 8.200 5.700A26 26 0 0 1 -8.200 5.700Z" fill="#8A5A36"/><circle r="5.400" fill="#1E130C"/><circle cx="-3.600" cy="-3.400" r="3" fill="#FFF"/><circle cx="3.300" cy="3.200" r="1.400" fill="#FFF"/></g><path d="M${cx - 14} 62H${cx + 14}V67Q${cx} 71.500 ${cx - 14} 67Z" fill="${s.base}"/></g><ellipse cx="${cx}" cy="78" rx="12.500" ry="13.500" fill="none" stroke="#2A1D14" stroke-width="1.400" opacity=".35"/></g>`;
}

/** The hair behind the head (a bun, curls or Kody's crown), then the cap over it, clipped to the head. */
function hairBack(style, h) {
  if (style === 'bun') {
    return `<circle cx="110" cy="19" r="17" fill="${h.base}"/><circle cx="106" cy="15" r="9" fill="${h.light}" opacity=".6"/>`;
  }
  const crown = style === 'curly'
    ? [[58, 40, 11], [66, 28, 12], [80, 19, 12.5], [96, 15, 13], [112, 16, 12.5], [127, 21, 12], [139, 31, 11], [146, 44, 10], [54, 54, 9]]
    : [[66, 31, 10], [80, 23, 10.5], [96, 19.5, 11], [112, 20.5, 10.5], [127, 25, 10], [139, 34, 9]];
  return `<g fill="${h.base}">${crown.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g><g fill="${h.light}"><circle cx="78" cy="21" r="5"/><circle cx="94" cy="17" r="5.500"/><circle cx="110" cy="18" r="5"/></g>`;
}

function hairCap(id, style, h) {
  const cap = style === 'bun'
    ? 'M36 6H164V90C158 99 146 98 142 90C141 80 143 68 141 58C137 62 126 62 122 47C118 58 104 58 98 46C94 62 76 64 62 54C58 66 62 82 60 90C56 99 42 99 36 90Z'
    : 'M36 6H164V66C158 64 155 56 151 50C146 44 138 41 129 43C120 45 110 41 100 41C90 41 80 45 71 43C62 41 54 44 49 50C45 56 42 64 36 66Z';
  const lit = style === 'bun'
    ? `<path transform="translate(-2.500 -3)" d="${cap}" fill="${h.light}" opacity=".5"/>`
    : `<path d="M47 56C46 64 46 72 48 79L53.500 77C52.500 69 52.500 61 55 53Z" fill="${h.base}" opacity=".55"/><path d="M153 56C154 64 154 72 152 79L146.500 77C147.500 69 147.500 61 145 53Z" fill="${h.base}" opacity=".55"/>`;
  return `<g clip-path="url(#${id}-hc)"><path d="${cap}" fill="${h.base}"/>${lit}<path d="M62 36C68 29 80 26 96 26" fill="none" stroke="#FFF" stroke-width="4" stroke-linecap="round" opacity=".12"/></g>`;
}

/** Louise's square frames, laid over the eyes: tint, one glare per lens, the frame and its bridge. */
const GLASSES = '<g fill="#A9E4F2" fill-opacity=".12"><rect x="57" y="58" width="38" height="34" rx="6"/><rect x="105" y="58" width="38" height="34" rx="6"/></g><g fill="#FFF" opacity=".35"><path d="M60 73L73 60H80L60 80Z"/><path d="M108 73L121 60H128L108 80Z"/></g><g fill="none" stroke="#5A3A22" stroke-width="5" stroke-linecap="round"><rect x="57" y="58" width="38" height="34" rx="6"/><rect x="105" y="58" width="38" height="34" rx="6"/><path d="M95.500 69Q100 65.500 104.500 69" stroke-width="5.500"/><path d="M54.500 66H49M145.500 66H151" stroke-width="4.400"/></g>';

/** Kody's clipboard: cognac board, brass clip, a cream sheet with three ticks in the outfit's tone. */
function clipboard(o) {
  return `<g transform="rotate(-6 88 152)"><rect x="75" y="136" width="28" height="34" rx="3" fill="#7A4A2A"/><rect x="73.500" y="134.500" width="28" height="34" rx="3" fill="#9A6338"/><rect x="77" y="141" width="21" height="25" rx="1.500" fill="#FBF6EA"/><rect x="81.500" y="131.500" width="12" height="6" rx="2" fill="${BRASS.base}"/><rect x="81.500" y="131.500" width="12" height="2.200" rx="1.100" fill="${BRASS.light}"/><g fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="${o.accent}" stroke-width="1.700"><path d="M79 146.500L80.500 148L83 145"/><path d="M79 153L80.500 154.500L83 151.500"/><path d="M79 159.500L80.500 161L83 158"/></g><g stroke="#B9AE98" stroke-width="1.600"><path d="M85.500 147H95"/><path d="M85.500 153.500H93"/><path d="M85.500 160H95"/></g></g></g>`;
}

function figureSvg(opts) {
  const o = opts || {};
  const id = idFor(o.key);
  const s = pick(SKIN, o.skin, 'medium');
  const style = HAIR[o.hair] ? o.hair : 'short';
  const h = HAIR_COLOUR;
  const f = pick(OUTFIT, o.outfit, 'navy');
  const name = esc(o.name || 'Your assistant');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220" id="${id}" class="${id}" role="img" aria-labelledby="${id}-title">
<title id="${id}-title">${name} waving hello from the doorway, a clipboard in the crook of the arm</title>
<!-- Drawn by agents/lib/figure.js on Kody's and Louise's character model. Edit the choices, not the shapes. -->
<style>
#${id} .${id}-wave{transform-box:view-box;transform-origin:158px 138px;animation:${id}-wave 2.4s ease-in-out infinite}
@keyframes ${id}-wave{0%,100%{transform:rotate(0deg)}20%{transform:rotate(-10deg)}40%{transform:rotate(6deg)}60%{transform:rotate(-9deg)}80%{transform:rotate(3deg)}}
@media (prefers-reduced-motion: reduce){#${id} *{animation:none !important}}
</style>
<defs><clipPath id="${id}-hc"><path d="${HEAD}"/></clipPath><clipPath id="${id}-e78"><ellipse cx="78" cy="78" rx="12.500" ry="13.500"/></clipPath><clipPath id="${id}-e122"><ellipse cx="122" cy="78" rx="12.500" ry="13.500"/></clipPath><radialGradient id="${id}-skin" cx=".38" cy=".42" r=".75"><stop offset="0" stop-color="${s.light}"/><stop offset="1" stop-color="${s.base}"/></radialGradient></defs>
<ellipse cx="100" cy="207" rx="50" ry="6" fill="#2A1D14" opacity=".26"/>
<g><path d="M77 158H123L121 197H104L100 176L96 197H79Z" fill="${f.shadow}"/><g fill="#3B2416"><ellipse cx="88" cy="201.500" rx="12" ry="6.500"/><ellipse cx="112" cy="201.500" rx="12" ry="6.500"/></g><g fill="#FFF" opacity=".5"><ellipse cx="83" cy="198.500" rx="3" ry="1.600"/><ellipse cx="107" cy="198.500" rx="3" ry="1.600"/></g><path d="M80 114H120C127 114 130 119 130 126L133 162Q133 170 125 170H75Q67 170 67 162L70 126C70 119 73 114 80 114Z" fill="${f.main}"/><path d="M75 122C71 132 71 146 70 162Q70 168 76 168H80Q78 144 82 120Z" fill="${f.light}"/><path d="M118 116Q130 118 130 128L133 162Q133 170 125 170H114Q120 146 118 116Z" fill="${f.shadow}"/><path d="M91 115H109L100 142Z" fill="#FFFFFF"/><path d="M100 132L104 121L100 142Z" fill="#DCE1EA"/><g fill="${f.shadow}"><path d="M89 115L100 142L95 147L85 124Z"/><path d="M111 115L100 142L105 147L115 124Z"/></g><g fill="${BRASS.base}"><circle cx="100" cy="153" r="2.600"/><circle cx="100" cy="162" r="2.200"/></g><circle cx="89" cy="131" r="2.600" fill="${f.accent}"/></g>
<g>${style === 'bun' ? '' : hairBack(style, h)}<g><ellipse cx="49" cy="84" rx="7.500" ry="9.500" fill="${s.shadow}"/><ellipse cx="151" cy="84" rx="7.500" ry="9.500" fill="${s.shadow}"/></g><path d="${HEAD}" fill="${s.shadow}"/><g clip-path="url(#${id}-hc)"><path transform="translate(-3 -3.500)" d="${HEAD}" fill="url(#${id}-skin)"/></g><g fill="#D9785F" opacity=".35"><ellipse cx="63" cy="95" rx="7.500" ry="4.200"/><ellipse cx="137" cy="95" rx="7.500" ry="4.200"/></g><ellipse cx="100" cy="93" rx="3.400" ry="2.400" fill="${s.shadow}"/><path d="M88 102Q100 113 112 102" fill="none" stroke="#5C2620" stroke-width="2.600" stroke-linecap="round"/>${eye(id, 78, s)}${eye(id, 122, s)}<g fill="none" stroke="${h.base}" stroke-width="5" stroke-linecap="round"><path d="M65 56Q77 50 90 54"/><path d="M110 54Q123 50 135 56"/></g>${hairCap(id, style, h)}${o.glasses ? GLASSES : ''}<path d="${HEAD}" fill="none" stroke="#2A1D14" stroke-width="1.600" opacity=".35"/>${style === 'bun' ? hairBack(style, h) : ''}</g>
<g stroke-linecap="round" stroke-linejoin="round" fill="none">
${sleeve('M76 130L69 160', f, 14)}
${clipboard(f)}
${sleeve('M69 161L88 162', f, 13)}
${hand('translate(95 156) rotate(-8) scale(-1.100 1.100)', s)}
${sleeve('M124 130L158 138', f, 14)}
<g class="${id}-wave">
${sleeve('M158 138L174 114', f, 13)}
<path d="M170.800 118.800L174 114" stroke="#FFFFFF" stroke-width="14.500" stroke-linecap="butt"/>
${hand('translate(177.500 103) rotate(20) scale(1.200)', s)}
</g>
</g>
</svg>
`;
}

/** Kody's seal: a rounded square in the outfit's colour, a lit plane, two brass hairlines, the initial, a small diamond. */
function markSvg(opts) {
  const o = opts || {};
  const id = `${idFor(o.key)}-mark`;
  const f = pick(OUTFIT, o.outfit, 'navy');
  const initial = esc(((/[A-Za-z0-9]/.exec(String(o.name || '')) || ['A'])[0]).toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${esc(o.name || 'Assistant')}">
<defs><clipPath id="${id}-cl"><rect x="1" y="1" width="62" height="62" rx="14"/></clipPath></defs>
<rect x="1" y="1" width="62" height="62" rx="14" fill="${f.shadow}"/>
<path d="M0 0H64V10L10 64H0Z" fill="${f.main}" clip-path="url(#${id}-cl)"/>
<rect x="5.500" y="5.500" width="53" height="53" rx="10" fill="none" stroke="${BRASS.base}" stroke-width="1.200"/>
<rect x="8.200" y="8.200" width="47.600" height="47.600" rx="7.600" fill="none" stroke="${BRASS.shadow}" stroke-width="1.200"/>
<text x="32.900" y="43.100" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="30" font-weight="700" fill="${BRASS.shadow}">${initial}</text>
<text x="32" y="42" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="30" font-weight="700" fill="${BRASS.base}">${initial}</text>
<path d="M32 49.200L34.400 51.800L32 54.400L29.600 51.800Z" fill="${f.accent}"/>
</svg>
`;
}

module.exports = { SKIN, HAIR, OUTFIT, figureSvg, markSvg };
