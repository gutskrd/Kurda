// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminGameContent, GameContentReadiness } from '@kurda/shared';
import { fakeApi, json, on } from '../test/fetch';
import { button, choose, click, render, settle, text, type } from '../test/dom';
import { withKit } from '../test/render';
import { GameContent } from './GameContent';

/**
 * The Game content page: the list and its filters, the importers, the
 * readiness view, and one row's editor — the checks it runs as the content is
 * typed (Kurdish in the other variety's script is refused before a save is
 * tried), its review panel, and publishing only what was approved.
 */

const ID = '7d1f0f6a-3b9a-4c55-8f0b-0c3c0bde0001';

// stand-in Kurdish for the fixtures, never shown to a learner
function row(over: Partial<AdminGameContent> = {}): AdminGameContent {
  return {
    id: ID,
    kind: 'sentence',
    game: 'build-sentence',
    dialect: 'kmr',
    level: 1,
    payload: { ku: 'Ev mala me ye.', meanings: { en: 'This is our house.' }, orders: [], glosses: [] },
    headline: 'Ev mala me ye.',
    status: 'draft',
    reviewStatus: 'unreviewed',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    source: 'admin',
    origin: 'lesson:00000000-0000-4000-8000-000000000009',
    lockVersion: 3,
    publishedAt: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
    issues: [],
    ...over,
  };
}

const readiness: GameContentReadiness = {
  availability: (['kmr', 'ckb'] as const).map((dialect) => ({
    dialect,
    games: [
      { id: 'build-sentence', levels: { 1: dialect === 'kmr' ? 40 : 0, 2: 3, 3: 0, 4: 0, 5: 0 }, levelled: true, minimum: 30, difficulties: dialect === 'kmr' ? ['beginner'] : [], available: dialect === 'kmr' },
    ],
  })),
  counts: [{ kind: 'sentence', dialect: 'kmr', status: 'draft', reviewStatus: 'unreviewed', n: 12 }],
};

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
  return page.container;
}

