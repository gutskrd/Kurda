// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminStory } from '../stories';
import { failure, fakeApi, json, on } from '../test/fetch';
import { button, choose, click, render, settle, text, type } from '../test/dom';
import { STORY_ID, storyFixture, summaryOf } from '../test/stories';
import { Stories } from './Stories';

const AT = `/admin/stories/${STORY_ID}`;

let unmount: (() => void) | null = null;
let confirm: ReturnType<typeof vi.fn>;

beforeEach(() => {
  location.hash = '#/stories';
  confirm = vi.fn(() => true);
  vi.stubGlobal('confirm', confirm);
  sessionStorage.clear();
});

afterEach(() => {
  unmount?.();
  unmount = null;
  vi.unstubAllGlobals();
});

async function open(hash: string): Promise<HTMLElement> {
  location.hash = hash;
  const page = await render(<Stories />);
  unmount = page.unmount;
  return page.container;
}

const starter = storyFixture({
  id: '0b5c1a52-6c1e-4f43-9a37-2a1f6b6a9d02',
  slug: 'sorbeya-niske',
  title: 'Şorbeya Nîskê',
  source: 'starter',
  length: 'medium',
});
const soranî = storyFixture({
  id: '0b5c1a52-6c1e-4f43-9a37-2a1f6b6a9d03',
  slug: 'ckb-the-house-key',
  title: 'کلیلی ماڵەوە',
  dialect: 'sorani',
  status: 'in_review',
});
const published = storyFixture({
  id: '0b5c1a52-6c1e-4f43-9a37-2a1f6b6a9d04',
  slug: 'qelema-sin',
  title: 'Qelema Şîn',
  status: 'published',
  source: 'starter',
  publishedAt: '2026-10-05T10:00:00.000Z',
});

function listApi(stories: AdminStory[] = [storyFixture(), starter, soranî, published]) {
  return fakeApi(
    on('GET', '/admin/stories', json({
      stories: stories.map((s) =>
        summaryOf(s, s.id === starter.id ? { questionCount: 8, problems: { errors: 1, warnings: 2 } } : {}),
      ),
    })),
    ...stories.map((s) => on('GET', `/admin/stories/${s.id}`, json(s))),
  );
}

const rows = (c: HTMLElement): string[] => [...c.querySelectorAll('tbody tr')].map((r) => text(r.querySelector('td strong')));

describe('the list', () => {
  it('shows every story with what stands between it and publishing', async () => {
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
  });

  it('filters by status, variety and search, counting every story on the tabs', async () => {
    listApi();
    const c = await open('#/stories');
    expect(text(button(c, /^Draft/))).toBe('Draft (2)');
    await click(button(c, /^In review/));
    expect(rows(c)).toEqual(['کلیلی ماڵەوە']);
    await click(button(c, /^All/));
    await choose(c.querySelector('select[aria-label="Variety"]'), 'kurmanci');
    expect(rows(c)).toEqual(['Rêya Dibistanê', 'Şorbeya Nîskê', 'Qelema Şîn']);
    expect(text(button(c, /^All/))).toBe('All (3)');
    await type(c.querySelector('input[type="search"]'), 'sorbeya');
    expect(rows(c)).toEqual(['Şorbeya Nîskê']);
    await type(c.querySelector('input[type="search"]'), 'nothing like it');
    expect(text(c)).toContain('No story matches these filters.');
  });

  it('opens a story at its own address', async () => {
    const api = listApi();
    const c = await open('#/stories');
    await click(button(c, 'Şorbeya Nîskê'));
    expect(location.hash).toBe(`#/stories/${starter.id}`);
    expect(api.calls.at(-1)).toMatchObject({ method: 'GET', path: `/admin/stories/${starter.id}` });
    expect(text(c.querySelector('h1'))).toBe('Şorbeya Nîskê');
    expect(text(c)).toContain('Starter (needs native review)');
  });

  it('says when the role does not allow writing stories', async () => {
    fakeApi(on('GET', '/admin/stories', failure(403, 'FORBIDDEN', 'forbidden')));
    const c = await open('#/stories');
    expect(text(c)).toContain('Writing stories needs the content_editor, admin or superadmin role.');
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
    const random = storyFixture({ slug: 'kurmanci-k3m9xq' });
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
    expect(text(c.querySelector('.st-flash'))).toBe('Deleted “Rêya Dibistanê”.');
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
      body: { title: 'Qelema Şîn ya Rojînê', slug: 'qelema-sin-ya-rojine', body: '', questions: [], glossary: [] },
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
    await click(button(c, '← All stories'));
    expect(location.hash).toBe('#/stories');
    location.hash = `#/stories/${created.id}`;
    await settle();
    expect(api.calls.filter((call) => call.method === 'GET' && call.path === `/admin/stories/${created.id}`)).toHaveLength(1);
    await type(c.querySelector('#story-summary'), 'Hinek.');
    api.use(on('PUT', `/admin/stories/${created.id}`, json({ ...created, lockVersion: 4 })));
    await click(saveButton(c));
    expect((api.calls.find((call) => call.method === 'PUT')!.body as { lockVersion: number }).lockVersion).toBe(3);
  });

  it('says there is no such story for an address that is not one', async () => {
    fakeApi(on('GET', '/admin/stories/not-a-story', failure(400, 'VALIDATION_ERROR', 'request validation failed', [{ path: 'id', message: 'Invalid UUID' }])));
    const c = await open('#/stories/not-a-story');
    expect(text(c.querySelector('.card.empty'))).toBe('There is no such story. It may have been deleted.');
    expect(button(c, '← All stories')).not.toBeNull();
  });

  it('puts a Soranî story’s text right to left', async () => {
    listApi();
    const c = await open(`#/stories/${soranî.id}`);
    for (const id of ['#story-title', '#story-body', '#story-summary', '#story-glossary-0-term']) {
      expect(c.querySelector(id)!.getAttribute('dir')).toBe('rtl');
      expect(c.querySelector(id)!.getAttribute('lang')).toBe('ckb');
    }
    expect(c.querySelector('#story-glossary-0-meanings-en')!.getAttribute('dir')).toBe('ltr');
    expect(text(c)).toContain('In review: waiting for someone to read it and publish it.');
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
    await click(button(c, '← All stories'));
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
    expect(text(c.querySelector('.st-flash'))).toBe('Deleted “Rêya Dibistanê”.');
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
