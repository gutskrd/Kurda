/**
 * The Memory Thief's word deck (api/content/games/memory-thief/kmr.json and ckb.json): hand-chosen words for story
 * paragraphs, so paragraphs with a thin or missing glossary still have words to lose and intermediate and advanced
 * rounds have passages.
 *
 * Each entry names a story by slug, a paragraph by position, the paragraph's first words (`opens`), and the words as
 * the paragraph writes them with their meaning there. If the paragraph no longer starts with `opens`, the story was
 * edited and the entry is skipped and logged. Words not in the paragraph exactly as written, names, and too-short words
 * are skipped and logged likewise.
 *
 * An entry becomes one published `passage` row: the paragraph as currently published (with the next one where the game
 * reads both: `storyWindows`), hidden words being the deck's then the glossary's, two to six in all. Since its text is
 * the story's, the game treats row and paragraph as one passage. The row's `origin` is `deck:memory-thief:<slug>:<n>`;
 * it follows its file until a person changes it (`updated_by`), an untouched row whose entry is gone is archived, and a
 * row an editor deleted stays gone (`content_seeds`).
 *
 * The starter library once copied story paragraphs and lesson conversations into passage rows. The game reads both
 * directly now, so untouched copies are duplicates or stale and are archived; a copy of content the game does not read
 * yet (a lesson still in draft) is kept.
 *
 * Nothing here throws: a broken file must not stop the API.
 */
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import { GAME_DIALECTS, PASSAGE_HIDDEN, checkGameContent, foldForDialect, gameWords, storySpelling, type GameDialect, type Meanings } from '@kurda/shared';
import type { Cache } from '../cache/cache.js';
import { bustAvailability } from './availability.js';
import { candidatesIn, conversationWindows, passageKey, storyWindows } from './memory-thief.js';
import { TrustedSources, bustGamePools, type StoryPassage } from './sources.js';

export const MEMORY_THIEF_DECK_FILES: Readonly<Record<GameDialect, URL>> = {
  kmr: new URL('../../content/games/memory-thief/kmr.json', import.meta.url),
  ckb: new URL('../../content/games/memory-thief/ckb.json', import.meta.url),
};

/** Where a deck row is filed: the story and the first paragraph of the passage. */
export const deckOrigin = (slug: string, paragraph: number): string => `deck:memory-thief:${slug}:${paragraph}`;
const seedName = (dialect: GameDialect, origin: string): string => `game_content:${dialect}:${origin}`;

const deckFileSchema = z.object({
  passages: z.array(
    z.object({
      story: z.string().regex(/^[a-z0-9-]{2,60}$/),
      paragraph: z.number().int().min(0),
      opens: z.string().trim().min(1),
      words: z.array(z.object({ term: z.string().trim().min(1), meanings: z.record(z.string(), z.string()) })).min(1),
    }),
  ),
});
export type MemoryThiefDeck = z.infer<typeof deckFileSchema>;
export type DeckEntry = MemoryThiefDeck['passages'][number];

/** Read a deck file: its entries, or what is wrong with it. */
export function readDeck(raw: unknown): { ok: true; deck: MemoryThiefDeck } | { ok: false; issues: string } {
  const parsed = deckFileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  return { ok: true, deck: parsed.data };
}

/** A published story of the variety, a paragraph at a time, as the game reads it. */
export interface DeckStory {
  storyId: string;
  passages: StoryPassage[];
}

/** One row the deck makes, ready to write. */
export interface DeckRow {
  origin: string;
  level: number;
  payload: unknown;
  /** the passage's key, as the game keys it */
  key: string;
}

/** Why an entry or a word of it was not used. */
export interface DeckSkip {
  story: string;
  paragraph: number;
  term?: string;
  reason: 'no-story' | 'no-paragraph' | 'moved' | 'not-in-paragraph' | 'too-few' | 'invalid';
}

/**
 * The rows a deck makes against the published stories (pure, for tests and content checks): each entry's passage cut as
 * the game cuts it, its words checked like glossary terms (`candidatesIn`), and what was skipped, with why.
 */
