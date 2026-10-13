// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { LessonDetail, LessonList, LessonRow } from '../lessons';
import { fakeApi, failure, json, on } from '../test/fetch';
import { renderUi } from '../test/render';
import { Lessons } from './Lessons';

function row(over: Partial<LessonRow>): LessonRow {
  return {
    id: 'l-1',
    skillId: 's-1',
    position: 1,
    version: 1,
    status: 'draft',
    titleKu: 'Silav 1',
    titleEn: 'Greetings 1',
    exerciseCount: 2,
    createdAt: '2026-10-01T10:00:00.000Z',
    publishedAt: null,
    liveId: null,
    course: { id: 'c-1', title: 'Kurmancî for beginners' },
    unit: { id: 'u-1', title: 'Basics', position: 1 },
    skill: { id: 's-1', title: 'Greetings', position: 1 },
    ...over,
  };
}

const LIST: LessonList = {
  total: 3,
  lessons: [
    row({}),
    row({ id: 'l-2', position: 2, titleEn: 'Greetings 2', titleKu: 'Silav 2', status: 'in_review' }),
    row({ id: 'l-3', skillId: 's-2', titleEn: 'Family 1', titleKu: 'Malbat 1', status: 'published', publishedAt: '2026-10-05T10:00:00.000Z' }),
  ],
  skills: [
    { id: 's-1', titleEn: 'Greetings', titleKu: 'Silav', unitTitle: 'Basics', courseTitle: 'Kurmancî for beginners', nextPosition: 3 },
    { id: 's-2', titleEn: 'Family', titleKu: 'Malbat', unitTitle: 'Family & food', courseTitle: 'Kurmancî for beginners', nextPosition: 2 },
  ],
};

const DETAIL: LessonDetail = {
  id: 'l-1',
  skillId: 's-1',
  position: 1,
  version: 1,
  status: 'draft',
  titleKu: 'Silav 1',
  titleEn: 'Greetings 1',
  lockVersion: 4,
  exercises: [
    { position: 1, type: 'translate', payload: { prompt: 'Hello', accepted: ['Silav'] } },
    { position: 2, type: 'multiple_choice', payload: { prompt: 'Spas means?', options: ['Thanks', 'Bye'], correctIndex: 0 } },
  ],
  skillTitle: 'Greetings',
  unitTitle: 'Basics',
  courseTitle: 'Kurmancî for beginners',
};

afterEach(() => {
  location.hash = '';
});

function titles(): string[] {
  const table = screen.getByRole('table', { name: 'Lessons' });
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0]!.querySelector('strong')?.textContent ?? '');
}

describe('the lesson list', () => {
  it('lists lessons by title with where they sit, counts them by status, and links each to the studio', async () => {
    fakeApi(on('GET', '/admin/content/lessons?status=all', json(LIST)));
    location.hash = '#/lessons';
    renderUi(<Lessons />);
    await waitFor(() => expect(titles()).toEqual(['Greetings 1', 'Greetings 2', 'Family 1']));
    const tabs = screen.getByRole('tablist', { name: 'Status' });
    expect(within(tabs).getByRole('tab', { name: /in review/i })).toHaveTextContent('1');
    expect(screen.getByRole('link', { name: 'Record the sentences of “Greetings 2”' })).toHaveAttribute('href', '#/audio/lessons?lesson=s-1%3A2');
    expect(screen.getByRole('link', { name: 'Open “Family 1”' })).toHaveAttribute('href', '#/lessons/l-3');
  });

  it('opens on the lessons in review from the dashboard’s link', async () => {
    fakeApi(on('GET', '/admin/content/lessons?status=all', json(LIST)));
    location.hash = '#/lessons?status=in_review';
    renderUi(<Lessons />);
    await waitFor(() => expect(titles()).toEqual(['Greetings 2']));
  });

  it('searches on the server, once typing stops', async () => {
    const user = userEvent.setup();
    const api = fakeApi(
      on('GET', '/admin/content/lessons?status=all', json(LIST)),
      on('GET', '/admin/content/lessons?status=all&q=family', json({ ...LIST, lessons: [LIST.lessons[2]!], total: 1 })),
    );
    location.hash = '#/lessons';
    renderUi(<Lessons />);
    await waitFor(() => expect(titles()).toHaveLength(3));
    await user.type(screen.getByRole('searchbox', { name: 'Search lessons' }), 'family');
    await waitFor(() => expect(titles()).toEqual(['Family 1']));
    // one request for the whole word, not one per letter
    expect(api.calls.filter((c) => c.path.includes('q=')).map((c) => c.path)).toEqual(['/admin/content/lessons?status=all&q=family']);
  });

  it('creates a draft in a skill chosen by name, at the next free position', async () => {
    const user = userEvent.setup();
    const api = fakeApi(on('GET', '/admin/content/lessons?status=all', json(LIST)), on('POST', '/admin/content/lessons', json({ lessonId: 'l-new' }, 201)));
    location.hash = '#/lessons';
    renderUi(<Lessons />);
    await user.click(await screen.findByRole('button', { name: 'New lesson' }));
    const drawer = screen.getByRole('dialog', { name: 'New lesson' });
    await user.selectOptions(within(drawer).getByLabelText(/^skill/i), 's-2');
    expect(within(drawer).getByLabelText('Position in the skill')).toHaveValue('2');
    await user.type(within(drawer).getByLabelText(/title in kurdish/i), 'Malbat 2');
    await user.type(within(drawer).getByLabelText(/title in english/i), 'Family 2');
    await user.click(within(drawer).getByRole('button', { name: 'Create draft' }));
    await waitFor(() => expect(location.hash).toBe('#/lessons/l-new'));
    expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({ skillId: 's-2', position: 2, titleKu: 'Malbat 2', titleEn: 'Family 2' });
  });
});

