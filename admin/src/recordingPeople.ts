/**
 * The "Record by person" page as data: what GET /admin/recording/people(/:voice) answers, filtering one person's
 * lines, where they left off, what comes next, where a take is sent, and the downloadable script, kept apart from the
 * page so it tests without a browser. A take goes to the same upload route as in the studio (lessons or alphabet) and
 * its timeline is made the same way (voice.ts).
 */
import type { LipsyncData, LipsyncScript, SpeakerId } from '@kurda/shared';
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
  /** The accounts that record this voice (empty for a voice actor, who sees only their own). */
  linked: Array<{ id: string; username: string }>;
}

/** A chapter of the Kurmanji Road, which goes online by itself once its last line is recorded. */
export interface RoadChapter {
  position: number;
  titleKu: string;
  titleEn: string;
  lessons: number;
  published: number;
  /** The story Hamo tells at the chapter's end, which goes online with it; absent from an older server. */
  story?: { slug: string; title: string; online: boolean } | null;
  /** The recordings its lessons and story play, and how many are made. */
  lines: number;
  recorded: number;
  online: boolean;
}

export interface PeopleListing {
  people: Person[];
  /** The voices linked to the account asking. */
  mine: VoiceId[];
  /** The account records only its own voices. */
  ownVoicesOnly: boolean;
  /** The road's chapters in order; absent from a server that does not say. */
  chapters?: RoadChapter[];
}

/** What a chapter's row says about it: online, ready to go, or how much is left. */
export function chapterState(c: Pick<RoadChapter, 'online' | 'lines' | 'recorded'>): { tone: 'ok' | 'info' | 'neutral'; text: string } {
  if (c.online) return { tone: 'ok', text: 'Online' };
  if (c.lines === 0) return { tone: 'neutral', text: 'Nothing to record' };
  const left = c.lines - c.recorded;
  if (left === 0) return { tone: 'info', text: 'Going online' };
  return { tone: 'neutral', text: `${left} ${left === 1 ? 'line' : 'lines'} to go` };
}

export type SourceStatus = 'draft' | 'in_review' | 'published';

export interface LinePlace {
  kind: 'lesson' | 'conversation' | 'story' | 'words' | 'alphabet' | 'game' | 'reaction';
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
  /** A reaction heard all over the app, recorded by its character and id; absent from an older server. */
  reaction?: { character: SpeakerId; id: string; moment: string } | null;
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
  /** One heading's lines (a unit, a story, a word set), or every heading's. */
  section: string | null;
  /** Lines learners meet today, or lines only drafts have so far. */
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

/** The next line still to record after `afterId`, wrapping round; null when every one is recorded. */
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

/** Where a person picks up: their saved line while still to record, else the next to record after it, else the first. */
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
    // A blocked storage only means the next visit starts at the first line to record.
  }
}

/** Where a take of a line is sent: the store the studio files it in, under the same key. */
export function uploadPath(line: Pick<Line, 'store' | 'key' | 'text' | 'conversation' | 'reaction'>): string {
  if (line.store === 'alphabet') return `/admin/alphabet/audio?key=${encodeURIComponent(line.key)}`;
  const part = line.reaction
    ? `&reaction=${encodeURIComponent(`${line.reaction.character}:${line.reaction.id}`)}`
    : line.conversation
      ? `&line=${encodeURIComponent(`${line.conversation.id}:${line.conversation.part}`)}`
      : '';
  return `/admin/lesson-audio?text=${encodeURIComponent(line.text)}${part}`;
}

/**
 * Who a take is saved as said by, and how its timeline is read, as the studio does it: a character's line as that
 * character, a narrator's with no speaker so an editor's choice stays; a letter or word-set word in its clip's script.
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
 * A person's script to rehearse from, as Markdown: every line in course order under its heading, numbered, with its
 * meaning, the line before it, where it is said and whether it is recorded.
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
  // A byte-order mark, so a spreadsheet opens the Kurdish letters as Unicode.
  return `﻿${[head.join(','), ...rows].join('\r\n')}\r\n`;
}

/** A file name for a person's script: "hevalo-script.md". */
export function scriptFileName(voice: VoiceId, kind: 'md' | 'csv'): string {
  return `${voice.replace(/[^a-z0-9-]/g, '-')}-script.${kind}`;
}
