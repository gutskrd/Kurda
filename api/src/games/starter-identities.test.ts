import { describe, expect, it } from 'vitest';
import { WHO_AM_I_CATEGORIES, WHO_AM_I_FACTS, checkGameContent } from '@kurda/shared';
import { factsTable, identityDrafts, identityLevel } from './content-drafts.js';
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
    expect(starterIdentityOf('ewe')?.thing).toBe('sheep');
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
  it('answers every question for every identity, yes only where the table says so', () => {
    const table = factsTable(['alive', 'animal', 'four-legs']);
    expect(Object.keys(table).sort()).toEqual(WHO_AM_I_FACTS.map((f) => f.key).sort());
    expect(Object.entries(table).filter(([, v]) => v).map(([k]) => k).sort()).toEqual(['alive', 'animal', 'four-legs']);
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
  });

  it('spreads the things over every level, the same way every time', () => {
    const levels = [...new Set([...STARTER_IDENTITIES.values()].map((i) => i.thing))].map(identityLevel);
    expect(new Set(levels)).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(identityLevel('cat')).toBe(identityLevel('cat'));
  });
});
