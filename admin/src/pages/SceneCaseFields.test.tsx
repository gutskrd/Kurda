// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminGameContent, PublishedLine } from '@kurda/shared';
import { fakeApi, json, on } from '../test/fetch';
import { button, click, render, settle, text } from '../test/dom';
import { withKit } from '../test/render';
import { GameContent } from './GameContent';

/**
 * What Would You Say?'s scenes and Kurdish Detective's case files on the Game
 * content page: scenes are imported from published conversations; a scene's
 * Kurdish is shown and never typed, its wrong replies kept to two at least
 * and added only from published lines; a case's evidence is picked card by
 * card from published lines, with its English and recording key copied.
 */

const ID = '7d1f0f6a-3b9a-4c55-8f0b-0c3c0bde0002';
const en = (t: string) => ({ en: t });

// stand-in Kurdish for the fixtures, never shown to a learner
function row(over: Partial<AdminGameContent>): AdminGameContent {
  return {
    id: ID,
    kind: 'scenario',
    game: 'what-would-you-say',
    dialect: 'kmr',
    level: 1,
    payload: {
      situation: en('Hamo says this to you.'),
      speaker: 'hamo',
      line: { ku: 'Tu çend salî yî?', meanings: en('How old are you?'), recording: 'conv|0|x' },
      reply: { ku: 'Ez heft salî me.', meanings: en('I am seven.') },
      others: [
        { ku: 'Li wir sêv hene!', meanings: en('There are apples over there!') },
        { ku: 'Ez ne hêdî me!', meanings: en('I am not slow!') },
      ],
      origin: { type: 'conversation', ref: 'ex1:0' },
    },
    headline: 'Tu çend salî yî?',
    status: 'draft',
    reviewStatus: 'unreviewed',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    source: 'admin',
    origin: 'conversation:ex1:0',
    lockVersion: 1,
    publishedAt: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
    issues: [],
    ...over,
  };
}

const lines: PublishedLine[] = [
  { ku: 'Otobûs diçe, zû were!', en: 'The bus is leaving, come quickly!', speaker: 'xezo', recording: 'conv2|1|y', origin: { type: 'conversation', ref: 'ex2:1' }, from: 'Otobûs diçe!', level: 2 },
  { ku: 'Baran îro ne li malê ye.', en: 'Baran is not at home today.', speaker: 'hamo', recording: 'conv3|1|z', origin: { type: 'conversation', ref: 'ex3:3' }, from: 'Ya kê ye?', level: 1 },
];

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

describe('scenes', () => {
  it('are imported as drafts from published conversations', async () => {
    const api = fakeApi(on('GET', /^\/admin\/game-content\?/, json({ rows: [], total: 0 })), on('POST', '/admin/game-content/import', json({ created: 18, skipped: 0 })));
    const page = await open('#/game-content');
    await click(button(page, 'Scenes from conversations (Kurmancî)'));
    expect(api.calls.find((c) => c.method === 'POST')!.body).toEqual({ from: 'conversations', dialect: 'kmr' });
    expect(text(document.body)).toContain('Imported 18 new drafts from published conversations (Kurmancî)');
  });

  it('show their Kurdish without a field to type it in, and add wrong replies only from published lines', async () => {
    const api = fakeApi(on('GET', `/admin/game-content/${ID}`, json(row({}))), on('GET', /^\/admin\/game-content\/lines\?/, json({ lines })));
    const page = await open(`#/game-content/${ID}`);
    expect(text(page)).toContain('Tu çend salî yî?');
    expect(text(page)).toContain('How old are you?');
    // no Kurdish is ever typed: there is no input holding it
    for (const input of page.querySelectorAll('input')) expect(input.value).not.toContain('Tu çend salî yî?');
    expect(page.querySelector('span[lang="ku"]')?.textContent).toBe('Tu çend salî yî?');
    // two wrong replies is the least a scene keeps
    expect((page.querySelector('button[aria-label="Remove wrong reply 1"]') as HTMLButtonElement).disabled).toBe(true);

    await click(button(page, 'Add a wrong reply from a published line'));
    await settle();
    expect(api.calls.some((c) => c.path.startsWith('/admin/game-content/lines?dialect=kmr'))).toBe(true);
    expect(text(page)).toContain('Otobûs diçe, zû were!');
    await click(page.querySelectorAll<HTMLButtonElement>('.gc-line-picker-list button')[0]!);
    expect(text(page)).toContain('Otobûs diçe, zû were!');
    expect(page.querySelector('.gc-line-picker')).toBeNull();
    expect((page.querySelector('button[aria-label="Remove wrong reply 1"]') as HTMLButtonElement).disabled).toBe(false);
    expect(text(page)).toContain('Ready to save.');
  });
});

describe('case files', () => {
  it('are put together card by card from published lines, with their English and recordings copied', async () => {
    let saved: unknown = null;
    const api = fakeApi(
      on('GET', /^\/admin\/game-content\/lines\?/, json({ lines })),
      on('POST', '/admin/game-content', (call) => {
        saved = call.body;
        return json(row({ kind: 'case_file', game: 'detective', payload: (call.body as { payload: AdminGameContent['payload'] }).payload }), 201);
      }),
    );
    const page = await open('#/game-content/new?kind=case_file');
    expect(text(page)).toContain('Add a card from a published line');
    await click(button(page, 'Add a card from a published line'));
    await settle();
    await click(page.querySelectorAll<HTMLButtonElement>('.gc-line-picker-list button')[1]!);
    expect(text(page)).toContain('Baran îro ne li malê ye.');
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    // the new card carries the line's English to start from
    const meaning = [...page.querySelectorAll<HTMLInputElement>('input')].find((i) => i.value === 'Baran is not at home today.');
    expect(meaning).toBeTruthy();
    expect(saved).toBeNull();
  });
});
