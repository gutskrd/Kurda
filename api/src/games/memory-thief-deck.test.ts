/**
 * The Memory Thief's word deck without a database: each entry becomes one passage row cut as the game cuts the story,
 * its words checked against the paragraph like glossary terms, and misfits skipped with a reason. The stories are
 * stand-ins.
 */
import { describe, expect, it } from 'vitest';
import { deckOrigin, deckRows, readDeck, type DeckStory, type MemoryThiefDeck } from './memory-thief-deck.js';
import type { StoryPassage } from './sources.js';

const en = (text: string) => ({ en: text, de: text });

const passage = (paragraph: number, text: string, glossary: StoryPassage['glossary'] = []): StoryPassage => ({
  key: `p:kmr:story-1:${paragraph}`,
  storyId: 'story-1',
  title: 'Gund',
  level: 3,
  paragraph,
  text,
  glossary,
});

const stories = new Map<string, DeckStory>([
  [
    'kmr-gund',
    {
      storyId: 'story-1',
      passages: [
        passage(0, 'Gundê me li ber çiyayekî bilind e. Li wir kanîyeke sar û darên gwîzê yên mezin hene.', [{ term: 'mezin', meanings: en('big') }]),
        passage(1, 'Pîrê li ber derî rûniştibû û bi dengekî nerm ji zarokan re got:'),
        passage(2, '«Werin, ez ê çîrokeke kevn ji we re bibêjim, çîroka gurê birçî û karikên biçûk.»'),
      ],
    },
  ],
]);

const deck = (passages: MemoryThiefDeck['passages']): MemoryThiefDeck => ({ passages });

describe('the word deck', () => {
  it('makes a row of a paragraph with its words first, then its own glossary terms', () => {
    const { rows, skipped } = deckRows(
      'kmr',
      deck([{ story: 'kmr-gund', paragraph: 0, opens: 'Gundê me', words: [{ term: 'bilind', meanings: en('high') }, { term: 'sar', meanings: en('cold') }] }]),
      stories,
    );
    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.origin).toBe(deckOrigin('kmr-gund', 0));
    expect(rows[0]!.level).toBe(3);
    const payload = rows[0]!.payload as { text: string; hidden: Array<{ term: string }> };
    expect(payload.text).toBe(stories.get('kmr-gund')!.passages[0]!.text);
    // the deck’s words, then mezin, the paragraph’s own glossary term
    expect(payload.hidden.map((h) => h.term)).toEqual(['bilind', 'sar', 'mezin']);
  });

  it('reads two paragraphs as one where the game does, with the words of both entries', () => {
    const { rows } = deckRows(
      'kmr',
      deck([
        { story: 'kmr-gund', paragraph: 1, opens: 'Pîrê', words: [{ term: 'nerm', meanings: en('soft') }] },
        { story: 'kmr-gund', paragraph: 2, opens: '«Werin', words: [{ term: 'kevn', meanings: en('old') }] },
      ]),
      stories,
    );
    expect(rows.map((r) => r.origin)).toEqual([deckOrigin('kmr-gund', 1)]);
    const payload = rows[0]!.payload as { text: string; hidden: Array<{ term: string }> };
    expect(payload.text.split('\n')).toHaveLength(2);
    expect(payload.hidden.map((h) => h.term)).toEqual(['nerm', 'kevn']);
  });

  it('skips an entry whose story, paragraph or opening words are not there, and a word the paragraph does not hold', () => {
    const { rows, skipped } = deckRows(
      'kmr',
      deck([
        { story: 'kmr-nowhere', paragraph: 0, opens: 'Gund', words: [{ term: 'gund', meanings: en('village') }] },
        { story: 'kmr-gund', paragraph: 9, opens: 'Gund', words: [{ term: 'gund', meanings: en('village') }] },
        { story: 'kmr-gund', paragraph: 0, opens: 'Bajarê me', words: [{ term: 'bilind', meanings: en('high') }] },
      ]),
      stories,
    );
    expect(rows).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(['no-story', 'no-paragraph', 'moved']);

    const words = deckRows(
      'kmr',
      deck([
        {
          story: 'kmr-gund',
          paragraph: 0,
          opens: 'Gundê me',
          words: [
            { term: 'bilind', meanings: en('high') },
            { term: 'Bilind', meanings: en('high') },
            { term: 'bajar', meanings: en('city') },
          ],
        },
      ]),
      stories,
    );
    // Bilind is bilind again, one word once; bajar is not in the paragraph at all
    expect(words.skipped.filter((s) => s.reason === 'not-in-paragraph').map((s) => s.term)).toEqual(['bajar']);
    // bilind and the glossary’s mezin still make the two a row needs
    expect(words.rows).toHaveLength(1);
  });

  it('reads only a file of the right shape', () => {
    expect(readDeck({ passages: [] }).ok).toBe(true);
    expect(readDeck({ passages: [{ story: 'Not A Slug', paragraph: 0, opens: 'x', words: [] }] }).ok).toBe(false);
  });
});
