/**
 * Game content made from Kurdish that is already in the course, so that none
 * is typed again: what a set of readers holds, turned into rows a game can be
 * played with. Each maker here only reads and returns; who stores the rows,
 * and as what, is the caller's business.
 *
 *   - the admin panel's importers (content-admin.ts) run these over published
 *     content and store what comes back as drafts for an editor;
 *   - the starter library (starter-library.ts) runs them over the course as it
 *     stands and stores the first set of each game's rows, published.
 *
 * Every row is checked with `checkGameContent` before it is returned, so what
 * a maker gives can be stored as it is, and carries the place it came from
 * (`origin`): the same line, paragraph or word makes the same row every time,
 * and is one row of its kind per variety however often a maker runs.
 */
import {
  PASSAGE_HIDDEN,
  WHO_AM_I_FACTS,
  checkGameContent,
  foldForDialect,
  sentenceShape,
  type GameContentPayload,
  type GameDialect,
  type Meanings,
  type WhoAmIFact,
} from '@kurda/shared';
import { candidatesIn, conversationLevel, conversationWindows } from './memory-thief.js';
import type { TrustedSources } from './sources.js';
import { STARTER_CATEGORIES, starterCategoryOf } from './word-categories.js';
import { starterIdentityOf } from './starter-identities.js';

/** A row ready to store: its level, its checked payload and where it came from. */
export interface ContentDraft {
  level: number;
  payload: GameContentPayload;
  origin: string;
}

/**
 * Lessons' sentences as `sentence` rows, with the English and the orders they
 * accept, on the level their shape gives them.
 */
export async function sentenceDrafts(sources: TrustedSources, dialect: GameDialect, limit = 500): Promise<ContentDraft[]> {
  const drafts: ContentDraft[] = [];
  for (const s of (await sources.lessonSentences(dialect)).slice(0, limit)) {
    const payload = {
      ku: s.ku,
      meanings: s.meaning,
      orders: s.orders.slice(1),
      origin: { type: s.origin.startsWith('conversation') ? 'conversation' : 'lesson', ref: s.origin.split(':').slice(1).join(':') },
    };
    const checked = checkGameContent('sentence', dialect, payload);
    if (checked.ok) drafts.push({ level: sentenceShape(s.ku, s.meaning.en, dialect).level, payload: checked.payload, origin: s.origin });
  }
  return drafts;
}

/**
 * Stories' paragraphs as `passage` rows: the paragraph, and as the words that
 * vanish the glossary terms it holds (two to six), each with the meanings the
 * story's glossary gives it.
 */
export async function passageDrafts(sources: TrustedSources, dialect: GameDialect, limit = 500): Promise<ContentDraft[]> {
  const drafts: ContentDraft[] = [];
  for (const p of (await sources.storyPassages(dialect)).filter((x) => x.glossary.length >= PASSAGE_HIDDEN.min).slice(0, limit)) {
    const hidden = p.glossary
      .filter((g) => typeof g.meanings.en === 'string' && g.meanings.en.trim() !== '')
      .slice(0, PASSAGE_HIDDEN.max)
      .map((g) => ({ term: g.term, meanings: g.meanings as Meanings }));
    const payload = { title: p.title, text: p.text, hidden, origin: { type: 'story', ref: `${p.storyId}:${p.paragraph}` } };
    const checked = checkGameContent('passage', dialect, payload);
    if (checked.ok) drafts.push({ level: Math.min(5, Math.max(1, p.level)), payload: checked.payload, origin: `story:${p.storyId}:${p.paragraph}` });
  }
  return drafts;
}

/**
 * Conversations as `passage` rows, a few lines at a time, as The Memory Thief
 * cuts them: each piece with the words its own lesson teaches as the words
 * that vanish (two to six, each exactly as the piece writes it, with the
 * meaning that lesson gives it). A piece with fewer words to take is no
 * passage.
 */
export async function conversationPassageDrafts(sources: TrustedSources, dialect: GameDialect, limit = 500): Promise<ContentDraft[]> {
  const drafts: ContentDraft[] = [];
  for (const c of await sources.conversationTexts(dialect)) {
    const taught = new Map((c.taught ?? []).map((t) => [t.word, t.meanings]));
    let from = 0;
    for (const size of conversationWindows(c.lines.length)) {
      if (drafts.length >= limit) return drafts;
      const texts = c.lines.slice(from, from + size).map((l) => l.ku);
      const start = from;
      from += size;
      const hidden = candidatesIn(texts, [], taught, dialect)
        .filter((w) => typeof w.meanings?.en === 'string' && w.meanings.en.trim() !== '')
        .slice(0, PASSAGE_HIDDEN.max)
        .map((w) => ({ term: w.term, meanings: w.meanings as Meanings }));
      if (hidden.length < PASSAGE_HIDDEN.min) continue;
      const payload = { ...(c.title ? { title: c.title } : {}), text: texts.join('\n'), hidden, origin: { type: 'conversation', ref: `${c.conversation}:${start}` } };
      const checked = checkGameContent('passage', dialect, payload);
      if (checked.ok) drafts.push({ level: conversationLevel(texts), payload: checked.payload, origin: `conversation:${c.conversation}:${start}` });
    }
  }
  return drafts;
}

