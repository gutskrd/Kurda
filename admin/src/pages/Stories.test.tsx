// @vitest-environment jsdom
import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminStory, AdminStorySummary } from '../stories';
import { failure, fakeApi, json, on, type Call, type Route } from '../test/fetch';
import { button, choose, click, render, settle, text, type } from '../test/dom';
import { withKit } from '../test/render';
import { CATEGORIES, STORY_ID, audioFixture, storyFixture, summaryOf } from '../test/stories';
import type { ConfirmOptions, PromptOptions } from '../ui';
import { Stories } from './Stories';

/**
 * The editor asks in the admin's own dialog (the kit's, tested on its own in
 * kit.test.tsx). Here it is answered by `confirm`, which hears what the dialog
 * says — its title and its text, as one line — and answers yes unless told no;
 * a prompt (a review's note) is answered by `prompt` with an empty note.
 */
const answers = vi.hoisted(() => ({
  confirm: vi.fn((_said: string): boolean => true),
  prompt: vi.fn((_said: string): string | null => ''),
}));
vi.mock('../ui/Dialog', async (importOriginal) => {
  const real = await importOriginal<typeof import('../ui/Dialog')>();
  const plain = (node: ReactNode): string =>
    typeof node === 'string' || typeof node === 'number'
      ? String(node)
      : isValidElement(node)
        ? renderToStaticMarkup(node).replace(/<\/li><li>/g, ' ').replace(/<[^>]+>/g, '')
        : '';
  // one object for every render, as the real hook gives
  const dialogs = {
    confirm: async (o: ConfirmOptions) => answers.confirm([plain(o.title), plain(o.body)].filter(Boolean).join(' ')),
    prompt: async (o: PromptOptions) => answers.prompt([plain(o.title), plain(o.body)].filter(Boolean).join(' ')),
  };
  return { ...real, useDialogs: () => dialogs };
});
const confirm = answers.confirm;
const prompt = answers.prompt;

// the microphone and the trimming are the browser's: here a take is three bytes, ready at once
vi.mock('../micCapture', async (original) => ({
  ...(await original<typeof import('../micCapture')>()),
  micPermission: async () => 'granted',
  startCapture: async () => ({ level: () => 0.4, stop: async () => new ArrayBuffer(3), cancel: () => {} }),
}));
vi.mock('../audioClip', async (original) => ({
  ...(await original<typeof import('../audioClip')>()),
  prepare: async () => ({ wav: new Uint8Array([82, 73, 70]), url: 'blob:take', seconds: 1.2 }),
}));

const AT = `/admin/stories/${STORY_ID}`;

let unmount: (() => void) | null = null;

beforeEach(() => {
  location.hash = '#/stories';
  confirm.mockReset();
  confirm.mockImplementation(() => true);
  prompt.mockReset();
  prompt.mockImplementation(() => '');
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  unmount?.();
  unmount = null;
  vi.unstubAllGlobals();
});

async function open(hash: string): Promise<HTMLElement> {
  location.hash = hash;
  const page = await render(withKit(<Stories />));
  unmount = page.unmount;
  return page.container;
}

/** The search box sends its words once they have stopped being typed. */
async function debounce(): Promise<void> {
  await new Promise((r) => setTimeout(r, 350));
  await settle();
}

const starter = storyFixture({
  id: '0b5c1a52-6c1e-4f43-9a37-2a1f6b6a9d02',
  slug: 'sorbeya-niske',
  title: 'Şorbeya Nîskê',
  origin: 'starter',
  length: 'medium',
  category: 'family',
  reviewStatus: 'approved',
  reviewedBy: { id: 'u-rev', username: 'dilan' },
  reviewedAt: '2026-10-03T09:00:00.000Z',
});
const soranî = storyFixture({
  id: '0b5c1a52-6c1e-4f43-9a37-2a1f6b6a9d03',
  slug: 'ckb-the-house-key',
  title: 'کلیلی ماڵەوە',
  dialect: 'sorani',
  level: 2,
  cefr: 'A2',
  status: 'in_review',
  category: null,
});
const published = storyFixture({
  id: '0b5c1a52-6c1e-4f43-9a37-2a1f6b6a9d04',
  slug: 'qelema-sin',
  title: 'Qelema Şîn',
  status: 'published',
  origin: 'starter',
  publishedAt: '2026-10-05T10:00:00.000Z',
  reviewStatus: 'approved',
  featured: true,
  featuredAt: '2026-10-06T10:00:00.000Z',
});

/**
 * The server's list: filtered and paged as GET /admin/stories does it, so
 * the page's filters and pagination are tested against the same answers.
 */
function listRoute(summaries: AdminStorySummary[]): Route {
  return on('GET', /^\/admin\/stories(\?|$)/, (call: Call) => {
    const p = new URLSearchParams(call.path.split('?')[1] ?? '');
    const q = p.get('q')?.toLowerCase();
    const rows = summaries.filter(
      (s) =>
        (!p.get('status') || s.status === p.get('status')) &&
        (!p.get('dialect') || s.dialect === p.get('dialect')) &&
        (!p.get('level') || String(s.level) === p.get('level')) &&
        (!p.get('category') || s.category === p.get('category')) &&
        (!p.get('review') || s.reviewStatus === p.get('review')) &&
        (!p.get('featured') || s.featured) &&
        (!q || s.title.toLowerCase().includes(q) || s.slug.includes(q)),
    );
    const limit = Number(p.get('limit') ?? 50);
    const offset = Number(p.get('offset') ?? 0);
    return json({ stories: rows.slice(offset, offset + limit), total: rows.length });
  });
}

function listApi(stories: AdminStory[] = [storyFixture(), starter, soranî, published], summaries?: AdminStorySummary[]) {
  return fakeApi(
    listRoute(summaries ?? stories.map((s) => summaryOf(s, s.id === starter.id ? { questionCount: 8, problems: { errors: 1, warnings: 2 } } : {}))),
    on('GET', '/admin/story-categories', json({ categories: CATEGORIES })),
    ...stories.map((s) => on('GET', `/admin/stories/${s.id}`, json(s))),
  );
}

const rows = (c: HTMLElement): string[] => [...c.querySelectorAll('tbody tr')].map((r) => text(r.querySelector('td strong')));
const paths = (api: { calls: Call[] }, method = 'GET'): string[] => api.calls.filter((c) => c.method === method).map((c) => c.path);

