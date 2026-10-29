import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import type { InitialEntry } from 'react-router-dom';
import { renderApp, jsonResponse } from '../test/utils';
import type { CourseMap as Map, SkillNode } from '../learn/types';
import { Learn } from './Learn';
import { CourseMap } from './CourseMap';
import { Lesson } from './Lesson';
import { Review } from './Review';
import { NextLesson } from './NextLesson';

/*
 * The learning routes as a learner moves through them: Learn → a course's map
 * → a lesson → a review, and "your next lesson" after sign-up. Each test runs
 * the real routes against a scripted API.
 */

interface Call {
  method: string;
  path: string;
  body: unknown;
}

let calls: Call[] = [];

function serve(routes: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me', emailVerified: true } });
      calls.push({ method, path, body });
      const reply = routes[`${method} ${path}`];
      if (reply instanceof Response) return reply;
      if (reply === undefined) return jsonResponse(404, { code: 'NOT_FOUND', message: 'not found' });
      return jsonResponse(200, reply);
    }),
  );
}

/** Where the router is, so a test can see where a link or a redirect went. */
function Where(): React.JSX.Element {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function routes(at: InitialEntry): void {
  renderApp(
    <>
      <Routes>
        <Route path="/app/learn" element={<Learn />} />
        <Route path="/app/learn/course/:courseId" element={<CourseMap />} />
        <Route path="/app/learn/lesson/:lessonId" element={<Lesson />} />
        <Route path="/app/learn/review" element={<Review />} />
        <Route path="/app/learn/review/:sessionId" element={<Review />} />
        <Route path="/app/learn/next" element={<NextLesson />} />
      </Routes>
      <Where />
    </>,
    [at],
  );
}

const lesson = (id: string, completed = false, title = `Lesson ${id}`) => ({ lessonId: id, position: 1, title, completed });

const skill = (over: Partial<SkillNode>): SkillNode => ({
  skillId: 'sk',
  level: 1,
  title: 'Greetings',
  state: 'unlocked',
  strength: 0,
  hasGrammar: false,
  firstLessonId: null,
  lessons: [],
  ...over,
});

const basics: Map = {
  course: { id: 'c1', title: 'Kurmanji for Beginners' },
  units: [
    {
      unitId: 'u1',
      title: 'Basics',
      skills: [
        skill({ skillId: 'greet', title: 'Greetings', state: 'unlocked', hasGrammar: true, lessons: [lesson('l1', true, 'Hello'), lesson('l2', false, 'Goodbye')] }),
        skill({ skillId: 'num', title: 'Numbers', state: 'locked', lessons: [lesson('l3', false, 'One to five')] }),
      ],
    },
  ],
};

const newroz: Map = {
  course: { id: 'c2', title: 'Newroz' },
  units: [{ unitId: 'u2', title: 'Newroz', skills: [skill({ skillId: 'kawa', title: 'Kawa', lessons: [lesson('n1', false, 'The smith')] })] }],
};

const courses = {
  courses: [
    { id: 'c1', slug: 'kurmanji-basics', title: 'Kurmanji for Beginners', dialect: 'kurmanji' },
    { id: 'c2', slug: 'newroz-culture', title: 'Newroz', dialect: 'kurmanji' },
  ],
};

beforeEach(() => {
  calls = [];
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Learn', () => {
  it('lists every course with its progress and the lesson up next, and review first with what is due', async () => {
    serve({
      'GET /courses': courses,
      'GET /courses/c1/map': basics,
      'GET /courses/c2/map': newroz,
      'GET /practice/due': { due: 4, available: 9 },
    });
    routes('/app/learn');

    expect(await screen.findByText('Due now: 4')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start review' })).toHaveAttribute('href', '/app/learn/review');

    const first = (await screen.findByRole('heading', { name: 'Kurmanji for Beginners' })).closest('article')!;
    expect(within(first).getByText('Kurmancî')).toBeInTheDocument();
    expect(within(first).getByText('1 of 3 lessons done')).toBeInTheDocument();
    expect(within(first).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
    expect(within(first).getByText('Goodbye')).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/app/learn/lesson/l2?course=c1');
    expect(within(first).getByRole('link', { name: 'Course map' })).toHaveAttribute('href', '/app/learn/course/c1');

    // not only the first course: the Newroz one is there too, not started
    const second = screen.getByRole('heading', { name: 'Newroz' }).closest('article')!;
    expect(within(second).getByRole('link', { name: 'Start' })).toHaveAttribute('href', '/app/learn/lesson/n1?course=c2');
  });

  it('shows the quests of the day under today, read once, with a chest waiting', async () => {
    serve({
      'GET /courses': { courses: [] },
      'GET /practice/due': { due: 0, available: 0 },
      'GET /me/quests': {
        date: '2026-10-29',
        monthDone: 1,
        quests: [
          { id: 'q1', kind: 'streak', target: 1, progress: 1, chest: 'common', claimable: true, claimed: false },
          { id: 'q2', kind: 'xp', target: 40, progress: 15, chest: 'rare', claimable: false, claimed: false },
          { id: 'q3', kind: 'lessons', target: 2, progress: 1, chest: 'epic', claimable: false, claimed: false },
        ],
      },
    });
    routes('/app/learn');
    expect(await screen.findByRole('button', { name: 'Daily quests A chest to open! 1 of 3 done' })).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/me/quests')).toHaveLength(1);
  });

  it('offers a review left part-way through before a new one', async () => {
    serve({
      'GET /courses': { courses: [] },
      'GET /practice/due': { due: 4, available: 9, open: 'p1' },
    });
    routes('/app/learn');
    expect(await screen.findByText('You left a review part-way through. Your answers so far are saved.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue review' })).toHaveAttribute('href', '/app/learn/review/p1');
    expect(screen.queryByRole('link', { name: 'Start review' })).not.toBeInTheDocument();
  });

  it('opens the lesson up next under its own name', async () => {
    serve({
      'GET /courses': { courses: courses.courses.slice(0, 1) },
      'GET /courses/c1/map': basics,
      'GET /practice/due': { due: 0, available: 0 },
      'GET /lessons/l2/session': {
        sessionId: 's1',
        lessonId: 'l2',
        expiresAt: '2026-10-08T00:00:00Z',
        completed: false,
        exercises: [{ id: 'a', position: 1, type: 'translate', prompt: 'goodbye' }],
        answered: {},
        grammarMd: null,
        dialect: 'kurmanji',
      },
    });
    routes('/app/learn');
    // the path is Learn's home: the course furthest along, its lesson up next one tap away, Hevalo beside it
    const path = await screen.findByRole('region', { name: 'Kurmanji for Beginners' });
    expect(await within(path).findByRole('button', { name: 'Greetings, You are here, 1 of 2 lessons done' })).toBeInTheDocument();
    expect(path.querySelector('.lp-mascot [data-speaker="hevalo"]')).not.toBeNull();
    await userEvent.click(within(path).getByRole('link', { name: 'Continue: Greetings' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Greetings' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/app/learn/lesson/l2?course=c1');
    // and the lesson comes back to Learn, not to the course's own page
    expect(screen.getByRole('link', { name: 'Leave for now — your answers are saved' })).toHaveAttribute('href', '/app/learn');
  });

  it('offers a new learner the first lesson of the first course, and moves between courses', async () => {
    serve({
      'GET /courses': courses,
      'GET /courses/c1/map': { ...basics, units: [{ ...basics.units[0]!, skills: basics.units[0]!.skills.map((s) => ({ ...s, lessons: s.lessons.map((l) => ({ ...l, completed: false })) })) }] },
      'GET /courses/c2/map': newroz,
      'GET /practice/due': { due: 0, available: 0 },
    });
    routes('/app/learn');
    const first = await screen.findByRole('region', { name: 'Kurmanji for Beginners' });
    expect(await within(first).findByRole('link', { name: 'Start: Greetings' })).toHaveAttribute('href', '/app/learn/lesson/l1?course=c1');
    const switcher = screen.getByRole('navigation', { name: 'Your courses' });
    await userEvent.click(within(switcher).getByRole('link', { name: 'Newroz' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/app/learn?course=c2');
    expect(await screen.findByRole('link', { name: 'Start: Kawa' })).toHaveAttribute('href', '/app/learn/lesson/n1?course=c2');
    expect(screen.queryByRole('link', { name: 'Start: Greetings' })).not.toBeInTheDocument();
  });

  it('says how today is going in one row, kindly, without counting anything down', async () => {
    // /me is the session and the streak at once, so this one answers it itself
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const path = new URL(url).pathname;
        if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me', emailVerified: true, streak: { current: 5, longest: 9, freezes: 0, lastActiveOn: null } } });
        if (path === '/me/daily-goal') return jsonResponse(200, { goal: 20, effectiveGoal: 20, earnedXp: 12, progress: 0.6, completed: false });
        if (path === '/courses') return jsonResponse(200, { courses: [] });
        return jsonResponse(200, { due: 7, available: 9 });
      }),
    );
    routes('/app/learn');
    const today = await screen.findByRole('region', { name: 'Today' });
    const goal = await within(today).findByRole('progressbar', { name: 'Today’s goal' });
    expect(goal).toHaveAttribute('aria-valuenow', '60');
    expect(goal).toHaveAttribute('aria-valuetext', '12 of 20 XP today');
    expect(within(today).getByText('12/20 XP')).toBeInTheDocument();
    expect(within(today).getByText('5-day streak')).toBeInTheDocument();
    expect(within(today).getByRole('link', { name: '7 due' })).toHaveAttribute('href', '/app/learn/review');
  });

  it('opens the whole story of the streak from it, in a sheet that Escape closes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const path = new URL(url).pathname;
        const streak = { current: 12, longest: 30, freezes: 1, lastActiveOn: null, daysLearned: 41, sessionsPerFreeze: 5 };
        if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me', emailVerified: true, streak } });
        if (path === '/courses') return jsonResponse(200, { courses: [] });
        return jsonResponse(200, { due: 0, available: 0 });
      }),
    );
    routes('/app/learn');
    const today = await screen.findByRole('region', { name: 'Today' });
    const button = await within(today).findByRole('button', { name: '12-day streak' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    await userEvent.click(button);
    const sheet = screen.getByRole('dialog', { name: 'Streak' });
    expect(within(sheet).getByRole('heading', { name: '12-day streak' })).toBeInTheDocument();
    expect(within(sheet).getByText('Longest streak')).toBeInTheDocument();
    expect(within(sheet).getByRole('heading', { name: 'How your fire grows' })).toBeInTheDocument();
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(7);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('says what review is before there is anything in it, and keeps a course whose map failed', async () => {
    serve({
      'GET /courses': courses,
      'GET /courses/c1/map': basics,
      'GET /courses/c2/map': jsonResponse(500, { message: 'boom' }),
      'GET /practice/due': { due: 0, available: 0 },
    });
    routes('/app/learn');

    expect(await screen.findByText('What you answer in lessons comes back here, spread over days so it stays.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Start review' })).not.toBeInTheDocument();
    const second = (await screen.findByRole('heading', { name: 'Newroz' })).closest('article')!;
    expect(within(second).getByText('Your progress in this course could not be loaded.')).toBeInTheDocument();
    expect(within(second).getByRole('link', { name: 'Course map' })).toBeInTheDocument();
  });
});

describe('a course map', () => {
  it('draws the course as a path: each skill a stop that says what it is, in words', async () => {
    serve({
      'GET /courses/c1/map': basics,
      'GET /courses': courses,
      'GET /practice/due': { due: 0, available: 3 },
    });
    routes('/app/learn/course/c1');

    expect(await screen.findByRole('heading', { level: 1, name: 'Kurmanji for Beginners' })).toBeInTheDocument();
    expect(screen.getByText('1 of 3 lessons done')).toBeInTheDocument();

    // the unit's banner: its number, its name, what it covers
    const unit = screen.getByRole('region', { name: 'Basics' });
    expect(within(unit).getByText('Unit 1')).toBeInTheDocument();
    expect(within(unit).getByText('Greetings · Numbers')).toBeInTheDocument();
    expect(within(unit).getByText('0 of 2 done')).toBeInTheDocument();

    // every stop is a button with its whole state in its name
    expect(within(unit).getByRole('button', { name: 'Greetings, You are here, 1 of 2 lessons done' })).toBeInTheDocument();
    expect(within(unit).getByRole('button', { name: 'Numbers, Not open yet, 0 of 1 lessons done' })).toBeInTheDocument();
    expect(within(unit).getByRole('button', { name: 'Unit 1 trophy, not earned yet' })).toBeInTheDocument();
    // nothing due, so no review stop
    expect(within(unit).queryByRole('button', { name: /^Review/ })).not.toBeInTheDocument();

    // one tap from the map into the lesson up next
    expect(within(unit).getByRole('link', { name: 'Continue: Greetings' })).toHaveAttribute('href', '/app/learn/lesson/l2?course=c1');

    // the courses, to move between them
    expect(screen.getByRole('navigation', { name: 'Your courses' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Newroz' })).toHaveAttribute('href', '/app/learn/course/c2');
  });

  it('opens a card on a stop: its lessons as ways in, how far along, and one thing to do', async () => {
    serve({
      'GET /courses/c1/map': basics,
      'GET /practice/due': { due: 0, available: 3 },
      'GET /skills/greet/grammar': { skillId: 'greet', grammarMd: '# Silavkirin\n\n**Silav** — hello' },
    });
    routes('/app/learn/course/c1');

    const greetings = await screen.findByRole('button', { name: /^Greetings, You are here/ });
    expect(greetings).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(greetings);
    expect(greetings).toHaveAttribute('aria-expanded', 'true');
    const card = screen.getByRole('group', { name: 'Greetings' });
    expect(within(card).getByRole('link', { name: /Hello.*Done/ })).toHaveAttribute('href', '/app/learn/lesson/l1?course=c1');
    expect(within(card).getByRole('link', { name: /Goodbye.*Up next/ })).toHaveAttribute('href', '/app/learn/lesson/l2?course=c1');
    expect(within(card).getByText('1 of 2 lessons done')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/app/learn/lesson/l2?course=c1');

    // its Tips, fetched once, in a sheet of their own
    await userEvent.click(within(card).getByRole('button', { name: 'Tips' }));
    const tips = await screen.findByRole('dialog', { name: 'Tips for Greetings' });
    expect(await within(tips).findByRole('heading', { level: 3, name: 'Silavkirin' })).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/skills/greet/grammar')).toHaveLength(1);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // a locked one says, kindly, what opens it — and its lessons are not links yet
    await userEvent.click(screen.getByRole('button', { name: /^Numbers, Not open yet/ }));
    const locked = screen.getByRole('group', { name: 'Numbers' });
    expect(within(locked).getByText('Finish “Greetings” to open this one.')).toBeInTheDocument();
    expect(within(locked).queryByRole('link', { name: /One to five/ })).not.toBeInTheDocument();
    expect(within(locked).getByText('One to five').closest('li')).toHaveTextContent('Not open yet');

    // Escape closes it, back on its stop
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Numbers' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Numbers, Not open yet/ })).toHaveFocus();
  });

  it('says on a stop what its next lesson pays the first time through', async () => {
    serve({ 'GET /courses/c1/map': basics, 'GET /practice/due': { due: 0, available: 0 } });
    routes('/app/learn/course/c1');
    await userEvent.click(await screen.findByRole('button', { name: /^Greetings, You are here/ })!);
    expect(within(screen.getByRole('group', { name: 'Greetings' })).getByText('+10–20 XP')).toBeInTheDocument();
  });

  it('says what a lesson pays when it is played again, which is less', async () => {
    const done = { ...basics.units[0]!.skills[0]!, state: 'completed' as const, lessons: [lesson('l1', true, 'Hello'), lesson('l2', true, 'Goodbye')] };
    serve({ 'GET /courses/c1/map': { ...basics, units: [{ ...basics.units[0]!, skills: [done, basics.units[0]!.skills[1]!] }] }, 'GET /practice/due': { due: 0, available: 0 } });
    routes('/app/learn/course/c1');
    await userEvent.click(await screen.findByRole('button', { name: /^Greetings, Done/ }));
    expect(within(screen.getByRole('group', { name: 'Greetings' })).getByText('+3–5 XP, played again')).toBeInTheDocument();
  });

  it('shows what a lesson did on coming back: the ring filled, the skill finished, the next one opened, the bubble moved on', async () => {
    // as the path was drawn before the lesson: Greetings current with one lesson of two, Numbers closed
    sessionStorage.setItem('hevalo:path:c1', JSON.stringify({ 's:greet': { state: 'current', done: 1 }, 's:num': { state: 'locked', done: 0 } }));
    const after: Map = {
      ...basics,
      units: [
        {
          ...basics.units[0]!,
          skills: [
            { ...basics.units[0]!.skills[0]!, state: 'completed', lessons: [lesson('l1', true, 'Hello'), lesson('l2', true, 'Goodbye')] },
            { ...basics.units[0]!.skills[1]!, state: 'unlocked' },
          ],
        },
      ],
    };
    serve({ 'GET /courses/c1/map': after, 'GET /practice/due': { due: 0, available: 0 } });
    routes('/app/learn/course/c1');

    // first as it was: Greetings still current-looking, Numbers still closed, the bubble not yet moved
    const greet = await screen.findByRole('button', { name: /^Greetings/ });
    expect(greet).toHaveClass('is-current');
    expect(screen.getByRole('button', { name: /^Numbers/ })).toHaveClass('is-locked');
    expect(screen.queryByRole('link', { name: 'Start: Numbers' })).not.toBeInTheDocument();
    // then Greetings is finished, Numbers opens, and the bubble arrives there
    await waitFor(() => expect(greet).toHaveClass('is-done', 'is-finishing'), { timeout: 3000 });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Numbers/ })).toHaveClass('is-current', 'is-opening'), { timeout: 3000 });
    expect(await screen.findByRole('link', { name: 'Start: Numbers' }, { timeout: 3000 })).toHaveClass('is-arriving');
    // and the path as it is now is what next time is compared with
    expect(JSON.parse(sessionStorage.getItem('hevalo:path:c1')!)).toEqual({ 's:greet': { state: 'done', done: 2 }, 's:num': { state: 'current', done: 0 } });
  });

  it('moves along the path with the arrow keys', async () => {
    serve({ 'GET /courses/c1/map': basics, 'GET /practice/due': { due: 0, available: 0 } });
    routes('/app/learn/course/c1');
    const greetings = await screen.findByRole('button', { name: /^Greetings/ });
    greetings.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: /^Numbers/ })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('button', { name: /trophy/ })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(greetings).toHaveFocus();
  });

  it('puts review on the path when words are due, and a unit’s guide on its banner', async () => {
    serve({
      'GET /courses/c1/map': basics,
      'GET /practice/due': { due: 6, available: 12 },
      'GET /skills/greet/grammar': { skillId: 'greet', grammarMd: '# Silavkirin\n\n**Silav** — hello' },
    });
    routes('/app/learn/course/c1');

    const review = await screen.findByRole('button', { name: 'Review, words ready: 6' });
    await userEvent.click(review);
    expect(screen.getByRole('link', { name: 'Start review' })).toHaveAttribute('href', '/app/learn/review');

    await userEvent.click(screen.getByRole('button', { name: 'Guide' }));
    const guide = await screen.findByRole('dialog', { name: 'Guide to Basics' });
    expect(await within(guide).findByRole('heading', { level: 3, name: 'Silavkirin' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getAllByRole('link', { name: 'Continue' })[0]!);
    expect(screen.getByTestId('where')).toHaveTextContent('/app/learn/lesson/l2?course=c1');
  });
});

describe('a lesson', () => {
  it('opens the learner’s session and picks up at the first exercise not yet answered', async () => {
    serve({
      'GET /lessons/l2/session': {
        sessionId: 's1',
        lessonId: 'l2',
        expiresAt: '2026-10-08T00:00:00Z',
        completed: false,
        exercises: [
          { id: 'a', position: 1, type: 'translate', prompt: 'hello' },
          { id: 'b', position: 2, type: 'translate', prompt: 'goodbye' },
        ],
        answered: { a: { verdict: 'correct', accepted: true } },
        grammarMd: null,
        dialect: 'kurmanji',
      },
    });
    routes({ pathname: '/app/learn/lesson/l2', search: '?course=c1', state: { title: 'Goodbye' } });

    expect(await screen.findByText('goodbye')).toBeInTheDocument();
    expect(screen.queryByText('hello')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Goodbye' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Leave for now — your answers are saved' })).toHaveAttribute('href', '/app/learn/course/c1');
  });

  it('says when it cannot be opened, and can try again', async () => {
    serve({ 'GET /lessons/l9/session': jsonResponse(409, { code: 'LESSON_NOT_PUBLISHED', message: 'lesson is not published' }) });
    routes('/app/learn/lesson/l9');
    expect(await screen.findByText('This lesson could not be opened')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(calls.filter((c) => c.path === '/lessons/l9/session')).toHaveLength(2);
  });
});

describe('review', () => {
  const session = {
    sessionId: 'p1',
    exercises: [{ id: 'x', type: 'translate', prompt: 'apple', dialect: 'kurmanji' }],
  };

  it('starts a review of exactly the mistakes it is given, at an address of its own', async () => {
    serve({ 'POST /practice/session': session });
    routes({ pathname: '/app/learn/review', state: { exerciseIds: ['x'] } });

    expect(await screen.findByText('apple')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/app/learn/review/p1');
    const starts = calls.filter((c) => c.method === 'POST' && c.path === '/practice/session');
    expect(starts).toEqual([{ method: 'POST', path: '/practice/session', body: { exerciseIds: ['x'] } }]);
    // the session it was handed is not fetched again
    expect(calls.some((c) => c.path === '/practice/sessions/p1')).toBe(false);
  });

  it('comes back to a review left open', async () => {
    serve({ 'GET /practice/sessions/p1': { ...session, answered: {}, completed: false } });
    routes('/app/learn/review/p1');
    expect(await screen.findByText('apple')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/practice/session')).toBe(false);
  });

  it('“Practise these now” at the end of a review starts a new one, not the one it came from', async () => {
    serve({
      'GET /practice/sessions/p1': { ...session, answered: { x: { verdict: 'wrong', accepted: false } }, completed: true },
      'POST /practice/sessions/p1/complete': {
        correct: 0,
        total: 1,
        accuracy: 0,
        mistakes: [{ exerciseId: 'x', verdict: 'wrong', prompt: 'apple', correction: 'sêv' }],
        xpAwarded: 0,
        streak: { current: 1, longest: 1 },
      },
      'POST /practice/session': { sessionId: 'p2', exercises: [{ id: 'x', type: 'translate', prompt: 'apple again' }] },
    });
    routes('/app/learn/review/p1');
    await userEvent.click(await screen.findByRole('button', { name: 'Practise these now' }));

    expect(await screen.findByText('apple again')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/app/learn/review/p2');
    expect(calls.filter((c) => c.method === 'POST' && c.path === '/practice/session').map((c) => c.body)).toEqual([{ exerciseIds: ['x'] }]);
  });

  it('with nothing to review, points to a lesson', async () => {
    serve({ 'POST /practice/session': { empty: true, suggestion: { lessonId: 'l1', title: 'Hello' } } });
    routes('/app/learn/review');
    expect(await screen.findByText('Nothing to review yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Take a lesson' })).toHaveAttribute('href', '/app/learn/lesson/l1');
    expect(calls.filter((c) => c.path === '/practice/session')[0]!.body).toBeUndefined();
  });
});

describe('your next lesson', () => {
  it('opens the first lesson up next, in the first course that has one', async () => {
    const finished: Map = {
      course: { id: 'c1', title: 'Kurmanji for Beginners' },
      units: [{ unitId: 'u1', title: 'Basics', skills: [skill({ state: 'completed', lessons: [lesson('l1', true)] })] }],
    };
    serve({
      'GET /courses': courses,
      'GET /courses/c1/map': finished,
      'GET /courses/c2/map': newroz,
      'GET /lessons/n1/session': {
        sessionId: 's1',
        lessonId: 'n1',
        expiresAt: '2026-10-08T00:00:00Z',
        completed: false,
        exercises: [{ id: 'a', position: 1, type: 'translate', prompt: 'smith' }],
        answered: {},
        grammarMd: null,
        dialect: 'kurmanji',
      },
    });
    routes('/app/learn/next');
    expect(await screen.findByText('smith')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/app/learn/lesson/n1?course=c2');
  });

  it('goes to Learn when there is no lesson to open', async () => {
    serve({ 'GET /courses': { courses: [] }, 'GET /practice/due': { due: 0, available: 0 } });
    routes('/app/learn/next');
    expect(await screen.findByText('No courses available yet')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/app/learn');
  });
});
