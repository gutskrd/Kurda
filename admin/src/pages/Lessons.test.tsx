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

  it('says when the server sent only the first part of the list, and leaves out counts it cannot know', async () => {
    fakeApi(on('GET', '/admin/content/lessons?status=all', json({ ...LIST, total: 640 })));
    location.hash = '#/lessons';
    renderUi(<Lessons />);
    expect(await screen.findByText('Showing the first 3 of 640 lessons. Search by title, skill or unit to find the rest.')).toBeInTheDocument();
    const tabs = screen.getByRole('tablist', { name: 'Status' });
    expect(within(tabs).getByRole('tab', { name: /in review/i })).not.toHaveTextContent('1');
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

describe('making a complete lesson quickly', () => {
  const EMPTY: LessonDetail = { ...DETAIL, exercises: [] };

  it('builds a set of exercises from the lesson’s words, ready to save', async () => {
    const user = userEvent.setup();
    const api = fakeApi(
      on('GET', '/admin/content/lessons/l-1', json(EMPTY)),
      on('PUT', '/admin/content/lessons/l-1', json({ ok: true, lockVersion: 5 })),
    );
    location.hash = '#/lessons/l-1';
    renderUi(<Lessons />);
    await user.click(await screen.findByRole('button', { name: 'Build from words' }));
    const drawer = await screen.findByRole('dialog', { name: 'Build exercises from words' });
    await user.type(within(drawer).getByLabelText('Words and phrases'), 'Silav = Hello{Enter}Spas = Thanks{Enter}Roj baş = Good day');
    expect(within(drawer).getByText('3 words: Silav · Spas · Roj baş')).toBeInTheDocument();
    // a kind left out is not made
    await user.click(within(drawer).getByLabelText(/Say it aloud/));
    await user.click(within(drawer).getByRole('button', { name: 'Add 10 exercises' }));
    expect(screen.getAllByRole('article')).toHaveLength(10);

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true));
    const sent = (api.calls.find((c) => c.method === 'PUT')!.body as { exercises: Array<{ type: string }> }).exercises;
    expect(sent.map((e) => e.type)).toEqual([
      'match_pairs',
      'multiple_choice',
      'multiple_choice',
      'multiple_choice',
      'translate',
      'translate',
      'translate',
      'listening',
      'listening',
      'listening',
    ]);
  });

  it('adds a conversation, written as characters and their lines, and saves it without the parts left empty', async () => {
    const user = userEvent.setup();
    const api = fakeApi(
      on('GET', '/admin/content/lessons/l-1', json(EMPTY)),
      on('PUT', '/admin/content/lessons/l-1', json({ ok: true, lockVersion: 5 })),
    );
    location.hash = '#/lessons/l-1';
    renderUi(<Lessons />);
    await user.click(await screen.findByRole('button', { name: 'Add a conversation' }));
    const card = screen.getByRole('article', { name: /1\s*Conversation/ });
    // Xezo and Hamo to start; a character already in it is not offered for another part
    expect(within(card).getByLabelText('Who plays part 1')).toHaveValue('xezo');
    expect(within(card).getByLabelText('Who plays part 2')).toHaveValue('hamo');
    expect(within(within(card).getByLabelText('Who plays part 2')).queryByRole('option', { name: 'Xezo' })).toBeNull();
    // the deer is the one left to add, and then nobody is
    await user.click(within(card).getByRole('button', { name: 'Add Hevalo' }));
    expect(within(card).getByLabelText('Who plays part 3')).toHaveValue('hevalo');
    expect(within(card).queryByRole('button', { name: /^Add (Xezo|Hamo|Hevalo)$/ })).toBeNull();
    await user.click(within(card).getByRole('button', { name: 'Remove Hevalo and their lines' }));
    await user.type(within(card).getByLabelText('Line 1, in Kurdish'), 'Silav! Tu çawa yî?');
    await user.type(within(card).getByLabelText('Line 1, what it means'), 'Hello! How are you?');
    await user.type(within(card).getByLabelText('Line 2, in Kurdish'), 'Ez baş im, spas.');
    await user.type(within(card).getByLabelText(/Question about it/), 'Hamo çawa ye?');
    await user.type(within(card).getByLabelText('Answer 1'), 'Baş e');
    await user.type(within(card).getByLabelText('Answer 2'), 'Nexweş e');
    // it cannot be recorded until it is saved
    expect(within(card).getByText('Save the draft, then record it: each person records their own part.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true));
    const [conversation] = (api.calls.find((c) => c.method === 'PUT')!.body as { exercises: Array<{ type: string; payload: Record<string, unknown> }> }).exercises;
    expect(conversation!.type).toBe('conversation');
    expect(conversation!.payload).toEqual({
      id: expect.stringMatching(/^[a-z0-9]{6,32}$/),
      speakers: [
        { name: 'Xezo', character: 'xezo' },
        { name: 'Hamo', character: 'hamo' },
      ],
      lines: [
        { speaker: 0, text: 'Silav! Tu çawa yî?', en: 'Hello! How are you?' },
        { speaker: 1, text: 'Ez baş im, spas.' },
      ],
      prompt: 'Hamo çawa ye?',
      options: ['Baş e', 'Nexweş e'],
      correctIndex: 0,
    });
    // saved, it is recorded on its own page
    expect(await within(card).findByRole('link', { name: 'Record this conversation' })).toHaveAttribute(
      'href',
      `#/audio/conversations/${String(conversation!.payload.id)}?lesson=l-1`,
    );
  });

  it('says what the lesson still needs before learners get it, with its recordings', async () => {
    const use = { courseId: 'c-1', courseTitle: 'K', unitId: 'u-1', unitTitle: 'Basics', skillId: 's-1', skillTitle: 'Greetings', lessonPosition: 1, lessonId: 'l-1', lessonTitle: 'Greetings 1', lessonStatus: 'draft', lessonVersion: 1, live: false, exerciseTypes: ['translate'], listeningNeedsIt: false };
    fakeApi(
      on('GET', '/admin/content/lessons/l-1', json(DETAIL)),
      on(
        'GET',
        '/admin/lesson-audio',
        json({
          items: [
            { key: 'silav', text: 'Silav', recorded: true, url: 'https://cdn.test/s.wav', durationMs: 900, updatedAt: null, usedIn: [use], unused: false },
            { key: 'spas', text: 'Spas', recorded: false, url: null, durationMs: null, updatedAt: null, usedIn: [{ ...use, listeningNeedsIt: true }], unused: false },
          ],
          summary: { needed: 2, recorded: 1, missing: 1, unused: 0 },
        }),
      ),
    );
    location.hash = '#/lessons/l-1';
    renderUi(<Lessons />);
    const checks = await screen.findByRole('region', { name: 'Before it goes to learners' });
    expect(within(checks).getByText('Titles in Kurdish and English')).toBeInTheDocument();
    expect(within(checks).getByText('2 exercises: 8 or more give a learner enough practice')).toBeInTheDocument();
    expect(await within(checks).findByText('1 of 2 sentences recorded')).toBeInTheDocument();
    expect(within(checks).getByText('A listening item has nothing to play: it can’t be published until recorded')).toBeInTheDocument();
    expect(within(checks).getByRole('link', { name: 'Record the rest' })).toHaveAttribute('href', '#/audio/lessons?lesson=s-1%3A1&show=missing');
  });
});
