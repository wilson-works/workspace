// AppWindow.jsx — the two places a session is started from, drawn as simple stylised windows (not
// product screenshots): an editor with the Hub open and a Claude Code chat panel, and a desktop chat
// app with the Hub chosen as its folder. A prompt types itself in; when it is sent, the session's
// first reply appears.

import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { C, FONT, MONO, sec } from '../brand';
import { Folder, FileIcon } from './ui';
import { Orb } from './Orb';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

function typed(text, frame, start, cps = 24) {
  const n = Math.max(0, Math.floor(((frame - start) / 30) * cps));
  return text.slice(0, n);
}

const Caret = ({ on }) => <span style={{ display: 'inline-block', width: 3, height: '1em', background: on ? C.accentLight : 'transparent', verticalAlign: 'text-bottom', marginLeft: 2 }} />;

const HUB_ROWS = ['.claude', '00-Inbox', '10-Business', '20-Coding', '30-Media', '40-Personal', '50-AI', '90-Archive'];

/** The chat exchange both windows share: the prompt types, is sent, and the first reply lands. */
function useExchange(prompt, typeAt, sendAt) {
  const frame = useCurrentFrame();
  const text = typed(prompt, frame, typeAt);
  const sent = frame >= sendAt;
  const reply = interpolate(frame, [sendAt + 12, sendAt + 24], [0, 1], clamp);
  return { frame, text, sent, reply, caret: Math.floor(frame / 15) % 2 === 0 };
}