describe('the list', () => {
  it('shows every story with how it is filed, recorded, reviewed, and what stands between it and publishing', async () => {
    listApi();
    const c = await open('#/stories');
    expect(rows(c)).toEqual(['Rêya Dibistanê', 'Şorbeya Nîskê', 'کلیلی ماڵەوە', 'Qelema Şîn']);
    const row = (title: string) => [...c.querySelectorAll('tbody tr')].find((r) => text(r).includes(title))!;
    // a starter is marked until someone publishes it
    expect(text(row('Şorbeya Nîskê'))).toContain('Starter (needs native review)');
    expect(text(row('Qelema Şîn'))).not.toContain('Starter');
    expect(text(row('Şorbeya Nîskê'))).toContain('1 to fix · 2 to check');
    expect(text(row('Şorbeya Nîskê'))).toContain('8 / 12');
    expect(text(row('Rêya Dibistanê'))).toContain('Ready');
    // the level as its CEFR letter, the category by its English name, the audio and the review
    expect(text(row('Rêya Dibistanê'))).toContain('A1');
    expect(text(row('Rêya Dibistanê'))).toContain('Everyday life');
    expect(text(row('Rêya Dibistanê'))).toContain('No audio');
    expect(text(row('Rêya Dibistanê'))).toContain('Unreviewed');
    expect(text(row('Şorbeya Nîskê'))).toContain('Approved');
    expect(text(row('کلیلی ماڵەوە'))).toContain('Not filed');
    // the featured story carries its star
    expect(row('Qelema Şîn').querySelector('.st-star')).not.toBeNull();
    expect(row('Rêya Dibistanê').querySelector('.st-star')).toBeNull();
    // the Soranî title is right to left
    expect(row('کلیلی ماڵەوە').querySelector('strong')!.getAttribute('dir')).toBe('rtl');
    // what learners can play: one short Kurmancî story is published, nothing else
    const coverage = [...c.querySelectorAll('.st-coverage-row')].map((r) => [...r.children].map((el) => text(el)));
    expect(coverage).toEqual([
      ['Kurmancî', 'Short: 1', 'Medium: 0', 'Long: 0'],
      ['Soranî', 'Short: 0', 'Medium: 0', 'Long: 0'],
    ]);
    // a length nobody can play is marked
    expect(c.querySelector('.st-coverage-row .badge.danger')).not.toBeNull();
    // the categories page is a step away
    expect(button(c, 'Categories')!.getAttribute('href')).toBe('#/stories/categories');
  });

  it('filters on the server by status, variety, level, category, review, featured and search, counting the tabs', async () => {
    const api = listApi();
    const c = await open('#/stories');
    const count = (name: RegExp): string => text(button(c, name)?.querySelector('.tab-count'));
    expect(count(/^Draft/)).toBe('2');
    expect(count(/^All/)).toBe('4');
    await click(button(c, /^In review/));
    expect(rows(c)).toEqual(['کلیلی ماڵەوە']);
    expect(paths(api)).toContain('/admin/stories?status=in_review&limit=50');
    await click(button(c, /^All/));
    await choose(c.querySelector('select[aria-label="Variety"]'), 'kurmanci');
    expect(rows(c)).toEqual(['Rêya Dibistanê', 'Şorbeya Nîskê', 'Qelema Şîn']);
    // the tabs count what each would show under the other filters
    expect(count(/^All/)).toBe('3');
    expect(count(/^In review/)).toBe('0');
    await choose(c.querySelector('select[aria-label="Level"]'), 'A2');
    expect(text(c)).toContain('No story matches these filters.');
    expect(paths(api)).toContain('/admin/stories?dialect=kurmanci&level=2&limit=50');
    await choose(c.querySelector('select[aria-label="Level"]'), 'all');
    await choose(c.querySelector('select[aria-label="Category"]'), 'family');
    expect(rows(c)).toEqual(['Şorbeya Nîskê']);
    await choose(c.querySelector('select[aria-label="Category"]'), 'all');
    await choose(c.querySelector('select[aria-label="Review"]'), 'approved');
    expect(rows(c)).toEqual(['Şorbeya Nîskê', 'Qelema Şîn']);
    await click(c.querySelector('.st-tools input[type="checkbox"]'));
    expect(rows(c)).toEqual(['Qelema Şîn']);
    expect(paths(api)).toContain('/admin/stories?dialect=kurmanci&review=approved&featured=1&limit=50');
    await click(c.querySelector('.st-tools input[type="checkbox"]'));
    await choose(c.querySelector('select[aria-label="Review"]'), 'all');
    // the search goes out once it has stopped being typed
    const before = paths(api).length;
    await type(c.querySelector('input[type="search"]'), 'sorbeya');
    expect(paths(api).length).toBe(before);
    await debounce();
    expect(rows(c)).toEqual(['Şorbeya Nîskê']);
    expect(paths(api)).toContain('/admin/stories?q=sorbeya&dialect=kurmanci&limit=50');
    await type(c.querySelector('input[type="search"]'), 'nothing like it');
    await debounce();
    expect(text(c)).toContain('No story matches these filters.');
    // the filters are remembered for the next visit
    expect(JSON.parse(sessionStorage.getItem('kurda_admin_stories_filter')!)).toMatchObject({ dialect: 'kurmanci', query: 'nothing like it', page: 0 });
  });

  it('pages through a long list, and lands on the last page when a remembered one is past the end', async () => {
    const base = storyFixture();
    const many = Array.from({ length: 120 }, (_, i) => summaryOf(base, { id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, slug: `story-${i}`, title: `Çîrok ${i}` }));
    const api = listApi([], many);
    const c = await open('#/stories');
    expect(rows(c)).toHaveLength(50);
    expect(text(c.querySelector('.pagination-at'))).toBe('1–50 of 120');
    expect(text(c.querySelector('.section-heading'))).toBe('120 stories');
    await click(button(c, 'Next'));
    expect(rows(c)[0]).toBe('Çîrok 50');
    expect(paths(api)).toContain('/admin/stories?limit=50&offset=50');
    await click(button(c, 'Next'));
    expect(rows(c)).toHaveLength(20);
    expect((button(c, 'Next') as HTMLButtonElement).disabled).toBe(true);
    expect(JSON.parse(sessionStorage.getItem('kurda_admin_stories_filter')!).page).toBe(2);
    unmount!();
    unmount = null;

    // the list shrank since page 3 was remembered: the last page there is
    api.use(listRoute(many.slice(0, 60)));
    const again = await open('#/stories');
    expect(text(again.querySelector('.pagination-at'))).toBe('51–60 of 60');
    // a new filter starts on the first page
    await click(button(again, /^Draft/));
    expect(text(again.querySelector('.pagination-at'))).toBe('1–50 of 60');
  });

  it('opens a story at its own address', async () => {
    const api = listApi();
    const c = await open('#/stories');
    await click(button(c, 'Şorbeya Nîskê'));
    expect(location.hash).toBe(`#/stories/${starter.id}`);
    expect(paths(api)).toContain(`/admin/stories/${starter.id}`);
    expect(text(c.querySelector('h1'))).toBe('Şorbeya Nîskê');
    expect(text(c)).toContain('Starter (needs native review)');
  });

  it('says when the role does not allow writing stories, rather than that there are none', async () => {
    fakeApi(on('GET', /^\/admin\/stories/, failure(403, 'FORBIDDEN', 'forbidden')));
    const c = await open('#/stories');
    expect(text(c)).toContain('Your role can’t open this');
    expect(text(c)).toContain('its role doesn’t include writing stories');
    expect(text(c)).not.toContain('No stories yet');
  });

  it('records a story’s sentences from its row, and not an archived one’s', async () => {
    const archived = storyFixture({ id: '0b5c1a52-6c1e-4f43-9a37-2a1f6b6a9d05', slug: 'kevn', title: 'Kevn', status: 'archived' });
    listApi([storyFixture(), archived]);
    const c = await open('#/stories');
    expect(button(c, 'Record the sentences of “Rêya Dibistanê”')!.getAttribute('href')).toBe(`#/audio/stories?story=${STORY_ID}`);
    expect(button(c, 'Record the sentences of “Kevn”')).toBeNull();
    // and from the story itself
    await click(button(c, 'Rêya Dibistanê'));
    expect(button(c, 'Record its sentences')!.getAttribute('href')).toBe(`#/audio/stories?story=${STORY_ID}`);
  });
});

