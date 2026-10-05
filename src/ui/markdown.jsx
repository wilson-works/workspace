// markdown.jsx — a small, safe Markdown renderer for project pages and steps.
// Headings, paragraphs, lists with checkboxes, fenced code (with a Copy button,
// so a prompt in a lesson can be pasted straight into Claude), inline code,
// bold, links and tables. Everything becomes React text and elements: no raw
// HTML passes through, so a step that says <script> shows those characters and
// nothing runs. HTML comments (the template's notes) are left out.

import { useState } from 'react';

const SAFE_LINK = /^(https?:\/\/|mailto:|#)/i;

function inline(text, key) {
  const out = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let at = 0;
  let m;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > at) out.push(text.slice(at, m.index));
    const k = `${key}-${n += 1}`;
    if (m[1]) out.push(<code key={k}>{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{m[2].slice(2, -2)}</strong>);
    else if (SAFE_LINK.test(m[5])) out.push(<a key={k} href={m[5]} target="_blank" rel="noreferrer noopener">{m[4]}</a>);
    else out.push(m[0]);
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

export function parseBlocks(src) {
  const lines = String(src || '').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    const fence = /^\s*(```|~~~)/.exec(line);
    if (fence) {
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) { body.push(lines[i]); i += 1; }
      blocks.push({ type: 'code', text: body.join('\n') });
      i += 1;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { blocks.push({ type: 'heading', level: h[1].length, text: h[2].replace(/\s+#+\s*$/, '') }); i += 1; continue; }
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const head = cells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(cells(lines[i])); i += 1; }
      blocks.push({ type: 'table', head, rows });
      continue;
    }
    if (LIST.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items = [];
      while (i < lines.length && (LIST.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const m = LIST.exec(lines[i]);
        if (m) {
          const box = /^\[( |x|X)\]\s+(.*)$/.exec(m[3]);
          items.push(box ? { text: box[2], checked: box[1] !== ' ', box: true } : { text: m[3], box: false });
        } else {
          items[items.length - 1].text += ` ${lines[i].trim()}`;
        }
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !LIST.test(lines[i]) && !/^(#{1,6})\s/.test(lines[i]) && !/^\s*(```|~~~)/.test(lines[i])
      && !(lines[i].trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1]))) {
      para.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: 'para', text: para.join(' ') });
  }
  return blocks;
}

function CodeBlock({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* no clipboard (an insecure page): the text can still be selected */ }
  };
  return (
    <div className="md-code-wrap">
      <pre className="md-code"><code>{text}</code></pre>
      <button type="button" className="md-copy" onClick={copy} aria-label="copy this block">{copied ? 'Copied' : 'Copy'}</button>
    </div>
  );
}

export default function Markdown({ text }) {
  return (
    <div className="md">
      {parseBlocks(text).map((b, k) => {
        if (b.type === 'code') return <CodeBlock key={k} text={b.text} />;
        if (b.type === 'heading') {
          const H = b.level <= 2 ? 'h3' : 'h4';
          return <H key={k} className="md-h">{inline(b.text, k)}</H>;
        }
        if (b.type === 'table') {
          return (
            <div key={k} className="md-table-wrap">
              <table className="md-table">
                <thead><tr>{b.head.map((c, j) => <th key={j}>{inline(c, `${k}h${j}`)}</th>)}</tr></thead>
                <tbody>{b.rows.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, `${k}r${ri}c${j}`)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
        if (b.type === 'list') {
          const L = b.ordered ? 'ol' : 'ul';
          return (
            <L key={k} className={`md-list ${b.items.some((x) => x.box) ? 'md-checks' : ''}`}>
              {b.items.map((x, j) => (
                <li key={j}>
                  {x.box && <input type="checkbox" checked={x.checked} readOnly disabled aria-label={x.checked ? 'done' : 'not done'} />}
                  <span>{inline(x.text, `${k}l${j}`)}</span>
                </li>
              ))}
            </L>
          );
        }
        return <p key={k} className="md-p">{inline(b.text, k)}</p>;
      })}
    </div>
  );
}