export function deckRows(dialect: GameDialect, deck: MemoryThiefDeck, stories: ReadonlyMap<string, DeckStory>): { rows: DeckRow[]; skipped: DeckSkip[] } {
  const skipped: DeckSkip[] = [];
  const byOrigin = new Map<string, { row: Omit<DeckRow, 'payload'>; title: string; lines: string[]; storyId: string; words: DeckEntry['words']; glossary: StoryPassage['glossary'] }>();
  for (const entry of deck.passages) {
    const story = stories.get(entry.story);
    if (!story) {
      skipped.push({ story: entry.story, paragraph: entry.paragraph, reason: 'no-story' });
      continue;
    }
    const own = story.passages.find((p) => p.paragraph === entry.paragraph);
    if (!own) {
      skipped.push({ story: entry.story, paragraph: entry.paragraph, reason: 'no-paragraph' });
      continue;
    }
    if (!own.text.normalize('NFC').startsWith(entry.opens.normalize('NFC').trim())) {
      skipped.push({ story: entry.story, paragraph: entry.paragraph, reason: 'moved' });
      continue;
    }
    const window = storyWindows(story.passages).find((w) => w.paragraphs.includes(entry.paragraph))!;
    const origin = deckOrigin(entry.story, window.paragraphs[0]!);
    const had = byOrigin.get(origin);
    if (had) {
      // two entries for the two paragraphs the game reads as one: one row, the words of both
      had.words.push(...entry.words);
      continue;
    }
    byOrigin.set(origin, {
      row: { origin, level: Math.min(5, Math.max(1, own.level)), key: passageKey(dialect, window.lines) },
      title: own.title,
      lines: window.lines,
      storyId: story.storyId,
      words: [...entry.words],
      glossary: window.glossary,
    });
  }
  const rows: DeckRow[] = [];
  for (const [origin, r] of byOrigin) {
    const [slug, paragraph] = [origin.split(':')[2]!, Number(origin.split(':')[3])];
    const wordsWanted = r.words.map((w) => ({ term: w.term, meanings: w.meanings as Partial<Meanings> }));
    // each deck word checked as a glossary term is: in the passage exactly as written, not a name, long enough, with a meaning
    const fromDeck = candidatesIn(r.lines, wordsWanted, new Map(), dialect);
    const kept = new Set(fromDeck.map((c) => foldForDialect(c.term, dialect)));
    for (const w of r.words) if (!kept.has(foldForDialect(w.term, dialect))) skipped.push({ story: slug, paragraph, term: w.term, reason: 'not-in-paragraph' });
    // then the paragraph's own glossary, one-word terms only, none the deck already has
    const fromGlossary = candidatesIn(r.lines, r.glossary, new Map(), dialect).filter((c) => !kept.has(foldForDialect(c.term, dialect)));
    const hidden = [...fromDeck, ...fromGlossary]
      .filter((c) => typeof c.meanings.en === 'string' && c.meanings.en.trim() !== '' && gameWords(c.term).length === 1)
      .slice(0, PASSAGE_HIDDEN.max)
      .map((c) => ({ term: c.term, meanings: c.meanings as Meanings }));
    if (hidden.length < PASSAGE_HIDDEN.min) {
      skipped.push({ story: slug, paragraph, reason: 'too-few' });
      continue;
    }
    const payload = { title: r.title, text: r.lines.join('\n'), hidden, origin: { type: 'story', ref: `${r.storyId}:${paragraph}` } };
    const checked = checkGameContent('passage', dialect, payload);
    if (!checked.ok) {
      skipped.push({ story: slug, paragraph, reason: 'invalid' });
      continue;
    }
    rows.push({ ...r.row, payload: checked.payload });
  }
  return { rows, skipped };
}