describe('the categories', () => {
  function categoriesApi() {
    const categories = CATEGORIES.map((c) => ({ ...c }));
    return {
      categories,
      api: fakeApi(
        on('GET', '/admin/story-categories', () => json({ categories: [...categories].sort((a, b) => a.position - b.position || a.slug.localeCompare(b.slug)) })),
        on('GET', /^\/admin\/stories\?category=/, (call) => json({ stories: [], total: call.path.includes('category=family') ? 2 : 0 })),
        on('POST', '/admin/story-categories', (call) => {
          const b = call.body as { slug: string; name: Record<string, string> };
          const created = { slug: b.slug, name: b.name as { en: string }, position: 7 };
          categories.push(created);
          return json(created, 201);
        }),
        on('PUT', /^\/admin\/story-categories\//, (call) => {
          const slug = decodeURIComponent(call.path.split('/').pop()!);
          const b = call.body as { name: Record<string, string>; position?: number };
          const c = categories.find((x) => x.slug === slug)!;
          c.name = b.name as { en: string };
          if (b.position !== undefined && b.position !== null) c.position = b.position;
          return json(c);
        }),
        on('DELETE', /^\/admin\/story-categories\//, (call) => {
          const [slug, query] = call.path.split('/').pop()!.split('?') as [string, string | undefined];
          if (slug === 'family' && !query) return failure(409, 'IN_USE', '2 stories are filed under this category — move them first, or force the delete', { count: 2 });
          categories.splice(categories.findIndex((x) => x.slug === slug), 1);
          return json({ slug, deleted: true, unfiled: slug === 'family' ? 2 : 0 });
        }),
      ),
    };
  }

  it('lists them with their names, slug, position and how many stories each files', async () => {
    categoriesApi();
    const c = await open('#/stories/categories');
    expect(text(c.querySelector('h1'))).toBe('Story categories');
    expect(rows(c)).toEqual(['Animal fables', 'Legends and history', 'Family', 'Everyday life']);
    const family = [...c.querySelectorAll('tbody tr')].find((r) => text(r).includes('Family'))!;
    expect(text(family)).toContain('Malbat');
    expect(text(family)).toContain('family');
    expect(text(family)).toContain('2');
    expect(button(c, 'All stories')!.getAttribute('href')).toBe('#/stories');
  });

  it('adds one with a slug made from its English name, and renames one', async () => {
    const { api } = categoriesApi();
    const c = await open('#/stories/categories');
    await click(button(c, 'New category'));
    const form = document.getElementById('story-category-form')!;
    const inputs = [...form.querySelectorAll('input')];
    const byLabel = (label: string): HTMLInputElement => inputs.find((i) => document.querySelector(`label[for="${i.id}"]`)?.textContent?.trim().startsWith(label))!;
    await type(byLabel('Name in English'), 'Riddles and jokes');
    expect(byLabel('Slug').value).toBe('riddles-and-jokes');
    await type(byLabel('Name in Kurdish (Kurmanji)'), 'Mamik û henek');
    await click(button(document.body, 'Add category'));
    expect(api.calls.find((call) => call.method === 'POST')!.body).toEqual({ slug: 'riddles-and-jokes', name: { en: 'Riddles and jokes', ku: 'Mamik û henek' } });
    expect(rows(c)).toContain('Riddles and jokes');
    expect(text(document.body.querySelector('.toasts'))).toContain('Added “Riddles and jokes”.');

    await click([...c.querySelectorAll('tbody tr')].find((r) => text(r).includes('Legends'))!.querySelector('button')!);
    const rename = document.getElementById('story-category-form')!;
    const en = [...rename.querySelectorAll('input')].find((i) => i.value === 'Legends and history')!;
    await type(en, 'Legends');
    await click(button(document.body, 'Save names'));
    const put = api.calls.find((call) => call.method === 'PUT')!;
    expect(put.path).toBe('/admin/story-categories/legend');
    expect(put.body).toEqual({ name: { en: 'Legends', ku: 'Efsane û dîrok' } });
    expect(rows(c)).toContain('Legends');
  });

  it('moves a category up by telling the rows that changed place their new positions', async () => {
    const { api } = categoriesApi();
    const c = await open('#/stories/categories');
    await click(button(c, 'Move “Family” up'));
    expect(api.calls.filter((call) => call.method === 'PUT').map((call) => [call.path, (call.body as { position: number }).position])).toEqual([
      ['/admin/story-categories/family', 2],
      ['/admin/story-categories/legend', 3],
    ]);
    expect(rows(c)).toEqual(['Animal fables', 'Family', 'Legends and history', 'Everyday life']);
    expect((button(c, 'Move “Animal fables” up') as HTMLButtonElement).disabled).toBe(true);
  });

  it('deletes a category, asking again with the count when stories are filed under it', async () => {
    const { api } = categoriesApi();
    const c = await open('#/stories/categories');
    await click([...c.querySelectorAll('tbody tr')].find((r) => text(r).includes('Everyday'))!.querySelector('button.danger')!);
    expect(confirm.mock.calls[0]![0]).toContain('Delete “Everyday life”?');
    expect(paths(api, 'DELETE')).toEqual(['/admin/story-categories/everyday']);
    expect(rows(c)).not.toContain('Everyday life');

    confirm.mockClear();
    await click([...c.querySelectorAll('tbody tr')].find((r) => text(r).includes('Family'))!.querySelector('button.danger')!);
    expect(confirm.mock.calls.map((call) => call[0])).toEqual([
      expect.stringContaining('Delete “Family”?'),
      expect.stringContaining('2 stories use “Family” Remove it from them and delete?'),
    ]);
    expect(paths(api, 'DELETE').slice(1)).toEqual(['/admin/story-categories/family', '/admin/story-categories/family?force=1']);
    expect(rows(c)).toEqual(['Animal fables', 'Legends and history']);

    // a no to the second question deletes nothing
    confirm.mockClear();
    api.use(on('DELETE', '/admin/story-categories/fable', failure(409, 'IN_USE', 'in use', { count: 1 })));
    confirm.mockImplementation((said) => !said.includes('Remove it from'));
    await click([...c.querySelectorAll('tbody tr')].find((r) => text(r).includes('Animal'))!.querySelector('button.danger')!);
    expect(paths(api, 'DELETE').at(-1)).toBe('/admin/story-categories/fable');
    expect(rows(c)).toContain('Animal fables');
  });
});