/**
 * Impostor's starter cards: each word whose English meaning puts it
 * in a starter category (word-categories.ts) becomes a word card — its word
 * and meaning copied, the category's name as the impostor's hint — and each
 * category used becomes a category row. Filed at level 1. A word that is its
 * category's own name (heywan, in animals) is left out: the hint would be the
 * answer.
 */
export async function wordCardDrafts(sources: TrustedSources, dialect: GameDialect, limit = 500): Promise<{ categories: ContentDraft[]; cards: ContentDraft[] }> {
  const cards: ContentDraft[] = [];
  const used = new Set<string>();
  for (const w of await sources.vocabulary(dialect)) {
    if (cards.length >= limit) break;
    const en = w.meanings.en?.trim();
    const category = starterCategoryOf(en);
    if (!en || !category) continue;
    // the category's own name is the impostor's hint: as a card it would give its word away
    if (foldForDialect(w.ku, dialect, true) === foldForDialect(category.name[dialect], dialect, true)) continue;
    const payload = {
      word: w.ku,
      meanings: { ...w.meanings, en } as Meanings,
      category: category.slug,
      hint: { ku: category.name[dialect], meanings: category.meanings },
      forms: [],
    };
    const checked = checkGameContent('word_card', dialect, payload);
    if (!checked.ok) continue;
    cards.push({ level: 1, payload: checked.payload, origin: `vocabulary:${w.key}` });
    used.add(category.slug);
  }
  const categories = STARTER_CATEGORIES.filter((c) => used.has(c.slug)).flatMap((c) => {
    const checked = checkGameContent('word_category', dialect, { slug: c.slug, ku: c.name[dialect], meanings: c.meanings });
    return checked.ok ? [{ level: 1, payload: checked.payload, origin: `starter-category:${c.slug}` }] : [];
  });
  return { categories, cards };
}

/** A whole facts table from the few that are true of a thing: every other fact is a no. */
export function factsTable(yes: readonly WhoAmIFact[]): Record<WhoAmIFact, boolean> {
  return Object.fromEntries(WHO_AM_I_FACTS.map((f) => [f.key, yes.includes(f.key)])) as Record<WhoAmIFact, boolean>;
}

/**
 * The level a starter identity is filed at. A level only says which
 * difficulty hides the identity (the tiles around it come from every level),
 * and what makes a round harder is how many tiles there are, so the things
 * are spread evenly: every difficulty hides animals, food, objects, jobs and
 * places alike. The spread follows the thing's name, so it is the same on
 * every start.
 */
export function identityLevel(thing: string): number {
  let sum = 0;
  for (const ch of thing) sum = (sum * 31 + ch.codePointAt(0)!) % 9973;
  return 1 + (sum % 5);
}

/**
 * Who Am I?'s starter identities: each word whose English meaning is one of
 * the things the starter table knows (starter-identities.ts) becomes an
 * identity — its word and meaning copied, and the table's answers to every
 * question as its facts. The table holds no Kurdish: which word says "cat" is
 * the course's to say.
 */
export async function identityDrafts(sources: TrustedSources, dialect: GameDialect, limit = 300): Promise<ContentDraft[]> {
  const drafts: ContentDraft[] = [];
  const taken = new Set<string>();
  for (const w of await sources.vocabulary(dialect)) {
    if (drafts.length >= limit) break;
    const en = w.meanings.en?.trim();
    const known = starterIdentityOf(en);
    // one identity for each thing: a second word for "cat" would be a second card with the same answers to every question
    if (!en || !known || taken.has(known.thing)) continue;
    // a thing's name is a common noun: one the course happens to teach at the head of a sentence is written small here
    const payload = { word: w.ku.toLocaleLowerCase('ku'), meanings: { ...w.meanings, en } as Meanings, category: known.category, facts: factsTable(known.yes) };
    const checked = checkGameContent('identity', dialect, payload);
    if (!checked.ok) continue;
    taken.add(known.thing);
    drafts.push({ level: identityLevel(known.thing), payload: checked.payload, origin: `vocabulary:${w.key}` });
  }
  return drafts;
}
