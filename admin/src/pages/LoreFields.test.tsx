// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminGameContent } from '@kurda/shared';
import { fakeApi, json, on } from '../test/fetch';
import { button, click, render, settle, text, type } from '../test/dom';
import { withKit } from '../test/render';
import { GameContent } from './GameContent';

/**
 * The Stories' riddles and proverbs on the Game content page: a riddle is
 * written in proper fields with its answer in a section of its own, filed at
 * its difficulty's level; a proverb takes one to three themes and its other
 * wordings; and a published riddle's translations are saved and reviewed one
 * language at a time, the row staying published and approved.
 */

const ID = '7d1f0f6a-3b9a-4c55-8f0b-0c3c0bde00a1';

// stand-in Kurdish for the fixtures, never shown to a learner.
const riddlePayload = {
  slug: 'kmr-si',
  difficulty: 'medium',
  category: 'nature',
  tradition: 'new',
  question: 'Çi ye ku dikeve nav avê lê şil nabe?',
  hints: ['Ew bi te re dimeşe.', 'Roj wê çêdike.'],
  answer: 'Sî',
  accepted: ['sî', 'siya'],
  explanation: 'Sî ne tiştek e ku şil bibe.',
  sources: [],
};

function row(over: Partial<AdminGameContent> = {}): AdminGameContent {
  return {
    id: ID,
    kind: 'riddle',
    game: null,
    dialect: 'kmr',
    level: 3,
    payload: riddlePayload as never,
    headline: riddlePayload.question,
    status: 'published',
    reviewStatus: 'approved',
    reviewedBy: { id: 'u1', username: 'dilan' },
    reviewedAt: '2026-11-03T10:00:00.000Z',
    reviewNote: null,
    source: 'starter',
    origin: null,
    lockVersion: 4,
    publishedAt: '2026-11-04T10:00:00.000Z',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-04T10:00:00.000Z',
    issues: [],
    translations: {
      en: {
        payload: { question: 'What falls into water and never gets wet?', hints: ['It walks with you.', 'The sun makes it.'], answer: 'A shadow', explanation: 'A shadow is not a thing.' },
        reviewStatus: 'unreviewed',
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        updatedAt: '2026-11-04T10:00:00.000Z',
        issues: [],
      },
    },
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
  return page.container;
}

const fieldset = (page: HTMLElement, legend: string): HTMLFieldSetElement =>
  [...page.querySelectorAll('fieldset')].find((f) => f.querySelector(':scope > legend')?.textContent === legend) as HTMLFieldSetElement;

/** Choose an option in the first select (within `scope`) that offers it. */
async function pick(scope: ParentNode, value: string): Promise<void> {
  const select = [...scope.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === value))!;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
  setter.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
}

/** Every field a new riddle needs, written the way an editor writes them. */
async function fillRiddle(page: HTMLElement): Promise<void> {
  const question = fieldset(page, 'The question');
  const answer = fieldset(page, 'The answer');
  await type(page.querySelector('input:not([type])[required]'), 'kmr-si');
  await type(question.querySelector('textarea'), riddlePayload.question);
  await type(question.querySelector('input[aria-label="Hint 1"]'), riddlePayload.hints[0]!);
  await type(answer.querySelector('input[required]'), 'Sî');
  await type(answer.querySelector('input[aria-label="Accepted form 1"]'), 'sî');
  await type(answer.querySelector('textarea'), riddlePayload.explanation);
}

describe('a riddle', () => {
  it('is written in its own fields, the answer apart from the question, and filed at its difficulty’s level', async () => {
    const api = fakeApi(on('POST', '/admin/game-content', (call) => json(row({ status: 'draft', reviewStatus: 'unreviewed', payload: (call.body as { payload: never }).payload }), 201)));
    const page = await open('#/game-content/new?kind=riddle');
    expect(page.querySelector('.gc-json')).toBeNull();
    const question = fieldset(page, 'The question');
    const answer = fieldset(page, 'The answer');
    expect(question.querySelector('input[aria-label="Hint 1"]')).not.toBeNull();
    expect(question.querySelector('[aria-label^="Accepted form"]')).toBeNull();
    expect(answer.querySelector('input[aria-label="Accepted form 1"]')).not.toBeNull();
    expect(answer.querySelector('input[aria-label="Hint 1"]')).toBeNull();

    await fillRiddle(page);
    await type(answer.querySelector('input[aria-label="Accepted form 1"]'), 'سێبەر');
    expect(text(page)).toContain('write this in Kurmancî’s Latin letters only');
    await type(answer.querySelector('input[aria-label="Accepted form 1"]'), 'sî');
    // Hard: the level select follows, and cannot be chosen apart from it.
    await pick(page, 'hard');
    const level = [...page.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent === 'Level 5'))!;
    expect(level.value).toBe('5');
    expect(level.disabled).toBe(true);
    expect(text(page)).toContain('Ready to save.');
    await click(button(page, 'Save draft'));
    const created = api.calls.find((c) => c.method === 'POST')!;
    expect(created.body).toMatchObject({
      kind: 'riddle',
      dialect: 'kmr',
      level: 5,
      payload: { slug: 'kmr-si', difficulty: 'hard', hints: [riddlePayload.hints[0]], answer: 'Sî', accepted: ['sî'] },
    });
  });

  it('asks for a source before anything is presented as traditional', async () => {
    fakeApi();
    const page = await open('#/game-content/new?kind=riddle');
    await fillRiddle(page);
    expect(text(page)).toContain('Ready to save.');
    await pick(page, 'traditional');
    expect(text(page)).toContain('a traditional or regional one names at least one source');
    await click(button(page, 'Add a source'));
    await type(page.querySelector('.gc-card input[required]'), 'A collection of riddles');
    await type(page.querySelector('input[type="url"]'), 'http://example.org');
    expect(text(page)).toContain('use an https:// address');
    await type(page.querySelector('input[type="url"]'), 'https://example.org/riddles');
    expect(text(page)).toContain('Ready to save.');
  });
});