describe('the editor', () => {
  const saveButton = (c: HTMLElement) => button(c, /^Save draft|^Saving/) as HTMLButtonElement;

  it('checks the story as it is typed, the way the server will', async () => {
    listApi();
    const c = await open(`#/stories/${STORY_ID}`);
    expect(text(c.querySelector('.st-checks'))).toContain('Nothing to fix.');
    // nothing changed yet: nothing to save
    expect(saveButton(c).disabled).toBe(true);

    await click(button(c, 'Add a word'));
    await type(c.querySelector('#story-glossary-2-term'), 'dilo');
    await type(c.querySelector('#story-glossary-2-meanings-en'), 'heart');
    const problem = c.querySelector('#story-glossary-2-term-problems');
    expect(text(problem)).toBe('Must fix: “dilo” is not in the text as a whole word, so no reader would see it');
    expect(c.querySelector('#story-glossary-2-term')!.getAttribute('aria-invalid')).toBe('true');
    expect(saveButton(c).disabled).toBe(true);
    expect(text(c.querySelector('.st-actions'))).toContain('Fix the problem marked “Must fix” to save.');
    expect(text(c.querySelector('.st-check-group.is-error summary'))).toBe('Must fix to save (1)');
    expect(text(c.querySelector('.st-check-group.is-error .st-where'))).toBe('Glossary word 3');
    expect((button(c, 'Publish') as HTMLButtonElement | null) ?? button(c, 'Save and publish')).toBeTruthy();
    expect((button(c, 'Save and publish') as HTMLButtonElement).disabled).toBe(true);

    // as the reader would mark it: a whole word, in any case
    await type(c.querySelector('#story-glossary-2-term'), 'ŞÎLAN');
    expect(c.querySelector('#story-glossary-2-term-problems')).toBeNull();
    expect(text(c.querySelector('#story-glossary-2 .st-hint'))).toBe('Marked in paragraph 3');
    expect(saveButton(c).disabled).toBe(false);
  });

  it('shows the length and minutes of the text as it changes', async () => {
    listApi();
    const c = await open(`#/stories/${STORY_ID}`);
    expect(text(c.querySelector('.st-facts'))).toBe('72 words · Short · about 2 min to read');
    const body = (c.querySelector('#story-body') as HTMLTextAreaElement).value;
    await type(c.querySelector('#story-body'), `${body}\n\n${body}`);
    expect(text(c.querySelector('.st-facts'))).toBe('144 words · no length yet · about 3 min to read');
    // a draft may be between lengths; publishing may not
    expect(text(c.querySelector('#story-body-problems'))).toBe(
      'Before publishing: 144 words is between the lengths: the nearest is medium (150–250 words)',
    );
    expect(saveButton(c).disabled).toBe(false);
    expect((button(c, 'Save and publish') as HTMLButtonElement).disabled).toBe(true);
  });

  it('files the story: the level by its CEFR name, the category from the list, the tradition, the reading time', async () => {
    const api = listApi();
    api.use(
      on('PUT', AT, (call) => {
        const { readingMinutes, ...body } = call.body as { readingMinutes: number | null } & Record<string, unknown>;
        return json(storyFixture({ ...body, readingMinutesOverride: readingMinutes, readingMinutes: readingMinutes ?? 2, lockVersion: 5 }));
      }),
    );
    const c = await open(`#/stories/${STORY_ID}`);
    const level = c.querySelector('#story-level') as HTMLSelectElement;
    expect([...level.options].map((o) => o.text)).toEqual(['A1 — Beginner', 'A2 — Elementary', 'B1 — Intermediate', 'B2 — Upper intermediate', 'C1 — Advanced']);
    await choose(level, '2');
    const category = c.querySelector('#story-category') as HTMLSelectElement;
    expect([...category.options].map((o) => o.text)).toEqual(['Not filed yet', 'Animal fables', 'Legends and history', 'Family', 'Everyday life']);
    expect(category.value).toBe('everyday');
    await choose(category, 'fable');
    await click(c.querySelector('input[name="story-tradition"][value="adapted"]'));
    expect(text(c.querySelector('#story-tradition'))).toContain('Traditional material, retold freely for learners.');
    // an adapted story without a source is worth a look, and says so where the source goes
    expect(text(c.querySelector('#story-source-problems'))).toBe('Check: a traditional or adapted story should name where it comes from');
    await type(c.querySelector('#story-source'), 'Kurdish oral tradition');
    expect(c.querySelector('#story-source-problems')).toBeNull();
    await type(c.querySelector('#story-sourceUrl'), 'http://example.org');
    expect(text(c.querySelector('#story-sourceUrl-problems'))).toBe('Must fix: the source address must start with https://');
    await type(c.querySelector('#story-sourceUrl'), 'https://example.org/tale');
    expect((c.querySelector('#story-readingMinutes') as HTMLInputElement).placeholder).toBe('2');
    await type(c.querySelector('#story-readingMinutes'), '4');
    await click(saveButton(c));
    const sent = api.calls.find((call) => call.method === 'PUT')!.body as Record<string, unknown>;
    expect(sent).toMatchObject({ level: 2, category: 'fable', tradition: 'adapted', source: 'Kurdish oral tradition', sourceUrl: 'https://example.org/tale', readingMinutes: 4 });
    expect(text(c.querySelector('.st-notice'))).toBe('Saved.');
    // the preview says it the reader's way
    expect(text(c.querySelector('.st-pv-meta'))).toContain('A2 · Elementary');
    expect(text(c.querySelector('.st-pv-meta'))).toContain('Animal fables');
    expect(text(c.querySelector('.st-pv-meta'))).toContain('4 min');
    expect(text(c.querySelector('.st-pv-by'))).toBe('Traditional tale, retold for learners');
  });

  it('says a story cannot be published until it is filed under a category', async () => {
    listApi();
    const c = await open(`#/stories/${soranî.id}`);
    expect(text(c.querySelector('#story-category-problems'))).toBe('Before publishing: file the story under a category');
    expect((button(c, 'Publish') as HTMLButtonElement).disabled).toBe(true);
    expect(text(c.querySelector('.st-check-group.is-publish .st-where'))).toBe('Category');
  });

  it('chooses a cover from the shared pictures, or none, and keeps a key the pictures no longer have', async () => {
    const api = listApi();
    api.use(on('PUT', AT, (call) => json(storyFixture({ ...(call.body as object), lockVersion: 5 }))));
    const c = await open(`#/stories/${STORY_ID}`);
    const covers = c.querySelector('.st-covers')!;
    expect(covers.querySelectorAll('[role="radio"]')).toHaveLength(28);
    expect(button(covers, 'None')!.getAttribute('aria-checked')).toBe('true');
    expect(c.querySelector('.st-pv-cover')!.classList.contains('is-kilim')).toBe(true);
    await click(button(covers, 'Blue lake'));
    expect(button(covers, 'Blue lake')!.getAttribute('aria-checked')).toBe('true');
    expect(covers.querySelector('[aria-label="Blue lake"] img')!.getAttribute('src')).toBe('https://hevalo.app/cosmetics/backgrounds/made-06-gola-sin.webp');
    expect(c.querySelector('.st-pv-cover img')!.getAttribute('src')).toContain('made-06-gola-sin.webp');
    await click(saveButton(c));
    expect((api.calls.find((call) => call.method === 'PUT')!.body as { cover: string }).cover).toBe('gola-sin');

    unmount!();
    unmount = null;
    listApi([storyFixture({ cover: 'old-picture' })]);
    const again = await open(`#/stories/${STORY_ID}`);
    expect(button(again.querySelector('.st-covers')!, 'old-picture')!.getAttribute('aria-checked')).toBe('true');
    expect(text(again.querySelector('.st-covers')!.parentElement!)).toContain('not a picture the apps have');
  });

  it('checks each translation’s paragraphs against the text as it is typed, and shows the text beside it', async () => {
    const api = listApi();
    api.use(on('PUT', AT, (call) => json(storyFixture({ ...(call.body as object), lockVersion: 5 }))));
    const c = await open(`#/stories/${STORY_ID}`);
    const section = c.querySelector('#story-translations')!;
    expect(text(section.querySelector('.st-h2'))).toBe('Translations (0 of 9)');
    const summaries = [...section.querySelectorAll('summary')].map((el) => text(el));
    expect(summaries[0]).toBe('English Not translated');
    expect(summaries.map((s) => s.split(' Not')[0])).toEqual(['English', 'Kurdish (Kurmanji)', 'Kurdish (Sorani)', 'Dutch', 'German', 'Spanish', 'French', 'Turkish', 'Arabic']);
    await type(c.querySelector('#story-translations-en'), 'Rojîn is ten.\n\nThe road is long.');
    expect(text(section.querySelector('summary'))).toBe('English paragraphs: 2 of 3');
    expect(section.querySelector('summary .badge')!.classList.contains('danger')).toBe(true);
    expect(text(c.querySelector('#story-translations-en-problems'))).toContain('Must fix: the translation has 2 paragraphs and the text 3');
    expect(saveButton(c).disabled).toBe(true);
    // the text's paragraphs stand beside the translation to align them
    expect(section.querySelector('.st-translation')!.querySelectorAll('.st-translation-source li')).toHaveLength(3);
    await type(c.querySelector('#story-translations-en'), 'Rojîn is ten.\n\nThe road is long.\n\nTheir teacher is Şîlan.');
    expect(text(section.querySelector('summary'))).toBe('English paragraphs: 3 of 3');
    expect(section.querySelector('summary .badge')!.classList.contains('ok')).toBe(true);
    expect(text(section.querySelector('.st-h2'))).toBe('Translations (1 of 9)');
    // the preview shows it under each paragraph
    expect([...c.querySelectorAll('.st-pv-translation')].map((el) => text(el))).toEqual(['Rojîn is ten.', 'The road is long.', 'Their teacher is Şîlan.']);
    await click(saveButton(c));
    expect((api.calls.find((call) => call.method === 'PUT')!.body as { translations: Record<string, string> }).translations).toEqual({
      en: 'Rojîn is ten.\n\nThe road is long.\n\nTheir teacher is Şîlan.',
    });
  });

  it('marks the glossary words the dictionary knows', async () => {
    listApi([storyFixture({ glossaryMatches: [{ term: 'dilovan', entryId: 'e-1', headword: 'dilovan' }] })]);
    const c = await open(`#/stories/${STORY_ID}`);
    expect(text(c.querySelector('#story-glossary-0'))).toContain('In the dictionary');
    expect(text(c.querySelector('#story-glossary-1'))).toContain('Not in the dictionary — cannot be saved by learners');
  });

  it('cannot publish until a reviewer approves, and publishes once one has', async () => {
    const api = listApi();
    const c = await open(`#/stories/${STORY_ID}`);
    expect(text(c.querySelector('.st-badges'))).toContain('Unreviewed');
    expect((button(c, 'Publish') as HTMLButtonElement).disabled).toBe(true);
    expect(text(c.querySelector('.st-actions'))).toContain('A reviewer has to approve the story before it can be published');
    // submitting for review does not wait for approval
    expect((button(c, 'Submit for review') as HTMLButtonElement).disabled).toBe(false);

    const approved = storyFixture({ reviewStatus: 'approved', reviewedBy: { id: 'u-rev', username: 'dilan' }, reviewedAt: '2026-10-12T09:00:00.000Z', reviewNote: 'Read twice.', lockVersion: 5 });
    api.use(on('POST', `${AT}/review`, json(approved)), on('POST', `${AT}/publish`, json({ ...approved, status: 'published', lockVersion: 6, publishedAt: '2026-10-12T10:00:00.000Z' })));
    prompt.mockReturnValueOnce('Read twice.');
    await click(button(c, 'Approve'));
    expect(prompt.mock.calls[0]![0]).toContain('Approve “Rêya Dibistanê”?');
    expect(api.calls.find((call) => call.path === `${AT}/review`)!.body).toEqual({ approved: true, note: 'Read twice.', lockVersion: 4 });
    expect(text(c.querySelector('.st-notice'))).toBe('Approved: it can be published.');
    expect(text(c.querySelector('.st-badges'))).toContain('Approved');
    expect(text(c.querySelector('#story-review'))).toContain('Approved by @dilan');
    expect(text(c.querySelector('#story-review'))).toContain('Read twice.');
    expect((button(c, 'Publish') as HTMLButtonElement).disabled).toBe(false);
    await click(button(c, 'Publish'));
    expect(api.calls.at(-1)).toEqual({ method: 'POST', path: `${AT}/publish`, body: { lockVersion: 5 } });
    expect(text(c.querySelector('.st-notice'))).toBe('Published: learners can read it now.');
    // live: its approval cannot be withdrawn without unpublishing first
    expect(button(c, 'Withdraw approval')).toBeNull();
    expect(text(c.querySelector('#story-review'))).toContain('Unpublish the story first to withdraw its approval.');
  });

  it('warns that edits to the words need approving again, and withdraws approval with a note', async () => {
    const approved = storyFixture({ reviewStatus: 'approved', reviewedAt: '2026-10-12T09:00:00.000Z' });
    const api = listApi([approved]);
    api.use(on('POST', `${AT}/review`, json(storyFixture({ reviewStatus: 'unreviewed', reviewedAt: '2026-10-13T09:00:00.000Z', reviewNote: 'Names misspelled.', lockVersion: 5 }))));
    const c = await open(`#/stories/${STORY_ID}`);
    expect((button(c, 'Publish') as HTMLButtonElement).disabled).toBe(false);
    // the filing can change freely
    await type(c.querySelector('#story-author'), 'Someone');
    expect((button(c, 'Save and publish') as HTMLButtonElement).disabled).toBe(false);
    // the words cannot
    await type(c.querySelector('#story-summary'), 'Changed.');
    expect((button(c, 'Save and publish') as HTMLButtonElement).disabled).toBe(true);
    expect(text(c.querySelector('.st-actions'))).toContain('The unsaved edits change what was approved');
    expect(text(c.querySelector('#story-review'))).toContain('once saved, the story needs approving again');

    prompt.mockReturnValueOnce('Names misspelled.');
    await click(button(c, 'Withdraw approval'));
    expect(api.calls.find((call) => call.path === `${AT}/review`)!.body).toEqual({ approved: false, note: 'Names misspelled.', lockVersion: 4 });
    expect(text(c.querySelector('.st-notice'))).toBe('Approval withdrawn.');
    expect(text(c.querySelector('#story-review'))).toContain('Approval withdrawn');
    // the unsaved edits were not lost to the review
    expect((c.querySelector('#story-summary') as HTMLTextAreaElement).value).toBe('Changed.');
    // and the next save carries the version the review made
    api.use(on('PUT', AT, (call) => json(storyFixture({ ...(call.body as object), lockVersion: 6 }))));
    await click(saveButton(c));
    expect((api.calls.find((call) => call.method === 'PUT')!.body as { lockVersion: number }).lockVersion).toBe(5);
  });

  it('cancels a review when the note dialog is closed', async () => {
    const api = listApi();
    const c = await open(`#/stories/${STORY_ID}`);
    prompt.mockReturnValueOnce(null);
    await click(button(c, 'Approve'));
    expect(api.calls.some((call) => call.path.endsWith('/review'))).toBe(false);
  });

  it('features a story at once, without touching unsaved edits or the review', async () => {
    const api = listApi();
    api.use(on('POST', `${AT}/feature`, (call) => json(storyFixture({ featured: (call.body as { featured: boolean }).featured, lockVersion: 5 }))));
    const c = await open(`#/stories/${STORY_ID}`);
    await type(c.querySelector('#story-summary'), 'Mine.');
    await click(c.querySelector('.st-featured input[type="checkbox"]'));
    expect(api.calls.find((call) => call.path === `${AT}/feature`)!.body).toEqual({ featured: true, lockVersion: 4 });
    expect(text(c.querySelector('.st-notice'))).toContain('Featured');
    expect(text(c.querySelector('.st-badges'))).toContain('Featured');
    expect((c.querySelector('#story-summary') as HTMLTextAreaElement).value).toBe('Mine.');
    expect(text(c.querySelector('.st-badges'))).toContain('Unsaved changes');
  });

  it('shows the story’s sentences with their recordings, and records one into the lesson-audio store', async () => {
    const story = storyFixture({ audio: audioFixture() });
    const api = listApi([story]);
    api.use(on('PUT', /^\/admin\/lesson-audio\?text=/, json({ key: 's1', url: 'https://cdn.test/s1.wav', durationMs: 1200, updatedAt: '2026-10-13T10:00:00.000Z', speaker: 'hevalo', lipsync: null })));
    const c = await open(`#/stories/${STORY_ID}`);
    const section = c.querySelector('#story-audio')!;
    expect(text(section.querySelector('.st-h2'))).toBe('Audio (1 of 12 sentences recorded)');
    expect(button(section, 'Open in the audio studio')!.getAttribute('href')).toBe(`#/audio/stories?story=${STORY_ID}`);
    const items = [...section.querySelectorAll('.st-audio-row')];
    expect(items).toHaveLength(12);
    expect(text(items[0]!)).toContain('Paragraph 1 · sentence 1');
    expect(text(items[0]!)).toContain('Recorded · 1.8 s');
    expect(text(items[1]!)).toContain('Missing');
    expect((button(items[0]!, 'Play “Rojîn deh salî ye.”') as HTMLButtonElement).disabled).toBe(false);
    expect((button(items[1]!, 'No recording yet') as HTMLButtonElement).disabled).toBe(true);

    // open the second sentence, record and save: it goes up under its text, said by the remembered character
    await click(items[1]!.querySelector('.la-row-main'));
    const studio = section.querySelector('.rec')!;
    expect(studio.getAttribute('aria-label')).toBe('Record “Ew li gundekî biçûk dijî.”');
    await click(button(studio, 'Record'));
    await click(button(studio, 'Stop'));
    await click(button(studio, 'Save'));
    await settle(10);
    const put = api.calls.find((call) => call.method === 'PUT')!;
    expect(put.path).toBe(`/admin/lesson-audio?text=${encodeURIComponent('Ew li gundekî biçûk dijî.')}&speaker=hevalo`);
    expect(text(section.querySelector('.st-h2'))).toBe('Audio (2 of 12 sentences recorded)');
    expect(text(section.querySelectorAll('.st-audio-row')[1]!)).toContain('Recorded · 1.2 s');
    // the editor's own state is untouched: nothing to save
    expect(saveButton(c).disabled).toBe(true);
  });

  it('removes a sentence’s recording after asking, and asks again when a listening item plays it', async () => {
    const story = storyFixture({ audio: audioFixture() });
    const api = listApi([story]);
    api.use(
      on('DELETE', '/admin/lesson-audio?key=s0', failure(409, 'LISTENING_AUDIO_IN_USE', 'a listening item in “Greetings” plays this recording')),
      on('DELETE', '/admin/lesson-audio?key=s0&force=1', json({ ok: true })),
    );
    const c = await open(`#/stories/${STORY_ID}`);
    const section = c.querySelector('#story-audio')!;
    await click(section.querySelector('.st-audio-row .la-row-main'));
    await click(button(section, 'Remove'));
    expect(confirm.mock.calls.map((call) => call[0])).toEqual([
      expect.stringContaining('Remove the recording of “Rojîn deh salî ye.”?'),
      'A listening item plays this a listening item in “Greetings” plays this recording',
    ]);
    expect(paths(api, 'DELETE')).toEqual(['/admin/lesson-audio?key=s0', '/admin/lesson-audio?key=s0&force=1']);
    expect(text(section.querySelector('.st-h2'))).toBe('Audio (0 of 12 sentences recorded)');
  });

  it('says the sentences are of the saved text while the text has unsaved changes, and to save a new story first', async () => {
    listApi([storyFixture({ audio: audioFixture() })]);
    const c = await open(`#/stories/${STORY_ID}`);
    expect(c.querySelector('#story-audio .banner')).toBeNull();
    await type(c.querySelector('#story-body'), `${(c.querySelector('#story-body') as HTMLTextAreaElement).value}\n\nDawî.`);
    expect(text(c.querySelector('#story-audio .banner'))).toContain('The text has unsaved changes.');
    unmount!();
    unmount = null;
    const fresh = await open('#/stories/new');
    expect(text(fresh.querySelector('#story-audio'))).toContain('Save the story first');
  });

  it('links another telling of the same story, saved with the story, and unlinks one', async () => {
    const linked = storyFixture({ translationGroup: 'g-1', versions: [{ id: soranî.id, slug: soranî.slug, title: soranî.title, dialect: 'sorani', language: 'ku', status: 'in_review' }] });
    const api = listApi([linked, soranî, starter]);
    api.use(on('PUT', AT, (call) => json(storyFixture({ ...(call.body as object), lockVersion: 5 }))));
    const c = await open(`#/stories/${STORY_ID}`);
    const section = c.querySelector('#story-versions')!;
    expect(button(section, 'کلیلی ماڵەوە')!.getAttribute('href')).toBe(`#/stories/${soranî.id}`);
    expect(text(section)).toContain('Soranî');
    await click(button(section, 'Unlink from these'));
    expect(text(section)).toContain('Leaves the group when the story is saved');
    expect(saveButton(c).disabled).toBe(false);
    await click(button(section, 'Keep the link'));
    expect(saveButton(c).disabled).toBe(true);

    // finding a story of the other variety by its title
    expect((section.querySelector('select') as HTMLSelectElement).value).toBe('sorani');
    await choose(section.querySelector('select'), 'kurmanci');
    await type(section.querySelector('input[type="search"]'), 'Şorbeya');
    await debounce();
    expect(paths(api).at(-1)).toBe('/admin/stories?q=%C5%9Eorbeya&limit=10&dialect=kurmanci');
    await click(button(section, 'Link'));
    expect(text(section)).toContain('Linked to “Şorbeya Nîskê” when the story is saved.');
    await click(saveButton(c));
    expect((api.calls.find((call) => call.method === 'PUT')!.body as { sameStoryAs: string }).sameStoryAs).toBe(starter.id);
    // saved: nothing pending any more
    expect(text(c.querySelector('#story-versions'))).not.toContain('when the story is saved');
  });

  it('shows the evidence it points at, and lets a sentence be chosen in its paragraph', async () => {
    listApi();
    const c = await open(`#/stories/${STORY_ID}`);
    // six questions: closed until opened
    const first = c.querySelector('#story-questions-0') as HTMLDetailsElement;
    expect(first.open).toBe(false);
    await click(first.querySelector('summary'));
    expect(first.open).toBe(true);
    expect(text(first.querySelector('.st-evidence mark'))).toBe('Rojîn deh salî ye.');
    await choose(first.querySelector('#story-questions-0-evidenceSentence'), '1');
    expect(text(first.querySelector('.st-evidence mark'))).toBe('Ew li gundekî biçûk dijî.');
    await choose(first.querySelector('#story-questions-0-evidenceParagraph'), '1');
    expect(first.querySelector('.st-evidence mark')).toBeNull();
    expect(text(first.querySelector('.st-evidence'))).toContain('Rêya dibistanê dirêj e.');
    expect((first.querySelector('#story-questions-0-evidenceSentence') as HTMLSelectElement).value).toBe('');
  });

  it('keeps the evidence on its words when the text is reshaped, and asks for a look when they change', async () => {
    const api = listApi();
    const c = await open(`#/stories/${STORY_ID}`);
    const body = c.querySelector('#story-body') as HTMLTextAreaElement;
    // paragraph 2 split in two: question 5's sentence is in paragraph 3 now, question 3's in 4
    await type(body, body.value.replace('derbas dibin. ', 'derbas dibin.\n\n'));
    await click(c.querySelector('#story-questions-4 summary'));
    expect(text(c.querySelector('#story-questions-4 .st-evidence mark'))).toBe('Rojîn ji kulîlkên sor hez dike.');
    expect((c.querySelector('#story-questions-4-evidenceParagraph') as HTMLSelectElement).value).toBe('2');
    await click(c.querySelector('#story-questions-2 summary'));
    expect(text(c.querySelector('#story-questions-2 .st-evidence mark'))).toBe('Ew gelek dilovan e.');
    expect(text(c.querySelector('.st-checks'))).toContain('Nothing to fix.');

    await type(body, body.value.replace('Ew gelek dilovan e.', 'Ew pir dilovan e.'));
    expect(text(c.querySelector('#story-questions-2-evidenceSentence-problems'))).toBe(
      'Check: the sentence it points at was changed: check it still holds the answer',
    );
    expect(text(c.querySelector('#story-questions-2 summary'))).toContain('1 to check');

    // what is sent is the evidence where its words are now
    api.use(on('PUT', AT, (call) => json(storyFixture({ ...(call.body as object), lockVersion: 5 }))));
    await click(button(c, /^Save draft/));
    const sent = api.calls.find((call) => call.method === 'PUT')!.body as { questions: Array<{ evidenceParagraph: number; evidenceSentence: number }> };
    expect(sent.questions.slice(2, 5).map((q) => [q.evidenceParagraph, q.evidenceSentence])).toEqual([[3, 1], [3, 3], [2, 1]]);
    // saved, the new words are the ones chosen
    expect(c.querySelector('#story-questions-2-evidenceSentence-problems')).toBeNull();
  });

  it('saves with the version it loaded, then with the one the save returned', async () => {
    const api = listApi();
    api.use(on('PUT', AT, (call) => json(storyFixture({ ...(call.body as object), lockVersion: (call.body as { lockVersion: number }).lockVersion + 1 }))));
    const c = await open(`#/stories/${STORY_ID}`);
    await type(c.querySelector('#story-summary'), 'Rojîn û birayê wê.');
    expect(text(c.querySelector('.st-badges'))).toContain('Unsaved changes');
    await click(saveButton(c));
    expect(text(c.querySelector('.st-notice'))).toBe('Saved.');
    expect(text(c.querySelector('.st-badges'))).not.toContain('Unsaved changes');
    await type(c.querySelector('#story-summary'), 'Rojîn û birayê xwe.');
    await click(saveButton(c));
    const puts = api.calls.filter((call) => call.method === 'PUT');
    expect(puts.map((call) => (call.body as { lockVersion: number }).lockVersion)).toEqual([4, 5]);
    expect((puts[1]!.body as { summary: string }).summary).toBe('Rojîn û birayê xwe.');
  });

  it('when someone else changed the story, keeps the edits, saves nothing over theirs, and reloads on request', async () => {
    const api = listApi();
    api.use(on('PUT', AT, failure(409, 'STALE', 'someone else changed this story since you opened it — reload it first')));
    const c = await open(`#/stories/${STORY_ID}`);
    await type(c.querySelector('#story-summary'), 'Mine.');
    await click(saveButton(c));

    const banner = c.querySelector('.st-conflict');
    expect(banner?.getAttribute('role')).toBe('alert');
    expect(text(banner?.querySelector('strong'))).toBe('This story changed since you opened it.');
    expect(text(banner?.querySelector('.subtle'))).toContain('Someone else saved a change to it. Nothing of yours was saved over it.');
    // the edit is still on screen to copy; nothing else can be sent until it is reloaded
    expect((c.querySelector('#story-summary') as HTMLTextAreaElement).value).toBe('Mine.');
    expect(saveButton(c).disabled).toBe(true);
    expect((button(c, 'Delete') as HTMLButtonElement).disabled).toBe(true);
    expect(text(c.querySelector('.st-actions'))).toContain('Reload the story first.');

    const theirs = storyFixture({ summary: 'Theirs.', lockVersion: 9 });
    api.use(on('GET', AT, json(theirs)), on('PUT', AT, (call) => json({ ...theirs, ...(call.body as object), lockVersion: 10 })));
    await click(button(c, 'Reload the story'));
    // unsaved edits are only thrown away with a yes
    expect(confirm).toHaveBeenCalledWith('Reload the story as it is saved now? Your changes here will be lost.');
    expect(c.querySelector('.st-conflict')).toBeNull();
    expect((c.querySelector('#story-summary') as HTMLTextAreaElement).value).toBe('Theirs.');
    expect(text(c.querySelector('.st-notice'))).toBe('Reloaded: this is the story as it is saved now.');

    await type(c.querySelector('#story-summary'), 'Mine again.');
    await click(saveButton(c));
    expect((api.calls.filter((call) => call.method === 'PUT').at(-1)!.body as { lockVersion: number }).lockVersion).toBe(9);
    expect(text(c.querySelector('.st-notice'))).toBe('Saved.');
  });

  it('keeps the reload’s edits when the editor says no', async () => {
    const api = listApi();
    api.use(on('PUT', AT, failure(409, 'STALE', 'stale')));
    const c = await open(`#/stories/${STORY_ID}`);
    await type(c.querySelector('#story-summary'), 'Mine.');
    await click(saveButton(c));
    confirm.mockReturnValueOnce(false);
    const gets = api.calls.length;
    await click(button(c, 'Reload the story'));
    expect(api.calls.length).toBe(gets);
    expect((c.querySelector('#story-summary') as HTMLTextAreaElement).value).toBe('Mine.');
  });

  it('shows what the server refused, at the fields it names', async () => {
    const api = listApi();
    api.use(
      on('PUT', AT, failure(422, 'INVALID', 'the story has 1 problem to fix first', {
        errors: [{ code: 'PROMPT_TOO_LONG', path: 'questions[1].prompt', message: 'keep a question to 300 characters' }],
        warnings: [],
      })),
    );
    const c = await open(`#/stories/${STORY_ID}`);
    await type(c.querySelector('#story-summary'), 'Rojîn.');
    await click(saveButton(c));
    expect(text(c.querySelector('.st-notice'))).toBe('Not saved: the story has 1 problem to fix first. The problems are listed under Checks.');
    const refused = c.querySelector('.st-check-group.is-error');
    expect(text(refused?.querySelector('summary'))).toBe('The server refused it (1)');
    expect([...refused!.querySelectorAll('.st-go span')].map((el) => text(el))).toEqual([
      'Question 2 · prompt',
      'keep a question to 300 characters',
    ]);
    // the live checks agreeing with the old text does not make the refusal go away
    expect(c.querySelector('.st-clear')).toBeNull();
    // and taking the editor there opens the question
    await click(button(c, /^Question 2 · prompt/));
    expect((c.querySelector('#story-questions-1') as HTMLDetailsElement).open).toBe(true);
    expect(text(c.querySelector('#story-questions-1-prompt-problems'))).toBe('Must fix: keep a question to 300 characters');
  });

  it('says so when the server refuses to publish what no reviewer approved', async () => {
    const api = listApi([storyFixture({ reviewStatus: 'approved' })]);
    api.use(on('POST', `${AT}/publish`, failure(409, 'NOT_REVIEWED', 'a reviewer has to approve the story before it is published')));
    const c = await open(`#/stories/${STORY_ID}`);
    await click(button(c, 'Publish'));
    expect(text(c.querySelector('.st-notice'))).toBe('Not published: a reviewer has to approve the story before it is published. Approve it under Review first.');
  });

  it('asks before publishing a starter no native speaker has published, and publishes the saved version', async () => {
    const api = listApi();
    api.use(on('POST', `/admin/stories/${starter.id}/publish`, json({ ...starter, status: 'published', lockVersion: 5, publishedAt: '2026-10-12T10:00:00.000Z' })));
    const c = await open(`#/stories/${starter.id}`);
    await click(button(c, 'Publish'));
    expect(confirm.mock.calls[0]![0]).toContain('This is a starter story that no native speaker has published yet.');
    expect(api.calls.at(-1)).toEqual({ method: 'POST', path: `/admin/stories/${starter.id}/publish`, body: { lockVersion: 4 } });
    expect(text(c.querySelector('.st-notice'))).toBe('Published: learners can read it now.');
    expect(text(c.querySelector('.st-badges'))).toContain('Published');
    expect(text(c.querySelector('.st-badges'))).not.toContain('Starter');
    // published: read-only, and only unpublish, archive and delete
    expect((c.querySelector('#story-title') as HTMLInputElement).readOnly).toBe(true);
    expect([...c.querySelectorAll('.st-actions button')].map((b) => text(b))).toEqual(['Unpublish', 'Archive', 'Delete']);
  });

  it('keeps pointing out an address in random letters, and asks before publishing it', async () => {
    const random = storyFixture({ slug: 'kurmanci-k3m9xq', reviewStatus: 'approved' });
    const api = listApi([random]);
    api.use(on('POST', `${AT}/publish`, json({ ...random, status: 'published', lockVersion: 5 })));
    const c = await open(`#/stories/${STORY_ID}`);
    expect(text(c.querySelector('#story-slug-problems'))).toContain('Check: the address ends in random letters');
    confirm.mockReturnValueOnce(false);
    await click(button(c, 'Publish'));
    expect(confirm.mock.calls[0]![0]).toContain('Its address ends in random letters (kurmanci-k3m9xq).');
    expect(api.calls.filter((call) => call.method === 'POST')).toEqual([]);
    await click(button(c, 'Publish'));
    expect(api.calls.at(-1)).toEqual({ method: 'POST', path: `${AT}/publish`, body: { lockVersion: 4 } });
  });

  it('does not publish a starter when the editor says no', async () => {
    const api = listApi();
    const c = await open(`#/stories/${starter.id}`);
    confirm.mockReturnValueOnce(false);
    await click(button(c, 'Publish'));
    expect(api.calls.filter((call) => call.method === 'POST')).toEqual([]);
  });

  it('unpublishes a published story so it can be edited', async () => {
    const api = listApi();
    api.use(on('POST', `/admin/stories/${published.id}/unpublish`, json({ ...published, status: 'draft', lockVersion: 5 })));
    const c = await open(`#/stories/${published.id}`);
    expect(text(c)).toContain('Published: learners can read it, so it cannot be edited.');
    expect((c.querySelector('#story-body') as HTMLTextAreaElement).readOnly).toBe(true);
    expect((c.querySelector('#story-dialect') as HTMLSelectElement).disabled).toBe(true);
    expect((c.querySelector('#story-category') as HTMLSelectElement).disabled).toBe(true);
    await click(button(c, 'Unpublish'));
    expect(confirm.mock.calls[0]![0]).toContain('Learners stop seeing it at once');
    expect(text(c.querySelector('.st-notice'))).toBe('Unpublished: it is a draft again, and learners no longer see it.');
    expect((c.querySelector('#story-body') as HTMLTextAreaElement).readOnly).toBe(false);
    // reviewed once already: not marked as needing review again
    expect(text(c.querySelector('.st-badges'))).not.toContain('Starter');
  });

  it('says a story a game has used cannot be deleted, and goes back to the list after a delete', async () => {
    const api = listApi();
    api.use(on('DELETE', `${AT}?lockVersion=4`, failure(409, 'IN_USE', 'this story has been played, so it cannot be deleted — archive it instead')));
    const c = await open(`#/stories/${STORY_ID}`);
    await click(button(c, 'Delete'));
    expect(text(c.querySelector('.st-notice'))).toBe(
      'Not deleted: this story has been played, so it cannot be deleted — archive it instead.',
    );

    api.use(on('DELETE', `${AT}?lockVersion=4`, json({ id: STORY_ID, deleted: true })));
    await click(button(c, 'Delete'));
    expect(location.hash).toBe('#/stories');
    // said in a toast, which sits outside the page (it stays while a dialog makes the page inert)
    expect(text(document.body.querySelector('.toasts'))).toContain('Deleted “Rêya Dibistanê”.');
  });

  it('creates a new story at its own address with its first save, without loading it again', async () => {
    const api = listApi();
    const created = storyFixture({ id: '0b5c1a52-6c1e-4f43-9a37-2a1f6b6a9d09', title: 'Qelema Şîn ya Rojînê', slug: 'qelema-sin-ya-rojine', body: '', questions: [], glossary: [], summary: null, lockVersion: 0 });
    api.use(on('POST', '/admin/stories', json(created, 201)));
    const c = await open('#/stories/new');
    expect(text(c.querySelector('h1'))).toBe('New story');
    expect(saveButton(c).disabled).toBe(true);
    await type(c.querySelector('#story-title'), 'Qelema Şîn ya Rojînê');
    expect((c.querySelector('#story-slug') as HTMLInputElement).value).toBe('qelema-sin-ya-rojine');
    await click(saveButton(c));
    await settle();
    expect(api.calls.find((call) => call.method === 'POST')).toMatchObject({
      path: '/admin/stories',
      body: { title: 'Qelema Şîn ya Rojînê', slug: 'qelema-sin-ya-rojine', body: '', questions: [], glossary: [], tradition: 'original', category: null, translations: {} },
    });
    expect(location.hash).toBe(`#/stories/${created.id}`);
    expect(api.calls.some((call) => call.method === 'GET' && call.path === `/admin/stories/${created.id}`)).toBe(false);
    expect(text(c.querySelector('.st-notice'))).toBe('Saved.');
    expect(text(c.querySelector('.st-badges'))).toContain('Draft');
  });

  it('loads a story it created afresh when it is opened again later', async () => {
    const api = listApi();
    const created = storyFixture({ id: '0b5c1a52-6c1e-4f43-9a37-2a1f6b6a9d09', title: 'Nû', slug: 'nu-nu', lockVersion: 0 });
    api.use(on('POST', '/admin/stories', json(created, 201)), on('GET', `/admin/stories/${created.id}`, json({ ...created, lockVersion: 3 })));
    const c = await open('#/stories/new');
    await type(c.querySelector('#story-title'), 'Nû');
    await type(c.querySelector('#story-slug'), 'nu-nu');
    await click(saveButton(c));
    await settle();
    await click(button(c, 'All stories'));
    expect(location.hash).toBe('#/stories');
    location.hash = `#/stories/${created.id}`;
    await settle();
    expect(api.calls.filter((call) => call.method === 'GET' && call.path === `/admin/stories/${created.id}`)).toHaveLength(1);
    await type(c.querySelector('#story-summary'), 'Hinek.');
    api.use(on('PUT', `/admin/stories/${created.id}`, json({ ...created, lockVersion: 4 })));
    await click(saveButton(c));
    expect((api.calls.find((call) => call.method === 'PUT')!.body as { lockVersion: number }).lockVersion).toBe(3);
  });

  it('asks before removing a question with words in it, and keeps it on a no', async () => {
    listApi();
    const c = await open(`#/stories/${STORY_ID}`);
    const count = (): number => c.querySelectorAll('details.st-q').length;
    const before = count();
    const remove = (): Element => c.querySelector('details.st-q')!.querySelector('button.danger')!;
    confirm.mockReturnValueOnce(false);
    await click(remove());
    expect(confirm.mock.calls[0]![0]).toBe('Remove question 1? Its answers and explanation go with it.');
    expect(count()).toBe(before);
    await click(remove());
    expect(count()).toBe(before - 1);
    expect(text(c.querySelector('.st-badges'))).toContain('Unsaved changes');
  });

  it('says there is no such story for an address that is not one', async () => {
    fakeApi(on('GET', '/admin/stories/not-a-story', failure(400, 'VALIDATION_ERROR', 'request validation failed', [{ path: 'id', message: 'Invalid UUID' }])));
    const c = await open('#/stories/not-a-story');
    expect(text(c.querySelector('.banner'))).toBe('There is no such story. It may have been deleted.');
    expect(button(c, 'All stories')).not.toBeNull();
  });

  it('puts a Soranî story’s text right to left, in the fields and in the preview', async () => {
    listApi();
    const c = await open(`#/stories/${soranî.id}`);
    for (const id of ['#story-title', '#story-body', '#story-summary', '#story-glossary-0-term']) {
      expect(c.querySelector(id)!.getAttribute('dir')).toBe('rtl');
      expect(c.querySelector(id)!.getAttribute('lang')).toBe('ckb');
    }
    expect(c.querySelector('#story-glossary-0-meanings-en')!.getAttribute('dir')).toBe('ltr');
    expect(c.querySelector('.st-pv-text')!.getAttribute('dir')).toBe('rtl');
    expect(text(c)).toContain('In review: waiting for someone to read it and publish it.');
  });

  it('takes the editor to a problem in a translation folded away', async () => {
    listApi([storyFixture({ translations: { de: 'Eins.' } })]);
    const c = await open(`#/stories/${STORY_ID}`);
    const details = c.querySelector('#story-translations-de')!.closest('details') as HTMLDetailsElement;
    // a translation with a problem is open from the start; closed by hand, the check reopens it
    expect(details.open).toBe(true);
    details.open = false;
    await click(button(c, /^Translation \(German\)/));
    await new Promise((r) => requestAnimationFrame(r));
    expect(details.open).toBe(true);
  });
});

