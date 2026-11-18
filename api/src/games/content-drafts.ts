/**
 * Game content made from Kurdish already in the course, so none is retyped. Each maker only reads and returns rows; the
 * caller decides how to store them:
 * - the admin importers (content-admin.ts) store them as drafts;
 * - the starter library (starter-library.ts) stores each game's first set, published.
 *
 * Every row is checked with `checkGameContent` before it is returned and carries its source (`origin`), so the same
 * line, paragraph or word always makes the same single row per kind and variety.
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
  type WhoAmIFactValue,
} from '@kurda/shared';
import { candidatesIn, conversationLevel, conversationWindows } from './memory-thief.js';
import type { TrustedSources } from './sources.js';
import { STARTER_CATEGORIES, starterCategoryOf } from './word-categories.js';
import { starterIdentityOf } from './starter-identities.js';

/**
 * Whether an English meaning marks an inflected form rather than the word ("the kitchen" for aşxaneyê, "the bakery" for
 * نانەواخانەکە); a card made of it would present the form as the word.
 */
export function inflectedGloss(en: string | undefined): boolean {
  return typeof en === 'string' && /^\s*(the|a|an)\s/i.test(en);
}

/** A row ready to store: its level, its checked payload and where it came from. */
export interface ContentDraft {
  level: number;
  payload: GameContentPayload;
  origin: string;
}

/** Lesson sentences as `sentence` rows with their English and accepted orders, at the level their shape gives. */
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
 * Story paragraphs as `passage` rows: the paragraph, with the glossary terms it holds (two to six) as the vanishing
 * words, each with its glossary meanings.
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
 * Conversations as `passage` rows, a few lines at a time as The Memory Thief cuts them: each piece's vanishing words
 * are those its own lesson teaches (two to six, as written, with that lesson's meaning). A piece with fewer is no
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
 * Impostor's starter cards: each word whose English meaning places it in a starter category (word-categories.ts)
 * becomes a word card (word and meaning copied, category name as hint), and each category used becomes a category row,
 * at level 1. A word that is its category's own name (heywan in animals) is left out, since the hint would be the
 * answer.
 */
export async function wordCardDrafts(sources: TrustedSources, dialect: GameDialect, limit = 500): Promise<{ categories: ContentDraft[]; cards: ContentDraft[] }> {
  const cards: ContentDraft[] = [];
  const used = new Set<string>();
  for (const w of await sources.vocabulary(dialect)) {
    if (cards.length >= limit) break;
    const en = w.meanings.en?.trim();
    // a form of a word ("the kitchen") is no card: the card would show the form as the word
    if (inflectedGloss(en)) continue;
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

/**
 * A facts table from what is true and what is sometimes true of a thing; every other asked fact is a no. `asked` lists
 * the facts its questions make sense for (a cat is never asked whether it sells things); others stay unset so those
 * questions are never dealt with the card. Without it every known fact is answered.
 */
export function factsTable(
  yes: readonly WhoAmIFact[],
  sometimes: readonly WhoAmIFact[] = [],
  asked?: readonly WhoAmIFact[],
): Partial<Record<WhoAmIFact, WhoAmIFactValue>> {
  const keys = asked ? WHO_AM_I_FACTS.filter((f) => asked.includes(f.key) || yes.includes(f.key) || sometimes.includes(f.key)) : WHO_AM_I_FACTS;
  return Object.fromEntries(keys.map((f) => [f.key, sometimes.includes(f.key) ? 'sometimes' : yes.includes(f.key)])) as Partial<Record<WhoAmIFact, WhoAmIFactValue>>;
}

/**
 * The level a starter identity made from course words is filed at (the curated deck, who-am-i-deck.ts, files by
 * teaching unit instead). Level only decides which difficulty hides the identity, and difficulty comes from tile count,
 * so things are spread evenly across difficulties (animals, food, objects, jobs and places alike), keyed on the thing's
 * name so it is stable.
 */
export function identityLevel(thing: string): number {
  let sum = 0;
  for (const ch of thing) sum = (sum * 31 + ch.codePointAt(0)!) % 9973;
  return 1 + (sum % 5);
}

/**
 * Who Am I?'s starter identities: each word whose English meaning is a thing the starter table knows
 * (starter-identities.ts) becomes an identity, with word and meaning copied and the table's answers for its kind as
 * facts. The table holds no Kurdish.
 *
 * Each word is taken once (by the course's key) and each thing once: a word glossed twice is still one word, and a
 * second word for "cat" would duplicate every answer. A meaning naming an inflected form ("the kitchen") makes no card.
 */
export async function identityDrafts(sources: TrustedSources, dialect: GameDialect, limit = 300): Promise<ContentDraft[]> {
  const drafts: ContentDraft[] = [];
  const things = new Set<string>();
  const words = new Set<string>();
  for (const w of await sources.vocabulary(dialect)) {
    if (drafts.length >= limit) break;
    const en = w.meanings.en?.trim();
    if (!en || inflectedGloss(en) || words.has(w.key)) continue;
    const known = starterIdentityOf(en);
    if (!known || things.has(known.thing)) continue;
    // a thing's name is a common noun: one the course happens to teach at the head of a sentence is written small here
    const payload = {
      word: w.ku.toLocaleLowerCase('ku'),
      meanings: { ...w.meanings, en } as Meanings,
      category: known.category,
      facts: factsTable(known.yes, known.sometimes, known.asked),
    };
    const checked = checkGameContent('identity', dialect, payload);
    if (!checked.ok) continue;
    things.add(known.thing);
    words.add(w.key);
    drafts.push({ level: identityLevel(known.thing), payload: checked.payload, origin: `vocabulary:${w.key}` });
  }
  return drafts;
}