/** The published stories a deck names, as the game reads them (`storyPassages`), by slug. */
async function deckStories(pool: pg.Pool, sources: TrustedSources, dialect: GameDialect, slugs: readonly string[]): Promise<Map<string, DeckStory>> {
  const res = await pool.query<{ id: string; slug: string }>(`SELECT id, slug FROM stories WHERE dialect = $1 AND slug = ANY($2::text[])`, [
    storySpelling(dialect),
    slugs,
  ]);
  const passages = await sources.storyPassages(dialect);
  const out = new Map<string, DeckStory>();
  for (const s of res.rows) {
    const own = passages.filter((p) => p.storyId === s.id);
    if (own.length > 0) out.set(s.slug, { storyId: s.id, passages: own });
  }
  return out;
}

/** Every passage key the game would read from stories and conversations with these sources. */
async function readKeys(sources: TrustedSources, dialect: GameDialect): Promise<Set<string>> {
  const [stories, conversations] = await Promise.all([sources.storyPassages(dialect), sources.conversationTexts(dialect)]);
  const keys = new Set<string>();
  for (const w of storyWindows(stories)) {
    keys.add(passageKey(dialect, w.lines));
    // a paragraph read alone too, for a copy made before two paragraphs were read together
    for (const p of stories.filter((x) => x.storyId === w.storyId && w.paragraphs.includes(x.paragraph))) keys.add(passageKey(dialect, [p.text]));
  }
  for (const c of conversations) {
    let from = 0;
    for (const size of conversationWindows(c.lines.length)) {
      keys.add(passageKey(dialect, c.lines.slice(from, from + size).map((l) => l.ku)));
      from += size;
    }
  }
  return keys;
}

/** The lines of a passage row, as the game splits them. */
const rowLines = (text: string): string[] =>
  text
    .split(/\n+/u)
    .map((l) => l.trim())
    .filter((l) => l !== '');

export interface DeckSeedResult {
  dialect: GameDialect;
  seeded: string[];
  refreshed: string[];
  archived: string[];
  /** the starter library's copies put away: duplicates of what the game reads, and lines the course no longer has */
  copiesArchived: number;
  skipped: DeckSkip[];
}

