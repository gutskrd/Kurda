// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminGameContent, PublishedLine } from '@kurda/shared';
import { fakeApi, json, on } from '../test/fetch';
import { button, click, render, settle, text } from '../test/dom';
import { withKit } from '../test/render';
import { GameContent } from './GameContent';

/**
 * Kurdish Detective's case files on the Game content page: a case's evidence
 * is picked card by card from published lines, with its English and
 * recording key copied, and its Kurdish is shown and never typed.
 */

const ID = '7d1f0f6a-3b9a-4c55-8f0b-0c3c0bde0002';
const en = (t: string) => ({ en: t });

// stand-in Kurdish for the fixtures, never shown to a learner
function row(over: Partial<AdminGameContent>): AdminGameContent {
  return {
    id: ID,
    kind: 'case_file',
    game: 'detective',
    dialect: 'kmr',
    level: 1,
    payload: {
      title: en('The missing apples'),
      intro: en('Someone took the apples.'),
      suspects: [
        { id: 'hamo', name: 'Hamo', about: en('The uncle.') },
        { id: 'xezo', name: 'Xezo', about: en('The niece.') },
      ],
      evidence: [
        {
          id: 'card-1',
          kind: 'overheard',
          ku: 'Tu çend salî yî?',
          meanings: en('How old are you?'),
          speaker: 'hamo',
          recording: 'conv|0|x',
          origin: { type: 'conversation', ref: 'ex1:0' },
        },
        { id: 'card-2', kind: 'statement', ku: 'Ez heft salî me.', meanings: en('I am seven.') },
        { id: 'card-3', kind: 'note', ku: 'Li wir sêv hene!', meanings: en('There are apples over there!') },
      ],
      steps: [{ prompt: en('Who asks?'), options: [en('Hamo'), en('Xezo')], correctIndex: 0, evidence: ['card-1', 'card-2', 'card-3'] }],
      culprit: 'xezo',
      solution: en('Xezo took them.'),
      hints: [],
    },
    headline: 'The missing apples',
    status: 'draft',
    reviewStatus: 'unreviewed',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    source: 'admin',
    origin: null,
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

describe('case files', () => {
  it('show their Kurdish without a field to type it in, and add cards only from published lines', async () => {
    const api = fakeApi(on('GET', `/admin/game-content/${ID}`, json(row({}))), on('GET', /^\/admin\/game-content\/lines\?/, json({ lines })));
    const page = await open(`#/game-content/${ID}`);
    expect(text(page)).toContain('Tu çend salî yî?');
    // no Kurdish is ever typed: there is no input holding it, only its meaning
    for (const input of page.querySelectorAll('input')) expect(input.value).not.toContain('Tu çend salî yî?');
    expect(page.querySelector('span[lang="ku"]')?.textContent).toBe('Tu çend salî yî?');
    expect([...page.querySelectorAll<HTMLInputElement>('input')].some((i) => i.value === 'How old are you?')).toBe(true);
    expect(text(page)).toContain('Ready to save.');
    expect(text(page)).not.toContain('No step uses it');

    await click(button(page, 'Add a card from a published line'));
    await settle();
    expect(api.calls.some((c) => c.path.startsWith('/admin/game-content/lines?dialect=kmr'))).toBe(true);
    await click(page.querySelectorAll<HTMLButtonElement>('.gc-line-picker-list button')[0]!);
    expect(text(page)).toContain('Otobûs diçe, zû were!');
    expect(page.querySelector('.gc-line-picker')).toBeNull();
    // the new card is allowed (a red herring), and said to be one no step uses yet
    expect(text(page)).toContain('No step uses it');
  });

  it('are put together card by card from published lines, with their English and recordings copied', async () => {
    let saved: unknown = null;
    const api = fakeApi(
      on('GET', /^\/admin\/game-content\/lines\?/, json({ lines })),
      on('POST', '/admin/game-content', (call) => {
        saved = call.body;
        return json(row({ payload: (call.body as { payload: AdminGameContent['payload'] }).payload }), 201);
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