describe('the lesson editor', () => {
  it('edits exercises as forms and saves them with the lock version', async () => {
    const user = userEvent.setup();
    const api = fakeApi(
      on('GET', '/admin/content/lessons/l-1', json(DETAIL)),
      on('PUT', '/admin/content/lessons/l-1', json({ ok: true, lockVersion: 5 })),
    );
    location.hash = '#/lessons/l-1';
    renderUi(<Lessons />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Greetings 1' })).toBeInTheDocument();
    expect(screen.getByText('Kurmancî for beginners › Basics › Greetings · lesson 1')).toBeInTheDocument();

    const first = screen.getByRole('article', { name: /1\s*Translate/ });
    const prompt = within(first).getByLabelText(/sentence to translate/i);
    await user.clear(prompt);
    await user.type(prompt, 'Hello, friend');
    await user.click(within(first).getByRole('button', { name: 'Add another' }));
    await user.type(within(first).getByLabelText('Accepted answers: 2'), 'Silav heval');

    // the right answer of the second is chosen with a radio
    const second = screen.getByRole('article', { name: /2\s*Multiple choice/ });
    await user.click(within(second).getByLabelText('Answer 2 is the right one'));

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(api.calls.find((c) => c.method === 'PUT')!.body).toEqual({
      titleKu: 'Silav 1',
      titleEn: 'Greetings 1',
      lockVersion: 4,
      exercises: [
        { position: 1, type: 'translate', payload: { prompt: 'Hello, friend', accepted: ['Silav', 'Silav heval'] } },
        { position: 2, type: 'multiple_choice', payload: { prompt: 'Spas means?', options: ['Thanks', 'Bye'], correctIndex: 1 } },
      ],
    });
    expect(await screen.findByText('Draft saved.')).toBeInTheDocument();
  });

  it('marks what is missing before sending, and what the server refused after', async () => {
    const user = userEvent.setup();
    const api = fakeApi(
      on('GET', '/admin/content/lessons/l-1', json(DETAIL)),
      on('PUT', '/admin/content/lessons/l-1', {
        status: 422,
        body: { code: 'INVALID', message: 'invalid exercises', issues: [{ path: 'exercises[1].options.1', message: 'Too small: expected string to have >=1 characters' }] },
      }),
    );
    location.hash = '#/lessons/l-1';
    renderUi(<Lessons />);
    const first = await screen.findByRole('article', { name: /1\s*Translate/ });
    await user.clear(within(first).getByLabelText(/sentence to translate/i));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    // nothing is sent while a required field is empty, and the field says so
    expect(within(first).getByLabelText(/sentence to translate/i)).toHaveAccessibleDescription(/is needed/);
    expect(api.calls.some((c) => c.method === 'PUT')).toBe(false);

    await user.type(within(first).getByLabelText(/sentence to translate/i), 'Hello there');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    const second = screen.getByRole('article', { name: /2\s*Multiple choice/ });
    await waitFor(() => expect(within(second).getByText(/expected string/)).toBeInTheDocument());
    expect(within(second).getByLabelText('Answer 2')).toHaveAttribute('aria-invalid', 'true');
  });

  it('offers the JSON behind the forms, and checks it on the way back', async () => {
    const user = userEvent.setup();
    fakeApi(on('GET', '/admin/content/lessons/l-1', json(DETAIL)));
    location.hash = '#/lessons/l-1';
    renderUi(<Lessons />);
    await screen.findByRole('article', { name: /1\s*Translate/ });
    await user.click(screen.getByRole('tab', { name: 'JSON (advanced)' }));
    const area = screen.getByLabelText('Exercises as JSON');
    expect((area as HTMLTextAreaElement).value).toContain('"prompt": "Hello"');
    await user.clear(area);
    await user.type(area, '[[[[');
    await user.click(screen.getByRole('tab', { name: 'Form' }));
    expect(screen.getByText(/That is not valid JSON/)).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('tab', { name: 'JSON (advanced)' })).toHaveAttribute('aria-selected', 'true');
  });

  it('asks before removing an exercise', async () => {
    const user = userEvent.setup();
    fakeApi(on('GET', '/admin/content/lessons/l-1', json(DETAIL)));
    location.hash = '#/lessons/l-1';
    renderUi(<Lessons />);
    await user.click(await screen.findByRole('button', { name: 'Remove exercise 2' }));
    await user.click(within(screen.getByRole('alertdialog', { name: 'Remove exercise 2?' })).getByRole('button', { name: 'Remove' }));
    expect(screen.queryByRole('article', { name: /Multiple choice/ })).not.toBeInTheDocument();
    expect(screen.getByText('Unsaved changes', { selector: '.badge' })).toBeInTheDocument();
  });

  it('says which recordings a publish is waiting for, with a way to record them', async () => {
    const user = userEvent.setup();
    fakeApi(
      on('GET', '/admin/content/lessons/l-1', json({ ...DETAIL, status: 'in_review' })),
      on('POST', '/admin/content/lessons/l-1/approve', {
        status: 409,
        body: { code: 'LISTENING_AUDIO_MISSING', message: 'a listening item has nothing to play', missing: ['Ez baş im'] },
      }),
    );
    location.hash = '#/lessons/l-1';
    renderUi(<Lessons />);
    await user.click(await screen.findByRole('button', { name: 'Approve and publish' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('A listening item has nothing to play')).toBeInTheDocument();
    expect(screen.getByText(/“Ez baş im”/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Record them' })).toHaveAttribute('href', '#/audio/lessons?lesson=s-1%3A1&show=missing');
  });

  it('keeps a published lesson read-only, and starts a new version to change it', async () => {
    const user = userEvent.setup();
    const api = fakeApi(
      on('GET', '/admin/content/lessons/l-1', json({ ...DETAIL, status: 'published' })),
      on('POST', '/admin/content/lessons/l-1/new-version', json({ lessonId: 'l-1b' }, 201)),
    );
    location.hash = '#/lessons/l-1';
    renderUi(<Lessons />);
    const first = await screen.findByRole('article', { name: /1\s*Translate/ });
    expect(within(first).getByLabelText(/sentence to translate/i)).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start a new version' }));
    await waitFor(() => expect(location.hash).toBe('#/lessons/l-1b'));
    expect(api.calls.some((c) => c.path === '/admin/content/lessons/l-1/new-version')).toBe(true);
  });

  it('asks before leaving unsaved changes, in its own dialog, and goes on when told to', async () => {
    const user = userEvent.setup();
    fakeApi(on('GET', '/admin/content/lessons/l-1', json(DETAIL)), on('GET', '/admin/content/lessons?status=all', json(LIST)));
    location.hash = '#/lessons/l-1';
    renderUi(<Lessons />);
    const title = await screen.findByLabelText(/in english/i);
    await user.type(title, ' (new)');

    location.hash = '#/lessons';
    const ask = await screen.findByRole('alertdialog', { name: 'Leave without saving?' });
    await user.click(within(ask).getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(location.hash).toBe('#/lessons/l-1'));
    expect(screen.getByLabelText(/in english/i)).toHaveValue('Greetings 1 (new)');

    location.hash = '#/lessons';
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(location.hash).toBe('#/lessons'));
  });

  it('says when there is no such lesson', async () => {
    fakeApi(on('GET', '/admin/content/lessons/nope', failure(404, 'NOT_FOUND', 'no such lesson')));
    location.hash = '#/lessons/nope';
    renderUi(<Lessons />);
    expect(await screen.findByText('No such lesson.')).toBeInTheDocument();
  });
});
