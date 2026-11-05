/**
 * The "Record by person" page as data: what GET /admin/recording/people
 * and /admin/recording/people/:voice answer, how the page filters one
 * person's lines, where it starts (where they left off), which line comes
 * next once a take is kept, where a take is sent and with which speaker, and
 * the script a person can download to rehearse from. Kept apart from the page
 * so it is tested without a browser.
 *
 * A take goes to the upload route the studio uses for its store — the
 * lessons' (`/admin/lesson-audio?text=…`, with `&line=` for a conversation's
 * line) or the alphabet's (`/admin/alphabet/audio?key=…`) — and its timeline
 * is made exactly as the studio makes it (voice.ts): from the words alone for
 * a lesson's text, in the clip's script for a letter or a word-set word.
 */
import type { LipsyncData, LipsyncScript, SpeakerId } from '@kurda/shared';
import { api } from './api';
import type { Speaker } from './voice';

export type VoiceId = string;
export type ScriptDialect = 'kmr' | 'ckb';

export interface Tally {
  total: number;
  done: number;
  todo: number;
}

/** One person who lends a voice, with what is recorded of theirs. */
export interface Person extends Tally {
  id: VoiceId;
  kind: 'character' | 'cast' | 'narrator';
  speaker: SpeakerId | null;
  name: string;
  about: string | null;
  dialect: ScriptDialect | null;
  dialects: Array<Tally & { dialect: ScriptDialect }>;
  /** the accounts that record this voice (empty for a voice actor, who sees only their own) */
  linked: Array<{ id: string; username: string }>;
}

export interface PeopleListing {
  people: Person[];
  /** the voices linked to the account asking */
  mine: VoiceId[];
  /** the account records only its own voices */
  ownVoicesOnly: boolean;
}

export type SourceStatus = 'draft' | 'in_review' | 'published';

export interface LinePlace {
  kind: 'lesson' | 'conversation' | 'story' | 'words' | 'alphabet' | 'game';
  label: string;
  status: SourceStatus;
  voice: VoiceId;
  ref: { page: 'lessons' | 'stories' | 'game-content'; id: string } | null;
}

export interface Take {
  url: string;
  durationMs: number | null;
  updatedAt: string;
  speaker: SpeakerId | null;
  by: string | null;
}

export interface Line {
  id: string;
  seq: number;
  store: 'lesson' | 'alphabet';
  key: string;
  text: string;
  dialect: ScriptDialect;
  voice: VoiceId;
  speaker: SpeakerId | null;
  meaning: string | null;
  hint: string | null;
  cue: string | null;
  conversation: { id: string; part: number; title: string | null; name: string | null } | null;
  before: { name: string | null; text: string; meaning: string | null } | null;
  section: { id: string; label: string };
  places: LinePlace[];
  live: boolean;
  take: Take | null;
}

export interface Section extends Tally {
  id: string;
  label: string;
}

export interface LinesPage {
  person: Person;
  lines: Line[];
  next: string | null;
  total: number;
  sections: Section[];
}

export type StatusFilter = 'todo' | 'done' | 'all';
export type SourceFilter = 'all' | 'published' | 'draft';

export interface Filters {
  status: StatusFilter;
  /** one heading's lines (a unit, a story, a word set), or every heading's */
  section: string | null;
  /** lines learners meet today, or lines only drafts have so far */
  source: SourceFilter;
}

export const DEFAULT_FILTERS: Filters = { status: 'todo', section: null, source: 'all' };

export function isDone(line: Pick<Line, 'take'>): boolean {
  return line.take !== null;
}

export function matchesFilters(line: Line, filters: Filters): boolean {
  if (filters.status === 'todo' && isDone(line)) return false;
  if (filters.status === 'done' && !isDone(line)) return false;
  if (filters.section && line.section.id !== filters.section) return false;
  if (filters.source === 'published' && !line.live) return false;
  if (filters.source === 'draft' && line.live) return false;
  return true;
}

/** What is recorded among `lines`. */
export function tallyOf(lines: readonly Line[]): Tally {
  const done = lines.filter(isDone).length;
  return { total: lines.length, done, todo: lines.length - done };
}

/** The headings `lines` fall under, in order, with what is left under each: the Where filter's choices. */
export function sectionsOf(lines: readonly Line[]): Section[] {
  const out = new Map<string, Section>();
  for (const l of lines) {
    const s = out.get(l.section.id) ?? { ...l.section, total: 0, done: 0, todo: 0 };
    s.total += 1;
    if (isDone(l)) s.done += 1;
    else s.todo += 1;
    out.set(l.section.id, s);
  }
  return [...out.values()];
}

