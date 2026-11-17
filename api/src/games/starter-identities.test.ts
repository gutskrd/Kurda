import { describe, expect, it } from 'vitest';
import { WHO_AM_I_CATEGORIES, WHO_AM_I_FACTS, checkGameContent } from '@kurda/shared';
import { factsTable, identityDrafts, identityLevel, inflectedGloss, wordCardDrafts } from './content-drafts.js';
import { STARTER_IDENTITIES, starterIdentityOf } from './starter-identities.js';
import type { TrustedSources, VocabularyWord } from './sources.js';

const word = (ku: string, en: string): VocabularyWord => ({ key: `w:kmr:${ku.toLowerCase()}`, ku, meanings: { en } });
const sourcesOf = (words: VocabularyWord[]) => ({ vocabulary: async () => words }) as unknown as TrustedSources;

describe('the starter identities’ table', () => {
  it('names only facts the game asks about, and kinds it knows', () => {
    const facts = new Set<string>(WHO_AM_I_FACTS.map((f) => f.key));
    for (const identity of STARTER_IDENTITIES.values()) {
      expect(WHO_AM_I_CATEGORIES).toContain(identity.category);
      for (const fact of identity.yes) expect(facts.has(fact)).toBe(true);
    }
  });

  it('says "sometimes" only where honest people would answer either way, and asks each kind only what makes sense for it', () => {
    expect(STARTER_IDENTITIES.get('dog')).toMatchObject({ sometimes: ['at-home', 'works-outdoors'] });
    expect(STARTER_IDENTITIES.get('horse')).toMatchObject({ sometimes: ['works-outdoors'] });
    expect(STARTER_IDENTITIES.get('lamp')).toMatchObject({ sometimes: ['uses-electricity'] });
    expect(STARTER_IDENTITIES.get('pomegranate')).toMatchObject({ sometimes: ['sweet'] });
    expect(STARTER_IDENTITIES.get('honey')).toMatchObject({ sometimes: ['helps-sick'] });
    expect(STARTER_IDENTITIES.get('tractor')!.yes).toContain('works-outdoors');
    for (const identity of STARTER_IDENTITIES.values()) {
      for (const fact of [...identity.yes, ...identity.sometimes]) expect(identity.asked).toContain(fact);
      expect(identity.yes.some((f) => identity.sometimes.includes(f))).toBe(false);
      // a cat is never asked whether it runs on electricity, nor a teacher whether it is bigger than a person
      if (identity.category === 'animal') expect(identity.asked).not.toContain('uses-electricity');
      if (identity.category === 'profession') expect(identity.asked).not.toContain('bigger-than-person');
      if (identity.category === 'food') expect(identity.asked).not.toContain('works-outdoors');
    }
  });

  it('says of every thing what its kind makes true', () => {
    for (const identity of STARTER_IDENTITIES.values()) {
      if (identity.category === 'animal') expect(identity.yes).toEqual(expect.arrayContaining(['alive', 'animal']));
      if (identity.category === 'profession') expect(identity.yes).toEqual(expect.arrayContaining(['alive', 'person']));
      if (identity.category === 'place') expect(identity.yes).toEqual(expect.arrayContaining(['place', 'bigger-than-person']));
      if (identity.category === 'food') expect(identity.yes).toEqual(expect.arrayContaining(['edible']));
      // nothing is two kinds at once
      expect(identity.yes.includes('animal') && identity.yes.includes('person')).toBe(false);
      expect(identity.yes.includes('place') && identity.yes.includes('alive')).toBe(false);
    }
  });

  it('finds a thing by the meaning its lesson gives first, and never takes a verb for one', () => {
    expect(starterIdentityOf('cat')?.thing).toBe('cat');
    expect(starterIdentityOf('the cat')?.thing).toBe('cat');
    // a flock is no one animal: the ram is the sheep the table knows
    expect(starterIdentityOf('sheep (the flock)')).toBeNull();
    expect(starterIdentityOf('ewe')).toBeNull();
    expect(starterIdentityOf('ram')?.thing).toBe('ram');
    // a nanny raised a family's children and nursed nobody sick, whatever her gloss says first
    expect(starterIdentityOf('nurse')?.thing).toBe('nurse');
    expect(starterIdentityOf('nurse, nanny (a woman who raised the children of a family)')).toBeNull();
    expect(starterIdentityOf('nanny (a woman who raised the children of a family)')).toBeNull();
    expect(starterIdentityOf('city, town')?.thing).toBe('city');
    // the second meaning is not what the word is
    expect(starterIdentityOf('craftsman, builder')).toBeNull();
    expect(starterIdentityOf('to cook')).toBeNull();
    expect(starterIdentityOf('to judge')).toBeNull();
    expect(starterIdentityOf('happiness')).toBeNull();
    expect(starterIdentityOf(undefined)).toBeNull();
  });
});