describe('a published riddle’s translations', () => {
  it('are saved one language at a time, and the riddle stays published and approved', async () => {
    let current = row();
    const de = { question: 'Was fällt ins Wasser und wird nicht nass?', hints: ['Es geht mit dir.', 'Die Sonne macht ihn.'], answer: 'Der Schatten', explanation: 'Ein Schatten ist kein Ding.' };
    const api = fakeApi(
      on('GET', `/admin/game-content/${ID}`, () => json(current)),
      on('PUT', `/admin/game-content/${ID}/translations/de`, (call) => {
        current = row({
          translations: {
            ...current.translations,
            de: { payload: (call.body as { payload: never }).payload, reviewStatus: 'unreviewed', reviewedBy: null, reviewedAt: null, reviewNote: null, updatedAt: '2026-11-05T10:00:00.000Z', issues: [] },
          },
        });
        return json(current);
      }),
      on('POST', `/admin/game-content/${ID}/translations/de/review`, () => {
        current = row({ translations: { ...current.translations, de: { ...current.translations!.de!, reviewStatus: 'reviewed', reviewedBy: { id: 'u2', username: 'lena' }, reviewedAt: '2026-11-05T11:00:00.000Z' } } });
        return json(current);
      }),
    );
    const page = await open(`#/game-content/${ID}`);
    expect(text(page)).toContain('Its translations can be corrected below while it stays published.');
    expect(text(page)).toContain('0 of 8 languages reviewed, 7 not translated yet.');
    const tab = [...page.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.startsWith('German')) as HTMLElement;
    expect(tab.textContent).toContain('missing');
    expect([...page.querySelectorAll('[role="tab"]')].some((t) => t.textContent === 'Kurdish (Kurmanji) (original)')).toBe(true);
    await click(tab);
    const form = page.querySelector('[aria-label="German translation"]') as HTMLElement;
    expect(text(form)).toContain('Not translated yet');
    // Each hint is shown beside the Kurdish it translates.
    expect(text(form)).toContain(riddlePayload.hints[1]);
    const inputs = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[lang="de"], textarea[lang="de"]');
    await type(inputs[0], de.question);
    await type(inputs[1], de.hints[0]!);
    await type(inputs[2], de.hints[1]!);
    await type(inputs[3], de.answer);
    await type(inputs[4], de.explanation);
    await click(button(form, 'Save this language'));
    expect(api.calls.find((c) => c.method === 'PUT')!.body).toEqual({ payload: de });
    expect(api.calls.some((c) => /\/(unpublish|review)$/.test(c.path) && !c.path.includes('/translations/'))).toBe(false);
    const saved = page.querySelector('[aria-label="German translation"]') as HTMLElement;
    expect(text(saved)).toContain('Needs review');
    await click(button(saved, 'Mark reviewed'));
    expect(api.calls.find((c) => c.path.endsWith('/translations/de/review'))!.body).toEqual({ status: 'reviewed', note: null });
    const reviewed = page.querySelector('[aria-label="German translation"]') as HTMLElement;
    expect(text(reviewed)).toContain('Reviewed');
    expect(button(reviewed, 'Needs review')).not.toBeNull();
    expect(text(page)).toContain('1 of 8 languages reviewed');
    expect(text(page)).toContain('Published');
  });

  it('will not save a language that leaves a hint untranslated', async () => {
    fakeApi(on('GET', `/admin/game-content/${ID}`, json(row())));
    const page = await open(`#/game-content/${ID}`);
    await click([...page.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.startsWith('French')) as HTMLElement);
    const form = page.querySelector('[aria-label="French translation"]') as HTMLElement;
    const inputs = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[lang="fr"], textarea[lang="fr"]');
    await type(inputs[0], 'Qu’est-ce qui tombe dans l’eau sans se mouiller ?');
    await type(inputs[1], 'Il marche avec toi.');
    await type(inputs[3], 'L’ombre');
    await type(inputs[4], 'Une ombre n’est pas une chose.');
    expect(text(form)).toContain('fill this in');
    expect((button(form, 'Save this language') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('a proverb', () => {
  it('takes one to three themes and its other wordings, each in its own variety’s script', async () => {
    fakeApi();
    const page = await open('#/game-content/new?kind=proverb');
    await type(page.querySelector('input:not([type])[required]'), 'kmr-av-dilop');
    const saying = fieldset(page, 'The proverb').querySelectorAll('textarea');
    await type(saying[0], 'Av dilop dilop dibe gol.');
    await type(saying[1], 'Dapîr got: “Av dilop dilop dibe gol.”');
    await pick(page, 'new');
    const boxes = [...page.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(boxes).toHaveLength(12);
    for (const box of boxes.slice(0, 3)) await click(box);
    expect(boxes[3]!.disabled).toBe(true);
    await click(button(page, 'Add a wording'));
    expect(page.querySelector('.gc-card input[lang]')!.getAttribute('lang')).toBe('ku');
    await type(page.querySelector('.gc-card input[lang]'), 'Av dilop dilop dibe gol');
    expect(text(page)).toContain('Ready to save.');
    await pick(page.querySelector('.gc-card')!, 'ckb');
    expect(page.querySelector('.gc-card input[lang]')!.getAttribute('dir')).toBe('rtl');
    expect(text(page)).toContain('write this in Soranî’s Arabic script only');
  });
});
