// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminGameContent, GameWordCandidate } from '@kurda/shared';
import { fakeApi, json, on } from '../test/fetch';
import { button, choose, click, render, settle, text } from '../test/dom';
import { withKit } from '../test/render';
import { GameContent } from './GameContent';

/**
 * Who Am I? identities made by picking approved words, and the editors for
 * them and for question templates: the Kurdish is copied by
 * the server and read only here, an identity needs its category and four
 * facts, and a question is new Kurdish that waits for a native speaker.
 */

const ID = '7d1f0f6a-3b9a-4c55-8f0b-0c3c0bde0002';

// stand-in Kurdish for the fixtures, never shown to a learner
const words: GameWordCandidate[] = [
  {
    ref: 'vocab:w:kmr:bbbbbbbbbbbbbbbbbbbbbbbb',
    source: 'vocabulary',
    dialect: 'kmr',
    word: 'gurz',
    meanings: { en: 'a club, a mace', ku: 'çomaxekî giran' },
    example: { ku: 'Wî gurz hilda.', meanings: { en: 'He picked up the club.' } },
    made: {},
  },
  { ref: 'vocab:w:kmr:aaaaaaaaaaaaaaaaaaaaaaaa', source: 'vocabulary', dialect: 'kmr', word: 'hirç', meanings: { en: 'bear' }, example: null, made: { identity: ID } },
];

function row(over: Partial<AdminGameContent> = {}): AdminGameContent {
  return {
    id: ID,
    kind: 'identity',
    game: 'who-am-i',
    dialect: 'kmr',
    level: 1,
    payload: { word: 'gurz', meanings: { en: 'a club, a mace', ku: 'çomaxekî giran' }, category: 'object', facts: { alive: false, animal: false, 'can-fly': false, 'four-legs': false } },
    headline: 'gurz',
    status: 'draft',
    reviewStatus: 'unreviewed',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    source: 'admin',
    origin: 'vocab:w:kmr:bbbbbbbbbbbbbbbbbbbbbbbb',
    lockVersion: 0,
    publishedAt: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
    issues: [],
    ...over,
  };
}

let unmount: (() => void) | null = null;
beforeEach(() => {
  location.hash = '#/game-content';
});
afterEach(() => {
  unmount?.();
  unmount = null;
  vi.unstubAllGlobals();
});

async function open(hash: string): Promise<HTMLElement> {
  location.hash = hash;
  const page = await render(withKit(<GameContent />));
  unmount = page.unmount;
  await settle();
  return page.container;
}

describe('cards from approved words', () => {
  it('lists approved words with their meaning, an example and what was made of them', async () => {
    const api = fakeApi(on('GET', /^\/admin\/game-content\/words\?/, json({ words })));
    const page = await open('#/game-content/words');
    expect(page.querySelector('.gc-word-ku')?.getAttribute('lang')).toBe('ku');
    expect(text(page)).toContain('a club, a mace');
    expect(text(page)).toContain('Wî gurz hilda.');
    expect(text(page)).toContain('Published lessons');
    expect(text(page)).toContain('Is an identity');
    // identities are made of the lessons' words alone, in the variety picked
    const asked = api.calls.find((c) => c.path.includes('/words?'))!.path;
    expect(asked).toContain('dialect=kmr');
    expect(asked).toContain('from=vocabulary');
    // the cards of the games that are gone are not offered
    expect(text(page)).not.toContain('Bluff');
  });

  it('makes an identity only once it says what kind of thing it is and four facts', async () => {
    const api = fakeApi(on('GET', /^\/admin\/game-content\/words\?/, json({ words })), on('POST', '/admin/game-content/from-word', json(row(), 201)));
    const page = await open('#/game-content/words');
    const identities = page.querySelectorAll('section')[page.querySelectorAll('section').length - 1]!;
    // the identities' list asks for the lessons' words alone
    expect(api.calls.filter((c) => c.path.includes('/words?')).some((c) => c.path.includes('from=vocabulary'))).toBe(true);
    await click(button(identities.querySelectorAll('.gc-word')[0]!, 'Use this word'));
    const make = button(identities, 'Make an identity') as HTMLButtonElement;
    expect(make.disabled).toBe(true);
    await choose(Array.from(identities.querySelectorAll('select')).find((s) => s.querySelector('option[value="animal"]'))!, 'animal');
    for (const fact of ['It is alive', 'It is an animal', 'It can fly', 'It walks on four legs']) await choose(identities.querySelector(`select[aria-label="${fact}"]`), fact === 'It can fly' ? 'no' : 'yes');
    expect((button(identities, 'Make an identity') as HTMLButtonElement).disabled).toBe(false);
    await click(button(identities, 'Make an identity'));
    expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      kind: 'identity',
      ref: words[0]!.ref,
      category: 'animal',
      facts: { alive: true, animal: true, 'can-fly': false, 'four-legs': true },
    });
    expect(location.hash).toBe(`#/game-content/${ID}`);
  });
});

describe('the editors', () => {
  it('keeps an identity’s Kurdish read only, as it was copied, and lets its other meanings be written', async () => {
    fakeApi(on('GET', `/admin/game-content/${ID}`, json(row())));
    const page = await open(`#/game-content/${ID}`);
    const word = page.querySelector<HTMLInputElement>('input[lang="ku"][dir="ltr"]')!;
    expect(word.value).toBe('gurz');
    expect(word.readOnly).toBe(true);
    const kurdishMeaning = Array.from(page.querySelectorAll<HTMLInputElement>('input[lang="ku"]')).find((i) => i.value === 'çomaxekî giran')!;
    expect(kurdishMeaning.readOnly).toBe(true);
    expect(page.querySelector<HTMLInputElement>('input[lang="de"]')!.readOnly).toBe(false);
  });

  it('asks for a new card of the word rather than a blank one', async () => {
    fakeApi(on('GET', /^\/admin\/game-content\/words\?/, json({ words: [] })));
    const page = await open('#/game-content/new?kind=identity');
    expect(text(page)).toContain('Make identities from approved words');
    expect(button(page, 'Save draft')).toBeNull();
  });

  it('writes a question template as a draft for a native speaker, with the fact it asks', async () => {
    fakeApi();
    const page = await open('#/game-content/new?kind=question_template');
    expect(text(page)).toContain('A question is new Kurdish');
    const fact = Array.from(page.querySelectorAll('select')).find((s) => s.querySelector('option[value="can-fly"]'));
    expect(fact).toBeTruthy();
  });
});