export const EditorWindow = ({ w, h, prompt, typeAt = sec(0.6), sendAt = sec(3.2), reply = 'Reading the Hub map first, then the garden planner.' }) => {
  const x = useExchange(prompt, typeAt, sendAt);
  const side = Math.round(w * 0.2);
  const chat = Math.round(w * 0.34);
  return (
    <div style={{ width: w, height: h, borderRadius: 16, overflow: 'hidden', background: '#17122A', boxShadow: '0 40px 100px rgba(0,0,0,0.55), 0 0 0 2px rgba(224,231,255,0.14)', fontFamily: FONT, color: '#D9D4F0', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 44, background: '#100C1F', display: 'flex', alignItems: 'center', padding: '0 18px', gap: 12, fontSize: 18, color: '#9C94BC' }}>
        <span style={{ fontWeight: 700, color: '#CFC8EE' }}>Hub</span> — code editor
      </div>
      <div style={{ flex: 1, display: 'flex' }}>
        <div style={{ width: 62, background: '#120E22', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, paddingTop: 22 }}>
          {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 28, height: 28, borderRadius: 7, border: '2.5px solid', borderColor: i === 0 ? '#CFC8EE' : '#5B5480' }} />)}
        </div>
        <div style={{ width: side, background: '#1A1530', padding: '18px 0', fontSize: 19 }}>
          <div style={{ padding: '0 22px 12px', fontSize: 14, letterSpacing: '0.14em', color: '#8A82AE' }}>EXPLORER</div>
          <div style={{ padding: '6px 22px', fontWeight: 700, color: '#EDE9FF' }}>HUB</div>
          {HUB_ROWS.map((r) => (
            <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 22px 6px 36px', color: '#CFC8EE' }}>
              <Folder size={20} color="#8B5CF6" /> {r}
            </div>
          ))}
          {['CLAUDE.md', 'NAV.md'].map((r) => (
            <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 22px 6px 38px', color: '#CFC8EE' }}>
              <FileIcon size={18} color="#8A82AE" /> {r}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, background: '#1E1838', padding: '26px 30px', fontFamily: MONO, fontSize: 18, lineHeight: 1.7, color: '#A79FCB' }}>
          <div style={{ color: '#EDE9FF' }}># NAV.md</div>
          <div>| You say            | Claude opens</div>
          <div>| the garden planner | 20-Coding/Projects/garden-planner</div>
          <div>| the bakery website | 20-Coding/Projects/bakery-site</div>
          <div>| anything new       | 00-Inbox</div>
        </div>
        <div style={{ width: chat, background: '#151027', borderLeft: '1.5px solid #2B2448', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', fontSize: 16, letterSpacing: '0.12em', color: '#8A82AE' }}>
            <Orb size={16} /> CLAUDE CODE
          </div>
          <div style={{ flex: 1, padding: '10px 20px', display: 'flex', flexDirection: 'column', gap: 14, fontSize: 20 }}>
            {x.sent && <div style={{ alignSelf: 'flex-end', maxWidth: '88%', background: '#4C1D95', borderRadius: 14, padding: '12px 16px', color: '#F3EEFF' }}>{prompt}</div>}
            {x.sent && <div style={{ opacity: x.reply, color: '#CFC8EE' }}>{reply}</div>}
          </div>
          <div style={{ margin: 18, borderRadius: 14, background: '#1E1838', boxShadow: '0 0 0 1.5px #3B3363', padding: '14px 16px', minHeight: 90, fontSize: 20, color: '#EDE9FF' }}>
            {x.sent ? <span style={{ color: '#6E668F' }}>Ask anything…</span> : <>{x.text}<Caret on={x.caret} /></>}
          </div>
        </div>
      </div>
    </div>
  );
};

export const DesktopAppWindow = ({ w, h, prompt, typeAt = sec(0.6), sendAt = sec(3.2), reply = 'Working in your Hub. Reading the map first.' }) => {
  const x = useExchange(prompt, typeAt, sendAt);
  const side = Math.round(w * 0.22);
  return (
    <div style={{ width: w, height: h, borderRadius: 18, overflow: 'hidden', background: '#FBFAFF', boxShadow: '0 40px 100px rgba(0,0,0,0.55), 0 0 0 2px rgba(224,231,255,0.14)', fontFamily: FONT, color: '#1D1730', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 46, background: '#EFEAFB', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10, fontSize: 18, color: '#5E567C', fontWeight: 600 }}>
        <Orb size={16} /> Claude, desktop app
      </div>
      <div style={{ flex: 1, display: 'flex' }}>
        <div style={{ width: side, background: '#F3EFFC', padding: 20, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 19 }}>
          <div style={{ background: C.accent, color: '#fff', borderRadius: 12, padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>New session</div>
          <div style={{ fontSize: 14, letterSpacing: '0.12em', color: '#8A82AE', marginTop: 10 }}>RECENT</div>
          {['Sort the inbox', 'Bakery menu page', 'Garden planner'].map((r) => <div key={r} style={{ padding: '8px 4px', color: '#4B4466' }}>{r}</div>)}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '34px 46px', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 20, color: '#4B4466' }}>
            <span style={{ fontWeight: 700 }}>Folder</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#fff', boxShadow: '0 0 0 1.5px #DCD4F4', borderRadius: 999, padding: '8px 18px', fontFamily: MONO, fontSize: 19 }}>
              <Folder size={20} color={C.accent} /> Hub
            </span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, fontSize: 22, justifyContent: 'flex-end' }}>
            {x.sent && <div style={{ alignSelf: 'flex-end', maxWidth: '80%', background: '#EDE5FF', borderRadius: 16, padding: '14px 18px' }}>{prompt}</div>}
            {x.sent && <div style={{ opacity: x.reply, color: '#3A3352' }}>{reply}</div>}
          </div>
          <div style={{ borderRadius: 18, background: '#fff', boxShadow: '0 0 0 2px #DCD4F4, 0 10px 30px rgba(76,29,149,0.08)', padding: '18px 22px', minHeight: 96, fontSize: 22 }}>
            {x.sent ? <span style={{ color: '#A59DC0' }}>Reply…</span> : <>{x.text || <span style={{ color: '#A59DC0' }}>What should we work on?</span>}<Caret on={x.caret} /></>}
          </div>
        </div>
      </div>
    </div>
  );
};