describe('leaving the editor', () => {
  const LEAVE = 'Leave without saving? Your changes here will be lost.';
  const summary = (c: HTMLElement) => c.querySelector<HTMLTextAreaElement>('#story-summary');

  // the back button, a link in the nav and a typed address change only the hash
  it('asks before the address changes under unsaved edits, and stays put on a no', async () => {
    listApi();
    const c = await open(`#/stories/${STORY_ID}`);
    await type(summary(c), 'Mine.');
    confirm.mockReturnValueOnce(false);
    location.hash = '#/stories';
    await settle();
    expect(confirm).toHaveBeenCalledWith(LEAVE);
    expect(location.hash).toBe(`#/stories/${STORY_ID}`);
    expect(summary(c)!.value).toBe('Mine.');
    expect(text(c.querySelector('.st-badges'))).toContain('Unsaved changes');

    // the back button asks the same; after a no it still goes back, and asks again
    confirm.mockReturnValueOnce(false);
    history.back();
    await settle();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(location.hash).toBe(`#/stories/${STORY_ID}`);
    expect(summary(c)!.value).toBe('Mine.');
    history.back();
    await settle();
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(location.hash).toBe('#/stories');
    expect(rows(c)).toEqual(['Rêya Dibistanê', 'Şorbeya Nîskê', 'کلیلی ماڵەوە', 'Qelema Şîn']);
  });

  it('does not ask when nothing would be lost', async () => {
    const api = listApi();
    api.use(on('PUT', AT, (call) => json(storyFixture({ ...(call.body as object), lockVersion: 5 }))));
    const c = await open(`#/stories/${STORY_ID}`);
    location.hash = '#/stories';
    await settle();
    expect(confirm).not.toHaveBeenCalled();
    expect(summary(c)).toBeNull();

    // nor once the edits are saved
    location.hash = `#/stories/${STORY_ID}`;
    await settle();
    await type(summary(c), 'Mine.');
    await click(button(c, /^Save draft/));
    expect(text(c.querySelector('.st-notice'))).toBe('Saved.');
    location.hash = '#/stories';
    await settle();
    expect(confirm).not.toHaveBeenCalled();
    expect(rows(c)).toHaveLength(4);
  });

  it('asks once, in its own words, when the editor itself moves on', async () => {
    const api = listApi();
    const c = await open(`#/stories/${STORY_ID}`);
    await type(summary(c), 'Mine.');
    await click(button(c, 'All stories'));
    expect(confirm.mock.calls).toEqual([[LEAVE]]);
    expect(location.hash).toBe('#/stories');

    // a delete asks its own question, not the leaving one as well
    confirm.mockClear();
    api.use(on('DELETE', `${AT}?lockVersion=4`, json({ id: STORY_ID, deleted: true })));
    await click(button(c, 'Rêya Dibistanê'));
    await type(summary(c), 'Mine again.');
    await click(button(c, 'Delete'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toContain('Your unsaved changes here are not kept.');
    expect(location.hash).toBe('#/stories');
    // said in a toast, which sits outside the page (it stays while a dialog makes the page inert)
    expect(text(document.body.querySelector('.toasts'))).toContain('Deleted “Rêya Dibistanê”.');
  });

  it('leaves the next story alone when a save comes back after its editor was left', async () => {
    const api = listApi();
    const created = storyFixture({ id: '0b5c1a52-6c1e-4f43-9a37-2a1f6b6a9d09', title: 'Nû', slug: 'nu-nu', lockVersion: 0 });
    api.use(on('POST', '/admin/stories', json(created, 201)));
    const answer = globalThis.fetch;
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      if (init?.method === 'POST') await held;
      return answer(input, init);
    });

    const c = await open('#/stories/new');
    await type(c.querySelector('#story-title'), 'Nû');
    await type(c.querySelector('#story-slug'), 'nu-nu');
    await click(button(c, /^Save draft/));
    // gone while it saves, and on to another story
    await click(button(c, 'All stories'));
    await click(button(c, 'Rêya Dibistanê'));
    await type(summary(c), 'Mine.');
    release();
    await settle();
    expect(location.hash).toBe(`#/stories/${STORY_ID}`);
    expect(summary(c)!.value).toBe('Mine.');
    // and its unsaved edits are still guarded
    confirm.mockClear();
    confirm.mockReturnValueOnce(false);
    location.hash = '#/stories';
    await settle();
    expect(confirm).toHaveBeenCalledWith(LEAVE);
    expect(summary(c)!.value).toBe('Mine.');
  });

  it('does not ask when a new story moves to its own address on its first save', async () => {
    const api = listApi();
    const created = storyFixture({ id: '0b5c1a52-6c1e-4f43-9a37-2a1f6b6a9d09', title: 'Nû', slug: 'nu-nu', lockVersion: 0 });
    api.use(on('POST', '/admin/stories', json(created, 201)));
    const c = await open('#/stories/new');
    await type(c.querySelector('#story-title'), 'Nû');
    await type(c.querySelector('#story-slug'), 'nu-nu');
    await click(button(c, /^Save draft/));
    await settle();
    expect(confirm).not.toHaveBeenCalled();
    expect(location.hash).toBe(`#/stories/${created.id}`);
    expect(text(c.querySelector('.st-notice'))).toBe('Saved.');
  });
});
