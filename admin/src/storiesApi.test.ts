// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { DEFAULT_FILTER, draftFromForm, editorReducer, formFromStory, type AdminStory } from './stories';
import {
  categoryCounts,
  categoryInUse,
  createCategory,
  deleteCategory,
  featureStory,
  getStory,
  listCategories,
  listStories,
  reviewStory,
  runStoryAction,
  searchStories,
  statusCounts,
  storyFailure,
  updateCategory,
} from './storiesApi';
import { failure, fakeApi, json, on } from './test/fetch';
import { CATEGORIES, STORY_ID, storyFixture, summaryOf } from './test/stories';

const AT = `/admin/stories/${STORY_ID}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

function edited(story: AdminStory) {
  return editorReducer(formFromStory(story), { type: 'text', field: 'summary', value: 'Rojîn û birayê wê.' });
}

describe('reading', () => {
  it('asks the server for a page of the list, filtered, and opens one story', async () => {
    const story = storyFixture();
    const page = { stories: [summaryOf(story)], total: 61 };
    const api = fakeApi(on('GET', /^\/admin\/stories\?/, json(page)), on('GET', AT, json(story)));
    expect(await listStories(DEFAULT_FILTER)).toEqual(page);
    await listStories({ ...DEFAULT_FILTER, status: 'draft', dialect: 'sorani', level: 2, category: 'fable', review: 'approved', featured: true, query: ' Rêya ' }, 1);
    expect(await getStory(STORY_ID)).toEqual(story);
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /admin/stories?limit=50',
      'GET /admin/stories?q=R%C3%AAya&status=draft&dialect=sorani&level=2&category=fable&review=approved&featured=1&limit=50&offset=50',
      `GET ${AT}`,
    ]);
  });

  it('counts the status tabs with one single-row page per status, under the other filters', async () => {
    const api = fakeApi(
      on('GET', /^\/admin\/stories\?/, (call) => json({ stories: [], total: call.path.includes('status=published') ? 7 : call.path.includes('status=draft') ? 2 : 0 })),
    );
    expect(await statusCounts({ ...DEFAULT_FILTER, dialect: 'kurmanci' })).toEqual({ all: 9, draft: 2, in_review: 0, published: 7, archived: 0 });
    expect(api.calls.map((c) => c.path)).toEqual([
      '/admin/stories?status=draft&dialect=kurmanci&limit=50',
      '/admin/stories?status=in_review&dialect=kurmanci&limit=50',
      '/admin/stories?status=published&dialect=kurmanci&limit=50',
      '/admin/stories?status=archived&dialect=kurmanci&limit=50',
    ]);
  });

  it('finds other stories by title in one variety, for the versions picker', async () => {
    const story = storyFixture();
    const api = fakeApi(on('GET', /^\/admin\/stories\?/, json({ stories: [summaryOf(story)], total: 1 })));
    expect(await searchStories(' Rêya ', 'sorani')).toEqual([summaryOf(story)]);
    expect(api.calls[0]!.path).toBe('/admin/stories?q=R%C3%AAya&limit=10&dialect=sorani');
  });
});

describe('review and featuring', () => {
  it('approves with the version it loaded and an optional note', async () => {
    const story = storyFixture();
    const approved = storyFixture({ reviewStatus: 'approved', lockVersion: 5 });
    const api = fakeApi(on('POST', `${AT}/review`, json(approved)));
    expect(await reviewStory(story, true, 'Read twice.')).toEqual(approved);
    expect(await reviewStory(approved, false, null)).toEqual(approved);
    expect(api.calls.map((c) => c.body)).toEqual([
      { approved: true, note: 'Read twice.', lockVersion: 4 },
      { approved: false, note: null, lockVersion: 5 },
    ]);
  });

  it('features and unfeatures with the version it loaded', async () => {
    const story = storyFixture();
    const api = fakeApi(on('POST', `${AT}/feature`, (call) => json(storyFixture({ featured: (call.body as { featured: boolean }).featured, lockVersion: 5 }))));
    expect((await featureStory(story, true)).featured).toBe(true);
    expect(api.calls).toEqual([{ method: 'POST', path: `${AT}/feature`, body: { featured: true, lockVersion: 4 } }]);
  });
});

describe('categories', () => {
  it('lists, adds, renames and deletes them, and counts the stories filed under each', async () => {
    const api = fakeApi(
      on('GET', '/admin/story-categories', json({ categories: CATEGORIES })),
      on('POST', '/admin/story-categories', (call) => json({ ...(call.body as object), position: 8 }, 201)),
      on('PUT', '/admin/story-categories/fable', (call) => json({ slug: 'fable', ...(call.body as object) })),
      on('DELETE', '/admin/story-categories/fable', json({ slug: 'fable', deleted: true, unfiled: 0 })),
      on('DELETE', '/admin/story-categories/legend?force=1', json({ slug: 'legend', deleted: true, unfiled: 3 })),
      on('GET', /^\/admin\/stories\?category=/, (call) => json({ stories: [], total: call.path.includes('fable') ? 4 : 0 })),
    );
    expect(await listCategories()).toEqual(CATEGORIES);
    expect(await createCategory('riddles', { name: { en: 'Riddles' } })).toEqual({ slug: 'riddles', name: { en: 'Riddles' }, position: 8 });
    expect(await updateCategory('fable', { name: { en: 'Fables', ku: 'Fabl' }, position: 2 })).toEqual({ slug: 'fable', name: { en: 'Fables', ku: 'Fabl' }, position: 2 });
    expect(await deleteCategory('fable')).toMatchObject({ deleted: true });
    expect(await deleteCategory('legend', true)).toMatchObject({ unfiled: 3 });
    expect(await categoryCounts(['fable', 'legend'])).toEqual({ fable: 4, legend: 0 });
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /admin/story-categories',
      'POST /admin/story-categories',
      'PUT /admin/story-categories/fable',
      'DELETE /admin/story-categories/fable',
      'DELETE /admin/story-categories/legend?force=1',
      'GET /admin/stories?category=fable&limit=1',
      'GET /admin/stories?category=legend&limit=1',
    ]);
  });

  it('reads how many stories a refused delete was about', () => {
    expect(categoryInUse(new ApiError(409, 'IN_USE', '3 stories are filed under this category', { count: 3 }))).toBe(3);
    expect(categoryInUse(new ApiError(409, 'IN_USE', 'in use'))).toBe(0);
    expect(categoryInUse(new ApiError(404, 'NOT_FOUND', 'no such category'))).toBeNull();
    expect(categoryInUse(new TypeError('Failed to fetch'))).toBeNull();
  });
});

describe('saving', () => {
  it('creates a new story with its first save, the whole draft and the address shown', async () => {
    const story = storyFixture();
    const form = formFromStory(story);
    const api = fakeApi(on('POST', '/admin/stories', json(story, 201)));
    const outcome = await runStoryAction('save', { story: null, form, dirty: true });
    expect(outcome).toEqual({ ok: true, story });
    expect(api.calls).toEqual([{ method: 'POST', path: '/admin/stories', body: draftFromForm(form) }]);
    expect((api.calls[0]!.body as { slug: string }).slug).toBe('reya-dibistane');
  });

  it('replaces a draft with the version it was loaded at', async () => {
    const story = storyFixture();
    const saved = storyFixture({ lockVersion: 5, summary: 'Rojîn û birayê wê.' });
    const api = fakeApi(on('PUT', AT, json(saved)));
    const form = edited(story);
    expect(await runStoryAction('save', { story, form, dirty: true })).toEqual({ ok: true, story: saved });
    expect(api.calls).toEqual([{ method: 'PUT', path: AT, body: { ...draftFromForm(form), lockVersion: 4 } }]);
  });

  it('says so when someone else changed the story first, and overwrites nothing', async () => {
    const story = storyFixture();
    const api = fakeApi(on('PUT', AT, failure(409, 'STALE', 'someone else changed this story since you opened it — reload it first')));
    const outcome = await runStoryAction('publish', { story, form: edited(story), dirty: true });
    expect(outcome).toEqual({
      ok: false,
      failure: { kind: 'stale', message: 'someone else changed this story since you opened it — reload it first' },
      story: null,
    });
    // the publish never went out
    expect(api.calls.map((c) => c.method)).toEqual(['PUT']);
  });

  it('hands back the server’s problems by field when it refuses a story', async () => {
    const story = storyFixture();
    const problems = {
      errors: [{ code: 'GLOSS_NOT_IN_TEXT', path: 'glossary[0].term', message: '“dilo” is not in the text as a whole word' }],
      warnings: [{ code: 'NO_GIST', path: 'questions', message: 'no gist question' }],
    };
    fakeApi(on('PUT', AT, failure(422, 'INVALID', 'the story has 1 problem to fix first', problems)));
    const outcome = await runStoryAction('save', { story, form: edited(story), dirty: true });
    expect(outcome).toEqual({
      ok: false,
      failure: { kind: 'invalid', message: 'the story has 1 problem to fix first', validation: problems },
      story: null,
    });
  });

  it('files a refusal of the request’s shape under the field it names', () => {
    const err = new ApiError(400, 'VALIDATION_ERROR', 'request validation failed', [
      { path: 'questions.2.options.1', message: 'Too big' },
      { path: 'slug', message: 'lower-case letters, digits and dashes, 3 to 80 of them' },
    ]);
    expect(storyFailure(err)).toEqual({
      kind: 'invalid',
      message: 'request validation failed',
      validation: {
        errors: [
          { code: 'REQUEST', path: 'questions[2].options[1]', message: 'Too big' },
          { code: 'REQUEST', path: 'slug', message: 'lower-case letters, digits and dashes, 3 to 80 of them' },
        ],
        warnings: [],
      },
    });
  });

  it('reads every refusal the stories API makes', () => {
    const kind = (status: number, code: string) => storyFailure(new ApiError(status, code, 'm')).kind;
    expect(kind(409, 'SLUG_TAKEN')).toBe('slug_taken');
    expect(kind(409, 'IN_USE')).toBe('in_use');
    expect(kind(409, 'NOT_EDITABLE')).toBe('state');
    expect(kind(409, 'BAD_STATE')).toBe('state');
    expect(kind(409, 'NOT_REVIEWED')).toBe('not_reviewed');
    expect(kind(404, 'NOT_FOUND')).toBe('not_found');
    expect(kind(403, 'FORBIDDEN')).toBe('forbidden');
    expect(kind(500, 'INTERNAL_ERROR')).toBe('other');
    // a 422 without the list still says it was refused
    expect(storyFailure(new ApiError(422, 'INVALID', 'm'))).toEqual({ kind: 'invalid', message: 'm', validation: null });
    expect(storyFailure(new TypeError('Failed to fetch'))).toEqual({ kind: 'other', message: 'Failed to fetch' });
  });
});

describe('status changes', () => {
  it('publishes what is stored, with its version, when nothing is unsaved', async () => {
    const story = storyFixture();
    const published = storyFixture({ status: 'published', lockVersion: 5, publishedAt: '2026-10-12T10:00:00.000Z' });
    const api = fakeApi(on('POST', `${AT}/publish`, json(published)));
    expect(await runStoryAction('publish', { story, form: formFromStory(story), dirty: false })).toEqual({ ok: true, story: published });
    expect(api.calls).toEqual([{ method: 'POST', path: `${AT}/publish`, body: { lockVersion: 4 } }]);
  });

  it('saves unsaved edits first, then publishes the version the save made', async () => {
    const story = storyFixture();
    const saved = storyFixture({ lockVersion: 5, summary: 'Rojîn û birayê wê.' });
    const published = { ...saved, status: 'published' as const, lockVersion: 6 };
    const api = fakeApi(on('PUT', AT, json(saved)), on('POST', `${AT}/publish`, json(published)));
    expect(await runStoryAction('publish', { story, form: edited(story), dirty: true })).toEqual({ ok: true, story: published });
    expect(api.calls.map((c) => [c.method, c.path, (c.body as { lockVersion?: number }).lockVersion])).toEqual([
      ['PUT', AT, 4],
      ['POST', `${AT}/publish`, 5],
    ]);
  });

  it('keeps what was saved when the step after it is refused', async () => {
    const story = storyFixture();
    const saved = storyFixture({ lockVersion: 5 });
    fakeApi(
      on('PUT', AT, json(saved)),
      on('POST', `${AT}/submit`, failure(422, 'INVALID', 'the story has 1 problem to fix first', { errors: [], warnings: [] })),
    );
    const outcome = await runStoryAction('submit', { story, form: edited(story), dirty: true });
    expect(outcome).toMatchObject({ ok: false, failure: { kind: 'invalid' }, story: saved });
  });

  it('unpublishes and archives what is stored, without saving', async () => {
    const story = storyFixture({ status: 'published' });
    const api = fakeApi(on('POST', /\/(unpublish|archive)$/, (call) => json({ ...story, lockVersion: (call.body as { lockVersion: number }).lockVersion + 1 })));
    await runStoryAction('unpublish', { story, form: formFromStory(story), dirty: false });
    await runStoryAction('archive', { story, form: edited(story), dirty: true });
    expect(api.calls).toEqual([
      { method: 'POST', path: `${AT}/unpublish`, body: { lockVersion: 4 } },
      { method: 'POST', path: `${AT}/archive`, body: { lockVersion: 4 } },
    ]);
  });

  it('deletes with the version it was loaded at, and says when a game has used the story', async () => {
    const story = storyFixture();
    const api = fakeApi(on('DELETE', `${AT}?lockVersion=4`, json({ id: STORY_ID, deleted: true })));
    expect(await runStoryAction('delete', { story, form: formFromStory(story), dirty: false })).toEqual({ ok: true, story: null });
    expect(api.calls).toEqual([{ method: 'DELETE', path: `${AT}?lockVersion=4`, body: undefined }]);

    api.use(on('DELETE', `${AT}?lockVersion=4`, failure(409, 'IN_USE', 'this story has been played, so it cannot be deleted — archive it instead')));
    expect(await runStoryAction('delete', { story, form: formFromStory(story), dirty: false })).toEqual({
      ok: false,
      failure: { kind: 'in_use', message: 'this story has been played, so it cannot be deleted — archive it instead' },
      story: null,
    });
  });
});