describe('the list', () => {
  it('lists every row with its kind, variety and standing, and filters by game', async () => {
    const api = fakeApi(on('GET', /^\/admin\/game-content\?/, json({ rows: [row()], total: 1 })));
    const page = await open('#/game-content');
    expect(text(page)).toContain('Ev mala me ye.');
    expect(text(page)).toContain('Build a Kurdish Sentence');
    expect(text(page)).toContain('Draft');
    expect(page.querySelector('a[href="#/game-content/' + ID + '"]')?.getAttribute('lang')).toBe('ku');
    const game = page.querySelector<HTMLSelectElement>('select[aria-label="Game"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    setter.call(game, 'build-sentence');
    game.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(api.calls.at(-1)!.path).toContain('game=build-sentence');
  });

  it('imports drafts from published lessons, and says how many were new', async () => {
    const api = fakeApi(
      on('GET', /^\/admin\/game-content\?/, json({ rows: [], total: 0 })),
      on('POST', '/admin/game-content/import', json({ created: 44, skipped: 2 })),
    );
    const page = await open('#/game-content');
    await click(button(page, 'Sentences from lessons (Kurmancî)'));
    expect(api.calls.find((c) => c.method === 'POST')!.body).toEqual({ from: 'lessons', dialect: 'kmr' });
    expect(text(document.body)).toContain('Imported 44 new drafts from published lessons (Kurmancî); 2 were already here.');
  });

  it('shows each game’s readiness per variety', async () => {
    fakeApi(on('GET', '/admin/game-content/readiness', json(readiness)));
    const page = await open('#/game-content/readiness');
    const tables = page.querySelectorAll('table.gc-ready');
    expect(tables).toHaveLength(2);
    expect(text(tables[0]!)).toContain('beginner');
    expect(text(tables[1]!)).toContain('Not yet');
    expect(text(tables[0]!)).toContain('12');
  });
});

describe('one row', () => {
  it('refuses Kurdish in the other variety’s script before a save is tried', async () => {
    const api = fakeApi();
    const page = await open('#/game-content/new?kind=sentence');
    expect(text(page)).toContain('write the Kurdish here');
    await type(page.querySelector('.gc-meanings input'), 'This is our house.');
    await type(page.querySelector('input[lang="ku"]'), 'ئەمە ماڵی ئێمەیە');
    expect(text(page)).toContain('write this in Kurmancî’s Latin letters only');
    expect((button(page, 'Save draft') as HTMLButtonElement).disabled).toBe(true);
    await type(page.querySelector('input[lang="ku"]'), 'Ev mala me ye.');
    expect(text(page)).toContain('Ready to save.');
    expect(api.calls).toHaveLength(0);
  });

  it('publishes only once a reviewer has approved it', async () => {
    let current = row();
    const api = fakeApi(
      on('GET', `/admin/game-content/${ID}`, () => json(current)),
      on('POST', `/admin/game-content/${ID}/review`, () => {
        current = row({ reviewStatus: 'approved', reviewedBy: { id: 'u1', username: 'dilan' }, reviewedAt: '2026-11-03T10:00:00.000Z', lockVersion: 4 });
        return json(current);
      }),
      on('POST', `/admin/game-content/${ID}/publish`, () => {
        current = row({ ...current, status: 'published', lockVersion: 5 });
        return json(current);
      }),
    );
    const page = await open(`#/game-content/${ID}`);
    expect(text(page)).toContain('Imported from lesson');
    expect((button(page, 'Publish') as HTMLButtonElement).disabled).toBe(true);
    await click(button(page, 'Approve'));
    expect(api.calls.find((c) => c.path.endsWith('/review'))!.body).toEqual({ approved: true, note: null, lockVersion: 3 });
    expect(text(page)).toContain('Approved by');
    await click(button(page, 'Publish'));
    expect(api.calls.find((c) => c.path.endsWith('/publish'))!.body).toEqual({ lockVersion: 4 });
    expect(text(page)).toContain('Published: unpublish it to edit it.');
    expect(text(page)).toContain('Unpublish it first to withdraw its approval.');
  });

  it('says that saved changes need approving again', async () => {
    fakeApi(on('GET', `/admin/game-content/${ID}`, json(row({ reviewStatus: 'approved' }))));
    const page = await open(`#/game-content/${ID}`);
    await type(page.querySelector('input[lang="ku"]'), 'Ev mala min e.');
    expect(text(page)).toContain('once saved, it needs approving again');
  });
});

describe('the party games’ cards', () => {
  // stand-in Kurdish for the fixtures, never shown to a learner
  const vocabulary = {
    words: [
      { key: 'w:kmr:1', ku: 'pisîk', meanings: { en: 'cat', de: 'Katze' } },
      { key: 'w:kmr:2', ku: 'mişk', meanings: { en: 'mouse' } },
      { key: 'w:kmr:3', ku: 'şîr', meanings: { en: 'milk' } },
      { key: 'w:kmr:4', ku: 'nerm', meanings: { en: 'soft' } },
    ],
    total: 4,
  };
  const category = row({
    id: '7d1f0f6a-3b9a-4c55-8f0b-0c3c0bde0002',
    kind: 'word_category',
    game: 'impostor',
    payload: { slug: 'animals', ku: 'heywan', meanings: { en: 'animal' } },
    headline: 'heywan',
    source: 'starter',
  });

  it('makes a word card by picking its word from published vocabulary and its category from the list', async () => {
    const api = fakeApi(
      on('GET', /^\/admin\/game-content\/vocabulary\?/, json(vocabulary)),
      on('GET', /kind=word_category/, json({ rows: [category], total: 1 })),
      on('POST', '/admin/game-content', (call) => json(row({ kind: 'word_card', game: 'impostor', payload: call.body as never, headline: 'pisîk' }), 201)),
    );
    const page = await open('#/game-content/new?kind=word_card');
    await click(button(page, /^pisîk/));
    expect(page.querySelector('.gc-picked [lang="ku"]')?.textContent).toBe('pisîk');
    expect((page.querySelector('.gc-meanings input') as HTMLInputElement).value).toBe('cat');
    await choose(page.querySelector('select[aria-label="Category"]'), 'animals');
    expect(text(page)).toContain('The impostor is shown: heywan (animal)');
    expect(text(page)).toContain('Ready to save.');
    await click(button(page, 'Save draft'));
    const created = api.calls.find((c) => c.method === 'POST' && c.path === '/admin/game-content')!;
    expect(created.body).toMatchObject({
      kind: 'word_card',
      dialect: 'kmr',
      payload: { word: 'pisîk', meanings: { en: 'cat', de: 'Katze' }, category: 'animals', hint: { ku: 'heywan', meanings: { en: 'animal' } }, forms: [] },
    });
    // no Kurdish was typed: every Kurdish field is a picked word
    expect(page.querySelector('input[lang="ku"]')).toBeNull();
  });

  it('makes a forbidden-word card from picked words, three to five of them', async () => {
    fakeApi(on('GET', /^\/admin\/game-content\/vocabulary\?/, json(vocabulary)));
    const page = await open('#/game-content/new?kind=taboo_card');
    await click(button(page, /^pisîk/));
    expect(text(page)).toContain('to fix before it can be saved');
    for (const w of [/^mişk/, /^şîr/, /^nerm/]) {
      await click(button(page, 'Add a forbidden word'));
      await click(button(page, w));
    }
    expect(text(page)).toContain('Ready to save.');
    // a word already on the card is not offered again
    await click(button(page, 'Add a forbidden word'));
    expect(button(page, /^pisîk —/)).toBeNull();
  });

  it('imports Kurdish Impostor’s starter word cards as drafts from published vocabulary', async () => {
    const api = fakeApi(
      on('GET', /^\/admin\/game-content\?/, json({ rows: [], total: 0 })),
      on('POST', '/admin/game-content/import', json({ created: 9, skipped: 0 })),
    );
    const page = await open('#/game-content');
    await click(button(page, 'Starter word cards from vocabulary (Kurmancî)'));
    expect(api.calls.find((c) => c.method === 'POST')!.body).toEqual({ from: 'vocabulary', dialect: 'kmr' });
    expect(text(document.body)).toContain('Imported 9 new drafts from published vocabulary (Kurmancî)');
  });
});
