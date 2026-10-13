// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { draftFromForm, editorReducer, formFromStory, type AdminStory } from './stories';
import { getStory, listStories, runStoryAction, storyFailure } from './storiesApi';
import { failure, fakeApi, json, on } from './test/fetch';
import { STORY_ID, storyFixture, summaryOf } from './test/stories';

const AT = `/admin/stories/${STORY_ID}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

function edited(story: AdminStory) {
  return editorReducer(formFromStory(story), { type: 'text', field: 'summary', value: 'Rojîn û birayê wê.' });
}

describe('reading', () => {
  it('lists every story and opens one', async () => {
    const story = storyFixture();
    const api = fakeApi(on('GET', '/admin/stories', json({ stories: [summaryOf(story)] })), on('GET', AT, json(story)));
    expect(await listStories()).toEqual([summaryOf(story)]);
    expect(await getStory(STORY_ID)).toEqual(story);
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /admin/stories', `GET ${AT}`]);
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
