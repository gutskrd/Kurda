import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
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
    await userEvent.click(await screen.findByRole('link', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Goodbye' })).toBeInTheDocument();
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
  it('shows each lesson done, up next or not open yet — in words — and opens a skill’s Tips', async () => {
    serve({
      'GET /courses/c1/map': basics,
      'GET /skills/greet/grammar': { skillId: 'greet', grammarMd: '# Silavkirin\n\n**Silav** — hello' },
    });
    routes('/app/learn/course/c1');

    expect(await screen.findByRole('heading', { level: 1, name: 'Kurmanji for Beginners' })).toBeInTheDocument();
    expect(screen.getByText('1 of 3 lessons done')).toBeInTheDocument();

    const hello = screen.getByRole('link', { name: /Hello.*Done/ });
    expect(hello).toHaveAttribute('href', '/app/learn/lesson/l1?course=c1');
    expect(screen.getByRole('link', { name: /Goodbye.*Up next/ })).toHaveAttribute('href', '/app/learn/lesson/l2?course=c1');
    // a lesson that is not open yet is not a link, and says why
    expect(screen.queryByRole('link', { name: /One to five/ })).not.toBeInTheDocument();
    expect(screen.getByText('One to five').closest('li')).toHaveTextContent('Not open yet');
    expect(screen.getByText('Finish the skill before this one to open it.')).toBeInTheDocument();

    const tips = screen.getByRole('button', { name: 'Tips' });
    expect(tips).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(tips);
    expect(tips).toHaveAttribute('aria-expanded', 'true');
    const note = await screen.findByRole('region', { name: 'Tips for Greetings' });
    expect(await within(note).findByRole('heading', { name: 'Silavkirin' })).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/skills/greet/grammar')).toHaveLength(1);

    await userEvent.click(screen.getByRole('link', { name: 'Continue' }));
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
