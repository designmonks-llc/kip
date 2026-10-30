// Shorthand parser: the first character decides the line type (PRD §6).

export type LineType = 'action' | 'decision' | 'question' | 'money' | 'quote' | 'important' | 'note';

const SYMBOLS: Record<string, LineType> = {
  '!': 'action',
  '>': 'decision',
  '?': 'question',
  $: 'money',
  '"': 'quote',
  '“': 'quote',
  '*': 'important',
};

export const TYPE_LABEL: Record<LineType, string> = {
  action: 'Action',
  decision: 'Decision',
  question: 'Question',
  money: 'Money',
  quote: 'Quote',
  important: 'Important',
  note: 'Note',
};

export interface Parsed {
  type: LineType;
  text: string;
  owners: string[];
  tags: string[];
}

const unique = (xs: string[]) => [...new Set(xs)];

export function parseLine(raw: string): Parsed {
  const trimmed = raw.trim();
  const type = SYMBOLS[trimmed[0]] ?? 'note';
  let text = trimmed;
  if (type !== 'note') {
    text = trimmed.slice(1).trim();
    // "$500 budget" keeps its currency sign; "$ budget 4k" drops the marker.
    if (type === 'money' && /^\d/.test(trimmed.slice(1))) text = trimmed;
    if (type === 'quote') text = text.replace(/["”]\s*$/, '').trim();
  }
  const owners = [...text.matchAll(/(?:^|\s)@([\p{L}\p{N}_-]+)/gu)].map((m) => m[1].toLowerCase());
  const tags = [...text.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1].toLowerCase());
  return { type, text, owners: unique(owners), tags: unique(tags) };
}

/** Owner an action belongs to; no @ means it's yours. */
export function ownerOf(owners: string[]): string {
  return owners[0] ?? 'me';
}
