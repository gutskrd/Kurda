/**
 * The starter riddles and proverbs (api/content/games/riddles.json and
 * proverbs.json): every entry the files hold is checked here the way the
 * seeding checks it, so an entry a reviewer edits, or one added later, is
 * caught in CI rather than skipped with a warning at start-up. Each is held
 * to what the collections promise: its Kurdish in its variety, a source for
 * anything presented as traditional, and a translation into every other app
 * language.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { translationLocales, type LoreKind } from '@kurda/shared';
import { STARTER_LORE_FILES, starterLore } from './starters.js';

const read = (kind: LoreKind): unknown => JSON.parse(readFileSync(STARTER_LORE_FILES[kind], 'utf8'));

describe('the starter files', () => {
  for (const kind of ['riddle', 'proverb'] as const) {
    it(`hold ${kind === 'riddle' ? 'riddles' : 'proverbs'} that are each ready for review, translated into every other language`, () => {
      const out = starterLore(kind, read(kind));
      expect('unreadable' in out ? out.unreadable : null).toBeNull();
      if ('unreadable' in out) return;
      for (const e of out.entries) {
        expect(e.ok ? [] : e.issues, e.slug).toEqual([]);
        if (!e.ok) continue;
        expect(e.translations.map((t) => t.locale).sort(), e.slug).toEqual([...translationLocales(e.dialect)].sort());
        expect(e.slug.startsWith(`${e.dialect}-`), e.slug).toBe(true);
      }
      const slugs = out.entries.map((e) => e.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });
  }
});

describe('reading a starter entry', () => {
  // stand-in Kurdish for the fixtures, never shown to a learner
  const entry = {
    slug: 'kmr-sample',
    dialect: 'kmr',
    difficulty: 'medium',
    category: 'nature',
    tradition: 'new',
    region: null,
    question: 'Çi ye ku tim dimeşe?',
    hints: ['Saet wê dipîve.'],
    answer: 'Dem',
    accepted: ['dem', 'wext'],
    explanation: 'Dem qet nasekine.',
    translations: { en: { question: 'What always walks?', hints: ['A clock measures it.'], answer: 'Time', explanation: 'Time never stops.' } },
    sources: [{ title: 'Written for the app', url: '', note: null }],
    notes: 'Check the verb.',
  };

  it('leaves out what the file left empty, keeps the reviewers’ note, and files a riddle at its difficulty’s level', () => {
    const out = starterLore('riddle', { riddles: [entry] });
    if ('unreadable' in out) throw new Error(out.unreadable);
    const [e] = out.entries;
    expect(e).toMatchObject({ ok: true, slug: 'kmr-sample', dialect: 'kmr', level: 3 });
    if (!e?.ok) return;
    expect(e.payload).toMatchObject({ notes: 'Check the verb.', sources: [{ title: 'Written for the app' }] });
    expect(e.payload).not.toHaveProperty('region');
    expect(e.translations).toEqual([{ locale: 'en', payload: entry.translations.en }]);
  });

  it('is held back whole when one of its translations is wrong', () => {
    const out = starterLore('riddle', { riddles: [{ ...entry, translations: { ...entry.translations, ku: entry.translations.en } }] });
    if ('unreadable' in out) throw new Error(out.unreadable);
    expect(out.entries[0]).toMatchObject({ ok: false, slug: 'kmr-sample' });
  });

  it('says a file of the wrong shape is unreadable', () => {
    expect(starterLore('proverb', { riddles: [] })).toHaveProperty('unreadable');
  });
});
