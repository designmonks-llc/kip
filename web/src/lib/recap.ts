import type { Capture, Line, Mark, MeetingBundle, Segment } from './db';
import { ownerOf, type LineType } from './parse';

export function fmtTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const fmtDateTime = (ts: number) =>
  new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const byType = (lines: Line[], type: LineType) => lines.filter((l) => l.type === type);

/** Actions grouped by owner, "me" first. */
export function actionsByOwner(lines: Line[]) {
  const groups = new Map<string, Line[]>();
  for (const l of byType(lines, 'action')) {
    const o = ownerOf(l.owners);
    groups.set(o, [...(groups.get(o) ?? []), l]);
  }
  return [...groups.entries()].sort(([a], [b]) => (a === 'me' ? -1 : b === 'me' ? 1 : a.localeCompare(b)));
}

export const ownerName = (o: string) => (o === 'me' ? 'Me' : o[0].toUpperCase() + o.slice(1));

/** "share files @sara" → "share files" when Sara is already named as the owner. */
const withoutMention = (text: string, owner: string) =>
  text.replace(new RegExp(`(^|\\s)@${owner}(?![\\p{L}\\p{N}_-])`, 'giu'), '').replace(/\s+/g, ' ').trim();

/** Transcript around a marked moment (20 s before to 10 s after) plus notes typed within ±30 s. */
export function markContext(mark: Mark, segments: Segment[], lines: Line[]) {
  return {
    segments: segments.filter((s) => s.end >= mark.t - 20_000 && s.start <= mark.t + 10_000),
    lines: lines.filter((l) => Math.abs(l.t - mark.t) <= 30_000),
  };
}

// Highlighting for screen text: money, dates, emails.
const HIGHLIGHT =
  /([$€£৳]\s?\d[\d,.]*\s?[kKmM]?|\d[\d,.]*\s?(?:USD|BDT|EUR|GBP|taka|dollars?)\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{1,2}\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:\s\d{4})?\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s\d{1,2}(?:,?\s\d{4})?\b|[\w.+-]+@[\w-]+\.[\w.]+)/g;

export function splitHighlights(text: string): { text: string; hit: boolean }[] {
  const out: { text: string; hit: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(HIGHLIGHT)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), hit: false });
    out.push({ text: m[0], hit: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out;
}

export function followUp(b: MeetingBundle, yourName: string) {
  const { meeting, client, lines } = b;
  const decisions = byType(lines, 'decision');
  const questions = byType(lines, 'question').filter((l) => !l.answered);
  const actions = actionsByOwner(lines.filter((l) => !l.done));
  // #tags are for you, not for the client.
  const clean = (t: string) => t.replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, '').replace(/\s+/g, ' ').trim();
  const out: string[] = [];
  out.push(`Hi ${client?.name ?? 'all'},`, '', 'Thanks for the time today. Here’s what we covered:');
  if (decisions.length) out.push('', 'Decisions', ...decisions.map((l) => `- ${clean(l.text)}`));
  if (actions.length) {
    out.push('', 'Next steps');
    for (const [o, ls] of actions) for (const l of ls) out.push(`- ${ownerName(o)}: ${clean(withoutMention(l.text, o))}`);
  }
  if (questions.length) out.push('', 'Open questions', ...questions.map((l) => `- ${clean(l.text)}`));
  if (!decisions.length && !actions.length && !questions.length) out.push('', '- (add the key points here)');
  out.push('', 'Best,', yourName || '');
  return {
    subject: `Recap – ${meeting.title} (${fmtDate(meeting.startedAt)})`,
    body: out.join('\n').trimEnd(),
  };
}

const SECTIONS: [LineType, string][] = [
  ['decision', 'Decisions'],
  ['question', 'Open questions'],
  ['money', 'Money'],
  ['quote', 'Their words'],
  ['important', 'Important'],
];

export function toMarkdown(b: MeetingBundle) {
  const { meeting, client, lines, segments, marks, captures } = b;
  const out: string[] = [`# ${meeting.title}`, '', `${fmtDateTime(meeting.startedAt)}${client ? ` · ${client.name}` : ''}`];
  const section = (title: string, rows: string[]) => rows.length && out.push('', `## ${title}`, ...rows);

  section('Decisions', byType(lines, 'decision').map((l) => `- ${l.text}`));
  const actions: string[] = [];
  for (const [o, ls] of actionsByOwner(lines)) for (const l of ls) actions.push(`- [${l.done ? 'x' : ' '}] ${ownerName(o)}: ${l.text}`);
  section('Actions', actions);
  for (const [type, title] of SECTIONS.slice(1)) {
    section(title, byType(lines, type).map((l) => `- ${type === 'question' && l.answered ? '~~' + l.text + '~~' : l.text}`));
  }
  section(
    'Marked moments',
    marks.map((m) => {
      const ctx = markContext(m, segments, lines);
      return `- ★ ${fmtTime(m.t)} — ${ctx.segments.map((s) => s.text).join(' ') || '(no transcript)'}`;
    }),
  );
  section('On screen', captures.map((c: Capture) => `- ${fmtTime(c.t)}: ${c.text.replace(/\s+/g, ' ').slice(0, 400)}`));
  section('Other notes', byType(lines, 'note').map((l) => `- ${l.text}`));
  if (meeting.aiSummary) section('AI summary', [meeting.aiSummary]);
  section('Transcript', segments.map((s) => `- ${fmtTime(s.start)} **${s.speaker === 'you' ? 'You' : 'Them'}:** ${s.text}`));
  return out.join('\n') + '\n';
}
