/**
 * The road's own word list: every Kurdish word form its lessons show, with what it means there and, for an inflected
 * form, the word it comes from. Lessons look a word up here before the dictionary, since the dictionary knows headwords
 * while a sentence is mostly endings, inflected forms and little words. Read once, on first use. The Kurdish the lessons
 * show is read here too, for the check that keeps the list complete.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { letterKey } from '@kurda/shared';

const ROAD_DIR = new URL('../../content/lessons/road/', import.meta.url);
export const ROAD_GLOSSARY_FILE = new URL('glossary.json', ROAD_DIR);

/** One word form: its meanings as the road uses it (likeliest first), and the word it is a form of, when it is one. */
export interface GlossaryEntry {
  en: string[];
  base?: string;
}

export interface Glossary {
  /** The variety of Kurdish the list is for (`kurmanji`). */
  dialect: string;
  /** By `glossaryKey`. */
  words: ReadonlyMap<string, GlossaryEntry>;
}

/** What a word is filed under: its letters, lowercase, diacritics kept ("ser" and "şer" are different words). */
export const glossaryKey = (word: string): string => letterKey(word);

interface GlossaryFile {
  dialect: string;
  words: Record<string, { en?: unknown; base?: unknown }>;
}

/** The list in a file, checked as it is read: an entry needs at least one meaning, and every meaning is text. */
export function parseGlossary(raw: unknown): Glossary {
  const file = raw as GlossaryFile;
  if (!file || typeof file.dialect !== 'string' || !file.words || typeof file.words !== 'object') throw new Error('glossary: needs a dialect and words');
  const words = new Map<string, GlossaryEntry>();
  for (const [form, entry] of Object.entries(file.words)) {
    const en = Array.isArray(entry.en) ? entry.en.filter((m): m is string => typeof m === 'string' && m.trim() !== '').map((m) => m.trim()) : [];
    if (en.length === 0) throw new Error(`glossary: "${form}" has no meaning`);
    const base = typeof entry.base === 'string' && entry.base.trim() !== '' ? entry.base.trim() : undefined;
    words.set(glossaryKey(form), base && glossaryKey(base) !== glossaryKey(form) ? { en, base } : { en });
  }
  return { dialect: file.dialect, words };
}

let read: Glossary | null = null;

/** The road's list, read once; an empty list where the file is not there (a checkout without content). */
export function roadGlossary(): Glossary {
  if (!read) read = existsSync(ROAD_GLOSSARY_FILE) ? parseGlossary(JSON.parse(readFileSync(ROAD_GLOSSARY_FILE, 'utf8'))) : { dialect: 'kurmanji', words: new Map() };
  return read;
}

type Fields = Record<string, unknown>;

const fields = (value: unknown): Fields => (value && typeof value === 'object' ? (value as Fields) : {});
const one = (value: unknown): string[] => (typeof value === 'string' && value.trim() !== '' ? [value] : []);
const all = (value: unknown): string[] => (Array.isArray(value) ? value.flatMap(one) : []);

/** The multiple-choice asks whose line is Kurdish, and those whose options are. */
const KURDISH_PROMPT = new Set(['meaning', 'picture', 'missing', 'reply']);
const KURDISH_OPTIONS = new Set(['missing', 'reply', 'choose-kurdish']);

/** The Kurdish an exercise puts on screen: what is said, the line, Kurdish options, answers and cards, and its new words. */
export function kurdishShown(type: string, payload: unknown): string[] {
  const p = fields(payload);
  const out = [...one(p.say), ...(Array.isArray(p.new) ? p.new.flatMap((w) => one(fields(w).ku)) : [])];
  switch (type) {
    case 'multiple_choice':
      if (KURDISH_PROMPT.has(String(p.ask))) out.push(...one(p.prompt));
      if (KURDISH_OPTIONS.has(String(p.ask))) out.push(...all(p.options));
      break;
    case 'translate':
      out.push(...(p.ask === 'to-english' ? one(p.prompt) : all(p.accepted)));
      break;
    case 'speaking':
      out.push(...one(p.prompt), ...one(p.reference));
      break;
    case 'listening':
      out.push(...all(p.accepted));
      break;
    case 'writing':
      out.push(...all(p.accepted), ...(p.ask === 'missing' ? one(p.prompt) : []));
      break;
    case 'match_pairs':
      if (Array.isArray(p.pairs)) out.push(...p.pairs.flatMap((pair) => one(fields(pair).left)));
      break;
    case 'conversation':
      out.push(...one(p.title), ...(Array.isArray(p.lines) ? p.lines.flatMap((line) => one(fields(line).text)) : []));
      break;
  }
  return out;
}

/** A unit file, as far as its exercises go. */
interface UnitFile {
  units?: Array<{ skills?: Array<{ lessons?: Array<{ exercises?: Array<{ type: string; payload: unknown }> }> }> }>;
}

/** Every Kurdish text the road's lessons show, unit by unit in course order, so a check can hold each word to the list. */
export function roadKurdishTexts(): string[] {
  const files = existsSync(ROAD_DIR) ? readdirSync(ROAD_DIR).filter((f) => /^unit-\d{2}\.json$/.test(f)).sort() : [];
  return files.flatMap((file) => {
    const doc = JSON.parse(readFileSync(new URL(file, ROAD_DIR), 'utf8')) as UnitFile;
    const exercises = (doc.units ?? []).flatMap((u) => u.skills ?? []).flatMap((s) => s.lessons ?? []).flatMap((l) => l.exercises ?? []);
    return exercises.flatMap((e) => kurdishShown(e.type, e.payload));
  });
}