export function counts(lines: readonly Line[], filters: Filters): Record<StatusFilter, number> {
  const rest = lines.filter((l) => matchesFilters(l, { ...filters, status: 'all' }));
  const done = rest.filter(isDone).length;
  return { all: rest.length, done, todo: rest.length - done };
}

/**
 * The next line still to record after `afterId`, in `ordered`'s order,
 * wrapping round: what comes up once a take is kept. Null when every one is
 * recorded.
 */
export function nextTodo(ordered: readonly Line[], afterId: string | null): Line | null {
  const at = afterId ? ordered.findIndex((l) => l.id === afterId) : -1;
  for (let step = 1; step <= ordered.length; step++) {
    const line = ordered[(at + step + ordered.length) % ordered.length]!;
    if (!isDone(line)) return line;
  }
  return null;
}

/** The line `step` away from `id` in `ordered`, staying in bounds. */
export function neighbour(ordered: readonly Line[], id: string | null, step: number): Line | null {
  if (ordered.length === 0) return null;
  const at = id ? ordered.findIndex((l) => l.id === id) : -1;
  if (at === -1) return ordered[0]!;
  return ordered[Math.max(0, Math.min(ordered.length - 1, at + step))]!;
}

/**
 * Where a person picks up: the line they were on, while it is still to
 * record; else the first still to record after it (they kept it, or someone
 * else did); else the first still to record at all; else the first line.
 */
export function resumeAt(ordered: readonly Line[], savedId: string | null): Line | null {
  if (ordered.length === 0) return null;
  const saved = savedId ? ordered.find((l) => l.id === savedId) : undefined;
  if (saved && !isDone(saved)) return saved;
  return nextTodo(ordered, saved ? saved.id : null) ?? ordered[0]!;
}

const RESUME_KEY = 'kurda_admin_record_at';

/** The line a person was last on, in this browser. */
export function savedPlace(voice: VoiceId): string | null {
  try {
    return localStorage.getItem(`${RESUME_KEY}:${voice}`);
  } catch {
    return null;
  }
}

export function savePlace(voice: VoiceId, lineId: string): void {
  try {
    localStorage.setItem(`${RESUME_KEY}:${voice}`, lineId);
  } catch {
    // a blocked storage only means the next visit starts at the first line to record
  }
}

/** Where a take of a line is sent: the store the studio files it in, under the same key. */
export function uploadPath(line: Pick<Line, 'store' | 'key' | 'text' | 'conversation'>): string {
  if (line.store === 'alphabet') return `/admin/alphabet/audio?key=${encodeURIComponent(line.key)}`;
  const part = line.conversation ? `&line=${encodeURIComponent(`${line.conversation.id}:${line.conversation.part}`)}` : '';
  return `/admin/lesson-audio?text=${encodeURIComponent(line.text)}${part}`;
}

/**
 * Who a take is saved as said by, and how its timeline is read: a
 * character's line as that character, as the studio saves a conversation's
 * line; a narrator's without a speaker, so whoever an editor chose for it
 * stays (`undefined`: voice.ts leaves it out). A letter or a word-set word is
 * timed in its clip's script, as the alphabet's studio times it; a lesson's
 * text from its words alone, as the lessons' studio does.
 */
export function uploadVoice(line: Pick<Line, 'store' | 'text' | 'dialect' | 'speaker'>, person: Pick<Person, 'kind'>): { speaker: Speaker | undefined; text: string; script?: LipsyncScript } {
  const speaker = person.kind === 'narrator' ? undefined : line.speaker;
  return line.store === 'alphabet' ? { speaker, text: line.text, script: line.dialect === 'ckb' ? 'arabic' : 'latin' } : { speaker, text: line.text };
}

/** What an upload answers: the lessons' route says when; the alphabet's does not, so it is now. */
export interface Uploaded {
  url: string;
  durationMs: number;
  updatedAt?: string;
  speaker?: SpeakerId | null;
  lipsync?: LipsyncData | null;
}

/** The lines after a take was kept: that line recorded, by this account. */
export function withTake(lines: readonly Line[], id: string, saved: Uploaded, by: string | null, now = new Date()): Line[] {
  return lines.map((l) =>
    l.id === id
      ? { ...l, take: { url: saved.url, durationMs: saved.durationMs, updatedAt: saved.updatedAt ?? now.toISOString(), speaker: saved.speaker ?? null, by } }
      : l,
  );
}

