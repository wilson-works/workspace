// cards.jsx — the scenes without a screenshot or diagram: the promo opener (the orb and the
// wordmark), a walkthrough's title card, a chapter card, and the offer at the end.

import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { C, FONT, MONO } from '../brand';
import { Area, useHighlight, useLayout } from '../components/Area';
import { Card, Rise, useSpring } from '../components/ui';
import { Orb } from '../components/Orb';
import { REPO_URL } from '../data/world';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

const Wordmark = ({ size }) => (
  <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: size, letterSpacing: '-0.03em', color: C.white, lineHeight: 1 }}>
    WilsonWorks <span style={{ color: C.accentLight }}>Workspace</span>
  </div>
);

/** The promo opener: the orb arrives, the wordmark follows, then one line. */
export const BrandOpen = ({ tag }) => {
  const L = useLayout();
  const s = useSpring(0, { damping: 14 });
  const f = useCurrentFrame();
  const word = interpolate(f, [10, 24], [0, 1], clamp);
  return (
    <Area column style={{ gap: L.portrait ? 50 : 44 }}>
      <div style={{ transform: `scale(${0.4 + s * 0.6})`, opacity: s }}><Orb size={L.portrait ? 260 : 220} glow /></div>
      <div style={{ opacity: word, transform: `translateY(${(1 - word) * 30}px)`, textAlign: 'center' }}>
        <Wordmark size={L.portrait ? 92 : 104} />
        {tag && <div style={{ fontSize: L.portrait ? 40 : 40, color: C.text2, marginTop: 26, fontFamily: FONT, fontWeight: 500 }}>{tag}</div>}
      </div>
    </Area>
  );
};

/** A walkthrough's title card. */
export const TitleCard = ({ kicker, title, sub }) => {
  const L = useLayout();
  const s = useSpring(0, { damping: 16 });
  return (
    <Area column style={{ gap: 34 }}>
      <div style={{ transform: `scale(${0.6 + s * 0.4})`, opacity: s }}><Orb size={L.portrait ? 180 : 150} glow /></div>
      <Rise at={6}><div style={{ fontFamily: MONO, fontSize: 28, letterSpacing: '0.2em', color: C.text3, textTransform: 'uppercase', textAlign: 'center' }}>{kicker}</div></Rise>
      <Rise at={10}><div style={{ fontFamily: FONT, fontWeight: 800, fontSize: L.portrait ? 110 : 130, letterSpacing: '-0.035em', color: C.white, textAlign: 'center', lineHeight: 1 }}>{title}</div></Rise>
      {sub && <Rise at={16}><div style={{ fontFamily: FONT, fontSize: 40, color: C.text2, textAlign: 'center' }}>{sub}</div></Rise>}
    </Area>
  );
};

/** A chapter card inside a walkthrough. */
export const ChapterCard = ({ n, name }) => {
  const L = useLayout();
  const s = useSpring(0, { damping: 18 });
  return (
    <Area column style={{ gap: 22 }}>
      <div style={{ fontFamily: MONO, fontSize: L.portrait ? 160 : 180, fontWeight: 600, color: C.accentLight, opacity: s, transform: `translateY(${(1 - s) * 40}px)`, lineHeight: 1 }}>{String(n).padStart(2, '0')}</div>
      <Rise at={8}><div style={{ fontFamily: FONT, fontWeight: 800, fontSize: L.portrait ? 96 : 110, letterSpacing: '-0.03em', color: C.white, textAlign: 'center' }}>{name}</div></Rise>
    </Area>
  );
};

/** The offer: free to set up yourself; done-for-you setup and specialist agents through WilsonWorks. hl: 'free', 'paid', 'all'. */
export const Offer = ({ cues, hl, paid = 'Done-for-you setup, and specialist agents built for your work.' }) => {
  const L = useLayout();
  const { lit, any } = useHighlight(cues, hl);
  const panel = (key, kicker, head, body, foot, i) => (
    <Rise at={6 + i * 8}>
      <Card lit={lit(key) || lit('all')} style={{ width: L.portrait ? 940 : 760, minHeight: L.portrait ? 0 : 400, padding: L.portrait ? '34px 40px' : '46px 50px', opacity: any && !(lit(key) || lit('all')) ? 0.45 : 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 26, letterSpacing: '0.18em', color: C.accentLight }}>{kicker}</div>
        <div style={{ fontSize: L.portrait ? 54 : 58, fontWeight: 800, letterSpacing: '-0.02em' }}>{head}</div>
        <div style={{ fontSize: L.portrait ? 32 : 34, color: C.text2, lineHeight: 1.3 }}>{body}</div>
        <div style={{ marginTop: 'auto', paddingTop: 12 }}>{foot}</div>
      </Card>
    </Rise>
  );
  return (
    <Area column style={{ gap: L.portrait ? 30 : 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <Orb size={L.portrait ? 70 : 64} glow />
        <Wordmark size={L.portrait ? 54 : 56} />
      </div>
      <div style={{ display: 'flex', flexDirection: L.portrait ? 'column' : 'row', gap: L.portrait ? 26 : 40 }}>
        {panel('free', 'FREE', 'Set it up yourself', 'The Hub, the starter skills and the office. Open to everyone.',
          <span style={{ fontFamily: MONO, fontSize: L.portrait ? 32 : 32, color: C.white, fontWeight: 600 }}>{REPO_URL}</span>, 0)}
        {panel('paid', 'FROM WILSONWORKS', 'Or have it done', paid,
          <span style={{ display: 'inline-block', background: C.accent, color: C.white, fontWeight: 800, fontSize: 36, borderRadius: 999, padding: '16px 40px', boxShadow: '0 12px 40px rgba(124,58,237,0.5)' }}>Get in touch</span>, 1)}
      </div>
    </Area>
  );
};