export async function seedMemoryThiefDeck(
  pool: pg.Pool,
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>,
  cache: Cache | null = null,
  files: Readonly<Partial<Record<GameDialect, URL>>> = MEMORY_THIEF_DECK_FILES,
): Promise<DeckSeedResult[]> {
  const results: DeckSeedResult[] = [];
  let changed = false;
  // the stories and the course as they are now, read afresh: nothing a game keeps is read or filled here
  const published = new TrustedSources(pool, null);
  const course = new TrustedSources(pool, null, Date.now, 'course');
  for (const dialect of GAME_DIALECTS) {
    const file = files[dialect];
    if (!file) continue;
    const result: DeckSeedResult = { dialect, seeded: [], refreshed: [], archived: [], copiesArchived: 0, skipped: [] };
    try {
      let read: ReturnType<typeof readDeck>;
      try {
        read = readDeck(JSON.parse(await readFile(file, 'utf8')));
      } catch (err) {
        log.warn({ err, file: file.pathname }, 'memory thief deck could not be read; skipped');
        continue;
      }
      if (!read.ok) {
        log.warn({ file: file.pathname, issues: read.issues.slice(0, 600) }, 'memory thief deck is not readable; skipped');
        continue;
      }
      const stories = await deckStories(pool, published, dialect, [...new Set(read.deck.passages.map((p) => p.story))]);
      const { rows, skipped } = deckRows(dialect, read.deck, stories);
      result.skipped = skipped;
      if (skipped.length > 0) log.info({ dialect, skipped: skipped.slice(0, 20), count: skipped.length }, 'memory thief deck entries or words skipped');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const marks = await client.query<{ name: string }>(`SELECT name FROM content_seeds WHERE name = ANY($1::text[])`, [rows.map((r) => seedName(dialect, r.origin))]);
        const marked = new Set(marks.rows.map((m) => m.name));
        for (const row of rows) {
          const found = await client.query<{ id: string; payload: unknown; level: number; status: string }>(
            `SELECT id, payload, level, status FROM game_content WHERE kind = 'passage' AND dialect = $1 AND origin = $2 AND updated_by IS NULL FOR UPDATE`,
            [dialect, row.origin],
          );
          const have = found.rows[0];
          if (!have) {
            // a row an editor deleted, or took over, stays theirs
            if (marked.has(seedName(dialect, row.origin))) continue;
            const made = await client.query(
              `INSERT INTO game_content (kind, dialect, level, payload, source, origin, status, review_status, reviewed_at, published_at)
               VALUES ('passage', $1, $2, $3::jsonb, 'starter', $4, 'published', 'approved', now(), now())
               ON CONFLICT (kind, dialect, origin) WHERE origin IS NOT NULL DO NOTHING`,
              [dialect, row.level, JSON.stringify(row.payload), row.origin],
            );
            await client.query(`INSERT INTO content_seeds (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [seedName(dialect, row.origin)]);
            if ((made.rowCount ?? 0) > 0) result.seeded.push(row.origin);
            continue;
          }
          if (have.level !== row.level || stable(have.payload) !== stable(row.payload) || have.status !== 'published') {
            await client.query(
              `UPDATE game_content
                  SET payload = $2::jsonb, level = $3, status = 'published', review_status = 'approved',
                      reviewed_at = COALESCE(reviewed_at, now()), published_at = COALESCE(published_at, now()), lock_version = lock_version + 1
                WHERE id = $1`,
              [have.id, JSON.stringify(row.payload), row.level],
            );
            result.refreshed.push(row.origin);
          }
        }
        // an untouched deck row whose entry is gone, or no longer fits its story
        const gone = await client.query<{ origin: string }>(
          `UPDATE game_content SET status = 'archived', lock_version = lock_version + 1
            WHERE kind = 'passage' AND dialect = $1 AND origin LIKE 'deck:memory-thief:%' AND NOT (origin = ANY($2::text[]))
              AND updated_by IS NULL AND status <> 'archived'
           RETURNING origin`,
          [dialect, rows.map((r) => r.origin)],
        );
        result.archived = gone.rows.map((r) => r.origin);

        // the starter library's untouched copies: a duplicate of what the game reads, or a line the course no longer has
        const [live, inCourse] = await Promise.all([readKeys(published, dialect), readKeys(course, dialect)]);
        const copies = await client.query<{ id: string; payload: { text?: unknown } }>(
          `SELECT id, payload FROM game_content
            WHERE kind = 'passage' AND dialect = $1 AND source = 'starter' AND origin NOT LIKE 'deck:%' AND status = 'published'
              AND lock_version = 0 AND updated_by IS NULL AND reviewed_by IS NULL`,
          [dialect],
        );
        const away = copies.rows
          .filter((c) => {
            if (typeof c.payload.text !== 'string') return false;
            const key = passageKey(dialect, rowLines(c.payload.text));
            return live.has(key) || !inCourse.has(key);
          })
          .map((c) => c.id);
        if (away.length > 0) {
          const res = await client.query(`UPDATE game_content SET status = 'archived', lock_version = lock_version + 1 WHERE id = ANY($1::uuid[])`, [away]);
          result.copiesArchived = res.rowCount ?? 0;
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
      if (result.seeded.length + result.refreshed.length + result.archived.length + result.copiesArchived > 0) {
        changed = true;
        log.info(
          { dialect, seeded: result.seeded.length, refreshed: result.refreshed.length, archived: result.archived.length, copiesArchived: result.copiesArchived },
          'memory thief deck brought up to its file',
        );
      }
      results.push(result);
    } catch (err) {
      log.warn({ err, dialect }, 'memory thief deck could not be seeded');
    }
  }
  if (changed) await Promise.all([bustGamePools(cache), bustAvailability(cache)]).catch(() => undefined);
  return results;
}

/** A value as text with its keys in order, so a row read back from jsonb compares equal to what made it. */
function stable(value: unknown): string {
  const sorted = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sorted)
      : v !== null && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, sorted(x)]),
          )
        : v;
  return JSON.stringify(sorted(value));
}
