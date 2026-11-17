/**
 * The Memory Thief's word decks (api/content/games/memory-thief) against the
 * stories as their files hold them, cut as the game cuts them: every entry
 * finds its paragraph and every word stands in it as written, each word is
 * one a round may take (three letters or more, not a name) with what it means
 * in every language but its own Kurdish, no passage the decks fill is one the
 * calm check keeps out, and the stories alone now hold enough passages at
 * each difficulty the plan opens. Kurmancî beginner rounds also draw on the
 * lessons' conversations, which only the availability count can see.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_LEVELS,
  MEMORY_HIDDEN,
  fitsDialect,
  foldForDialect,
  gameWords,
  isStoryHeading,
  storyParagraphs,
  type GameDialect,
} from '@kurda/shared';
import { MEMORY_THIEF_DECK_FILES, deckRows, readDeck, type DeckStory } from './memory-thief-deck.js';
import { candidatesIn, isCalmPassage, storyWindows } from './memory-thief.js';
import type { StoryPassage } from './sources.js';

const STORY_FILES = ['kurmanci', 'sorani', 'road', 'legends'] as const;
const LANGUAGES: Readonly<Record<GameDialect, readonly string[]>> = {
  kmr: ['en', 'de', 'es', 'fr', 'nl', 'tr', 'ar', 'ckb'],
  ckb: ['en', 'de', 'es', 'fr', 'nl', 'tr', 'ar', 'ku'],
};
/** The fewest playable story passages each difficulty must reach with the decks (A1-2 of the plan). */
const TARGETS: Readonly<Record<GameDialect, Partial<Record<keyof typeof DIFFICULTY_LEVELS, number>>>> = {
  kmr: { intermediate: 30, advanced: 30 },
  ckb: { beginner: 20, intermediate: 15, advanced: 15 },
};

interface FileStory {
  slug: string;
  dialect: string;
  title: string;
  level: number;
  body: string;
  glossary?: Array<{ term: string; meanings: Record<string, string> }>;
}

/** The stories of a variety as the game reads them, a paragraph at a time with the glossary terms each holds. */
function storiesOf(dialect: GameDialect): Map<string, DeckStory> {
  const out = new Map<string, DeckStory>();
  for (const file of STORY_FILES) {
    const read = JSON.parse(readFileSync(new URL(`../../content/stories/${file}.json`, import.meta.url), 'utf8')) as { stories: FileStory[] };
    for (const s of read.stories) {
      if ((s.dialect === 'sorani' ? 'ckb' : 'kmr') !== dialect) continue;
      const passages: StoryPassage[] = storyParagraphs(s.body).flatMap((text, paragraph) => {
        if (isStoryHeading(text) || !fitsDialect(text, dialect)) return [];
        const words = ` ${gameWords(text).map((w) => foldForDialect(w, dialect)).join(' ')} `;
        const glossary = (s.glossary ?? [])
          .filter((g) => words.includes(` ${gameWords(g.term).map((w) => foldForDialect(w, dialect)).join(' ')} `))
          .map((g) => ({ term: g.term, meanings: g.meanings ?? {} }));
        return [{ key: `${s.slug}:${paragraph}`, storyId: s.slug, title: s.title, level: s.level, paragraph, text, glossary }];
      });
      out.set(s.slug, { storyId: s.slug, passages });
    }
  }
  return out;
}

describe.each(['kmr', 'ckb'] as GameDialect[])('the %s word deck', (dialect) => {
  const read = readDeck(JSON.parse(readFileSync(MEMORY_THIEF_DECK_FILES[dialect], 'utf8')));
  if (!read.ok) throw new Error(read.issues);
  const deck = read.deck;
  const stories = storiesOf(dialect);
  const { rows, skipped } = deckRows(dialect, deck, stories);

  it('finds every entry’s paragraph, and every word in it as written', () => {
    expect(skipped).toEqual([]);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('holds only words a round may take, each with its meaning in every language but its own Kurdish', () => {
    const problems: string[] = [];
    for (const entry of deck.passages) {
      const terms = entry.words.map((w) => foldForDialect(w.term, dialect));
      if (new Set(terms).size !== terms.length) problems.push(`${entry.story}#${entry.paragraph}: a word twice`);
      for (const w of entry.words) {
        if (gameWords(w.term).length !== 1 || [...gameWords(w.term)[0]!].length < 3) problems.push(`${entry.story}#${entry.paragraph}: ${w.term} is not one word of three letters`);
        for (const code of LANGUAGES[dialect]) if (!w.meanings[code]?.trim()) problems.push(`${entry.story}#${entry.paragraph}: ${w.term} has no ${code}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('fills no passage the calm check keeps out of a round', () => {
    for (const row of rows) {
      const lines = (row.payload as { text: string }).text.split('\n');
      expect(isCalmPassage(lines, dialect), row.origin).toBe(true);
    }
  });

  it('brings each difficulty the plan opens up to its share of passages from the stories alone', () => {
    const rowWords = new Map(rows.map((r) => [r.key, (r.payload as { hidden: Array<{ term: string; meanings: Record<string, string> }> }).hidden]));
    const playable: Record<string, number> = {};
    for (const story of stories.values()) {
      for (const w of storyWindows(story.passages)) {
        const words = gameWords(w.lines.join(' ')).length;
        if (words < 12 || words > 90 || !isCalmPassage(w.lines, dialect)) continue;
        const level = Math.min(5, Math.max(1, w.level));
        const difficulty = (Object.keys(DIFFICULTY_LEVELS) as Array<keyof typeof DIFFICULTY_LEVELS>).find((d) => (DIFFICULTY_LEVELS[d] as readonly number[]).includes(level))!;
        const fromRow = rows.find((r) => (r.payload as { text: string }).text === w.lines.join('\n'));
        const glossary = [...(fromRow ? rowWords.get(fromRow.key)! : []), ...w.glossary];
        if (candidatesIn(w.lines, glossary, new Map(), dialect).length >= MEMORY_HIDDEN[difficulty].min) playable[difficulty] = (playable[difficulty] ?? 0) + 1;
      }
    }
    for (const [difficulty, target] of Object.entries(TARGETS[dialect])) expect(playable[difficulty] ?? 0, difficulty).toBeGreaterThanOrEqual(target!);
  });
});