describe('identities made from the course’s words', () => {
  it('answers every question when it is told nothing of what is asked, yes only where the table says so', () => {
    const table = factsTable(['alive', 'animal', 'four-legs']);
    expect(Object.keys(table).sort()).toEqual(WHO_AM_I_FACTS.map((f) => f.key).sort());
    expect(Object.entries(table).filter(([, v]) => v).map(([k]) => k).sort()).toEqual(['alive', 'animal', 'four-legs']);
  });

  it('answers only what is asked of the thing, with its "sometimes" rows, and leaves the rest unset', () => {
    const table = factsTable(['alive', 'animal'], ['at-home'], ['alive', 'animal', 'person', 'at-home', 'four-legs']);
    expect(table).toEqual({ alive: true, animal: true, person: false, 'four-legs': false, 'at-home': 'sometimes' });
  });

  it('takes no form of a word for the word: a meaning that starts with an article is the form', () => {
    expect(inflectedGloss('the kitchen')).toBe(true);
    expect(inflectedGloss('a bakery')).toBe(true);
    expect(inflectedGloss('An apple')).toBe(true);
    expect(inflectedGloss('kitchen')).toBe(false);
    expect(inflectedGloss('another day')).toBe(false);
    expect(inflectedGloss(undefined)).toBe(false);
  });

  it('makes no card of a form, takes each of the course’s words once, and no word twice for one thing', async () => {
    const drafts = await identityDrafts(
      sourcesOf([word('aşxaneyê', 'the kitchen'), word('aşxane', 'kitchen'), { key: 'w:kmr:aşxane', ku: 'aşxane', meanings: { en: 'kitchen, cooking room' } }, word('dayîn', 'nurse, nanny')]),
      'kmr',
    );
    expect(drafts.map((d) => (d.payload as { word: string }).word)).toEqual(['aşxane']);
  });

  it('makes no Impostor card of a form either', async () => {
    const { cards } = await wordCardDrafts(sourcesOf([word('pisîkê', 'the cat'), word('pisîk', 'cat')]), 'kmr');
    expect(cards.map((c) => (c.payload as { word: string }).word)).not.toContain('pisîkê');
  });

  it('copies the course’s word for each thing once, written small, as a row the game can store', async () => {
    const drafts = await identityDrafts(sourcesOf([word('pisîk', 'cat'), word('Hinar', 'pomegranate'), word('kitik', 'cat'), word('bezîn', 'to run'), word('dil', 'heart')]), 'kmr');
    expect(drafts.map((d) => (d.payload as { word: string }).word)).toEqual(['pisîk', 'hinar']);
    for (const draft of drafts) {
      expect(checkGameContent('identity', 'kmr', draft.payload).ok).toBe(true);
      expect(draft.origin.startsWith('vocabulary:')).toBe(true);
      expect(draft.level).toBeGreaterThanOrEqual(1);
      expect(draft.level).toBeLessThanOrEqual(5);
    }
    expect((drafts[0]!.payload as { category: string; facts: Record<string, boolean> }).category).toBe('animal');
    expect((drafts[0]!.payload as { facts: Record<string, boolean> }).facts).toMatchObject({ alive: true, animal: true, 'four-legs': true, 'at-home': true, edible: false });
    // a cat is asked nothing a cat cannot answer
    expect((drafts[0]!.payload as { facts: Record<string, boolean> }).facts).not.toHaveProperty('sells');
    // and the pomegranate, sweet or sour, says so
    expect((drafts[1]!.payload as { facts: Record<string, unknown> }).facts).toMatchObject({ edible: true, sweet: 'sometimes' });
  });

  it('spreads the things over every level, the same way every time', () => {
    const levels = [...new Set([...STARTER_IDENTITIES.values()].map((i) => i.thing))].map(identityLevel);
    expect(new Set(levels)).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(identityLevel('cat')).toBe(identityLevel('cat'));
  });
});