/** Every line of a voice, page by page; `onPage` hears how far it has got. */
export async function loadAllLines(
  voice: VoiceId,
  dialect: ScriptDialect | null,
  onPage?: (sofar: Line[], first: LinesPage) => void,
): Promise<{ lines: Line[]; first: LinesPage }> {
  const lines: Line[] = [];
  let first: LinesPage | null = null;
  let cursor: string | null = null;
  // a few pages of a few hundred lines: a guard against a cursor that never ends
  for (let page = 0; page < 200; page++) {
    const query = new URLSearchParams({ status: 'all', limit: '500' });
    if (dialect) query.set('dialect', dialect);
    if (cursor) query.set('cursor', cursor);
    const res: LinesPage = await api<LinesPage>(`/admin/recording/people/${encodeURIComponent(voice)}?${query.toString()}`);
    first ??= res;
    lines.push(...res.lines);
    onPage?.(lines, first);
    cursor = res.next;
    if (!cursor) break;
  }
  return { lines, first: first! };
}

/** Where a person's script is in the console: #/record/hamo. */
export function personHref(voice: VoiceId): string {
  return `#/record/${encodeURIComponent(voice)}`;
}

const STATUS_WORD: Record<SourceStatus, string> = { draft: 'draft', in_review: 'in review', published: 'published' };

/** "Unit 1 · Lesson 3 · exercise 2 (listening) — draft", for a script or a list row. */
export function placeLine(place: Pick<LinePlace, 'label' | 'status'>): string {
  return place.status === 'published' ? place.label : `${place.label} — ${STATUS_WORD[place.status]}`;
}

const DIALECT_NAME: Record<ScriptDialect, string> = { kmr: 'Kurmancî', ckb: 'Soranî' };

export function dialectName(dialect: ScriptDialect): string {
  return DIALECT_NAME[dialect];
}

/**
 * A person's script, to read from and rehearse: every line in course order
 * under its heading, numbered, each with what it means, the line before it,
 * where it is said, and whether it is recorded yet. Markdown, so it reads
 * as plain text and prints cleanly from any editor.
 */
export function scriptMarkdown(person: Pick<Person, 'name'>, lines: readonly Line[], now = new Date()): string {
  const left = lines.filter((l) => !isDone(l)).length;
  const out = [`# ${person.name}: lines to record`, '', `${lines.length} lines, ${left} still to record. Made ${now.toISOString().slice(0, 10)}.`, ''];
  let section = '';
  lines.forEach((l, i) => {
    if (l.section.id !== section) {
      section = l.section.id;
      out.push(`## ${l.section.label}`, '');
    }
    out.push(`${i + 1}. ${isDone(l) ? '[recorded] ' : ''}**${l.text}**`);
    if (l.meaning) out.push(`   - Means: ${l.meaning}`);
    if (l.before) out.push(`   - Before it: ${l.before.name ? `${l.before.name}: ` : ''}“${l.before.text}”${l.before.meaning ? ` (${l.before.meaning})` : ''}`);
    if (l.hint) out.push(`   - How: ${l.hint}`);
    if (l.cue) out.push(`   - Scene: ${l.cue}`);
    for (const p of l.places) out.push(`   - ${placeLine(p)}`);
    out.push('');
  });
  return out.join('\n');
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The same script as a spreadsheet: one row per line, in course order. */
export function scriptCsv(lines: readonly Line[]): string {
  const head = ['number', 'recorded', 'kurdish', 'meaning', 'line before', 'heading', 'where', 'published', 'key'];
  const rows = lines.map((l, i) =>
    [
      String(i + 1),
      isDone(l) ? 'yes' : 'no',
      l.text,
      l.meaning ?? '',
      l.before ? `${l.before.name ? `${l.before.name}: ` : ''}${l.before.text}` : '',
      l.section.label,
      l.places.map(placeLine).join(' | '),
      l.live ? 'yes' : 'no',
      l.key,
    ]
      .map(csvCell)
      .join(','),
  );
  // a byte-order mark, so a spreadsheet opens the Kurdish letters as Unicode
  return `﻿${[head.join(','), ...rows].join('\r\n')}\r\n`;
}

/** A file name for a person's script: "hevalo-script.md". */
export function scriptFileName(voice: VoiceId, kind: 'md' | 'csv'): string {
  return `${voice.replace(/[^a-z0-9-]/g, '-')}-script.${kind}`;
}

/** Hand the browser a file to save. */
export function saveFile(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
