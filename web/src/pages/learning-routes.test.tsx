import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import type { InitialEntry } from 'react-router-dom';
import { renderApp, jsonResponse } from '../test/utils';
import { todayView } from '../test/today';
import type { CourseMap as Map, SkillNode } from '../learn/types';
import { Learn } from './Learn';
import { CourseMap } from './CourseMap';
import { Lesson } from './Lesson';
import { Review } from './Review';
import { NextLesson } from './NextLesson';
import { onNotice } from '../lib/notice';

/* The learning routes as a learner moves through them (Learn, a course map, a lesson, a review, the next lesson after sign-up), against a scripted API. */

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
    // And beside it, the other kinds of practice.
    expect(screen.getByRole('link', { name: 'More ways to practise' })).toHaveAttribute('href', '/app/learn/practice');

    const first = (await screen.findByRole('heading', { name: 'Kurmanji for Beginners' })).closest('article')!;
    expect(within(first).getByText('Kurmancî')).toBeInTheDocument();
    expect(within(first).getByText('1 of 3 lessons done')).toBeInTheDocument();
    expect(within(first).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
    expect(within(first).getByText('Goodbye')).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/app/learn/lesson/l2?course=c1');
    expect(within(first).getByRole('link', { name: 'Course map' })).toHaveAttribute('href', '/app/learn/course/c1');

    // Not only the first course: the Newroz one is there too, not started.
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
    // The path is Learn's home: the course furthest along, its lesson up next one tap away, Hevalo beside it.
    const path = await screen.findByRole('region', { name: 'Kurmanji for Beginners' });
    expect(await within(path).findByRole('button', { name: 'Greetings, You are here, 1 of 2 lessons done' })).toBeInTheDocument();
    expect(path.querySelector('.lp-mascot [data-speaker="hevalo"]')).not.toBeNull();
    await userEvent.click(within(path).getByRole('link', { name: 'Continue: Greetings' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Greetings' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/app/learn/lesson/l2?course=c1');
    // And the lesson comes back to Learn, not to the course's own page.
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
    // /me is the session and the streak at once, so this one answers it itself.
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
    const goal = await within(today).findByRole('button', { name: 'Today’s goal, 12 of 20 XP today' });
    expect(goal).toHaveAttribute('aria-haspopup', 'dialog');
    expect(within(today).getByText('12/20 XP')).toBeInTheDocument();
    expect(within(today).getByText('5-day streak')).toBeInTheDocument();
    expect(within(today).getByRole('link', { name: '7 due' })).toHaveAttribute('href', '/app/learn/review');
  });

  // A passed goal says what was earned with a done mark, rather than "130/20 XP".
  it('says what was earned, with a done mark, once today’s goal is passed, not a fraction over it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const path = new URL(url).pathname;
        if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me', emailVerified: true, streak: { current: 5, longest: 9, freezes: 0, lastActiveOn: null } } });
        if (path === '/me/daily-goal') return jsonResponse(200, { goal: 20, effectiveGoal: 20, earnedXp: 130, progress: 1, completed: true });
        if (path === '/courses') return jsonResponse(200, { courses: [] });
        return jsonResponse(200, { due: 0, available: 9 });
      }),
    );
    routes('/app/learn');
    const today = await screen.findByRole('region', { name: 'Today' });
    expect(await within(today).findByRole('button', { name: 'Today’s goal is done' })).toBeInTheDocument();
    expect(within(today).getByText('130 XP')).toBeInTheDocument();
    expect(within(today).queryByText('130/20 XP')).not.toBeInTheDocument();
    expect(today.querySelector('.learn-strip-done')).not.toBeNull();
  });

  it('opens the daily view from it, in a sheet that Escape closes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const path = new URL(url).pathname;
        const streak = { current: 12, longest: 30, freezes: 1, lastActiveOn: null, daysLearned: 41, sessionsPerFreeze: 5 };
        if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me', emailVerified: true, streak } });
        if (path === '/me/today') return jsonResponse(200, todayView({ streak }));
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
    expect(await within(sheet).findByRole('heading', { name: '12-day streak' })).toBeInTheDocument();
    expect(within(within(sheet).getByRole('list', { name: 'This week' })).getAllByRole('listitem')).toHaveLength(7);
    expect(within(sheet).getByText('Longest streak')).toBeInTheDocument();
    expect(within(sheet).getByRole('heading', { name: 'How your fire grows' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('changes the daily goal from its ring, at once, and shows what the server then counts today', async () => {
    const sent: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = new URL(url).pathname;
        if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me', emailVerified: true, streak: { current: 2, longest: 2, freezes: 0, lastActiveOn: null } } });
        if (path === '/me/daily-goal' && init?.method === 'PUT') {
          sent.push(JSON.parse(init.body as string));
          return jsonResponse(200, { goal: 10, effectiveGoal: 10, earnedXp: 12, progress: 1, completed: true });
        }
        if (path === '/me/daily-goal') return jsonResponse(200, { goal: 20, effectiveGoal: 20, earnedXp: 12, progress: 0.6, completed: false });
        if (path === '/courses') return jsonResponse(200, { courses: [] });
        return jsonResponse(200, { due: 0, available: 0 });
      }),
    );
    routes('/app/learn');
    const today = await screen.findByRole('region', { name: 'Today' });
    await userEvent.click(await within(today).findByRole('button', { name: 'Today’s goal, 12 of 20 XP today' }));
    const sheet = screen.getByRole('dialog', { name: 'Today' });
    const goals = within(sheet).getByRole('group', { name: 'Goal: 20 XP' });
    expect(within(goals).getByRole('radio', { name: '20 XP a day' })).toBeChecked();
    expect(within(goals).getAllByRole('radio')).toHaveLength(4);

    await userEvent.click(within(goals).getByRole('radio', { name: '10 XP a day' }));
    expect(within(sheet).getByRole('radio', { name: '10 XP a day' })).toBeChecked();
    await waitFor(() => expect(sent).toEqual([{ goal: 10 }]));
    // A lower goal counts from today, so the strip's ring is met at once.
    expect(await within(today).findByRole('button', { name: 'Today’s goal is done' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('puts the saved goal back, with a notice, when the change is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = new URL(url).pathname;
        if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me', emailVerified: true } });
        if (path === '/me/daily-goal' && init?.method === 'PUT') return jsonResponse(503, { code: 'UNAVAILABLE', message: 'down' });
        if (path === '/me/daily-goal') return jsonResponse(200, { goal: 20, effectiveGoal: 20, earnedXp: 0, progress: 0, completed: false });
        if (path === '/courses') return jsonResponse(200, { courses: [] });
        return jsonResponse(200, { due: 0, available: 0 });
      }),
    );
    const said: string[] = [];
    const stop = onNotice((text) => said.push(text));
    routes('/app/learn');
    await userEvent.click(await screen.findByRole('button', { name: 'Today’s goal, 0 of 20 XP today' }));
    const sheet = screen.getByRole('dialog', { name: 'Today' });
    await userEvent.click(within(sheet).getByRole('radio', { name: '50 XP a day' }));
    await waitFor(() => expect(within(sheet).getByRole('radio', { name: '20 XP a day' })).toBeChecked());
    expect(said).toHaveLength(1);
    stop();
  });

  it('offers today’s word among the practice tools, opening its dictionary entry', async () => {
    serve({
      'GET /courses': { courses: [] },
      'GET /practice/due': { due: 0, available: 0 },
      'GET /dictionary/word-of-day': { word: { entryId: 'e42', headword: 'hêvî', pos: 'n', definitionEn: 'hope', definitionKu: null } },
    });
    routes('/app/learn');
    const tools = await screen.findByRole('region', { name: 'Practice' });
    const word = await within(tools).findByRole('link', { name: /Word of the day/ });
    expect(word).toHaveTextContent('hêvî');
    expect(word).toHaveTextContent('n · hope');
    expect(word).toHaveAttribute('href', '/app/dictionary?entry=e42');
  });

  it('leaves no gap among the tools on a day without a word', async () => {
    serve({
      'GET /courses': { courses: [] },
      'GET /practice/due': { due: 0, available: 0 },
      'GET /dictionary/word-of-day': { word: null },
    });
    routes('/app/learn');
    const tools = await screen.findByRole('region', { name: 'Practice' });
    await waitFor(() => expect(calls.some((c) => c.path === '/dictionary/word-of-day')).toBe(true));
    await waitFor(() => expect(within(tools).queryByText('Word of the day')).toBeNull());
    expect(tools.querySelector('.skeleton-late')).toBeNull();
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

    // The unit, named for its number and its name: a course without levels is one section, not named.
    const unit = screen.getByRole('region', { name: 'Chapter 1, Basics' });
    // The heading pinned over the path says the same, in the unit's colour.
    const pin = screen.getByTestId('lp-pin');
    expect(within(pin).getByText('Chapter 1')).toBeInTheDocument();
    expect(within(pin).getByText('Basics')).toBeInTheDocument();
    expect(screen.queryByText(/Section/)).not.toBeInTheDocument();

    // Every stop is a button with its whole state in its name.
    expect(within(unit).getByRole('button', { name: 'Greetings, You are here, 1 of 2 lessons done' })).toBeInTheDocument();
    expect(within(unit).getByRole('button', { name: 'Numbers, Not open yet, 0 of 1 lessons done' })).toBeInTheDocument();
    expect(within(unit).getByRole('button', { name: 'Chapter 1 trophy, not earned yet' })).toBeInTheDocument();
    // Nothing due, so no review stop.
    expect(within(unit).queryByRole('button', { name: /^Review/ })).not.toBeInTheDocument();

    // One tap from the map into the lesson up next.
    expect(within(unit).getByRole('link', { name: 'Continue: Greetings' })).toHaveAttribute('href', '/app/learn/lesson/l2?course=c1');

    // The courses, to move between them.
    expect(screen.getByRole('navigation', { name: 'Your courses' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Newroz' })).toHaveAttribute('href', '/app/learn/course/c2');
  });

  it('ends a chapter with Hamo’s story, shut until the chapter is done, and names the chapter on its way', async () => {
    const road: Map = {
      ...basics,
      units: [
        { ...basics.units[0]!, story: { slug: 'road-01-mevan-cay-u-sev', title: 'Mêvan, çay û sêv' } },
        {
          unitId: 'u2',
          title: 'Family',
          skills: [skill({ skillId: 'fam', title: 'Malbat', state: 'completed', lessons: [lesson('f1', true, 'Mother')] })],
          story: { slug: 'road-02-mevane-be-simbel', title: 'Mêvanê bê simbêl' },
        },
      ],
      upcoming: { number: 3, title: 'House and village', recordedBy: 'hamo' },
    };
    serve({ 'GET /courses/c1/map': road, 'GET /practice/due': { due: 0, available: 3 } });
    routes('/app/learn/course/c1');

    // Chapter 1 is not done: its story waits, rolled up, and says what opens it.
    const shut = await screen.findByRole('button', { name: 'Hamo’s story: Mêvan, çay û sêv, opens when the chapter is done' });
    await userEvent.click(shut);
    const card = screen.getByRole('group', { name: 'Hamo’s story' });
    expect(within(card).getByText('Finish the chapter, and Hamo tells you how it ends.')).toBeInTheDocument();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();

    // Chapter 2 is: its story opens in the reader.
    await userEvent.click(screen.getByRole('button', { name: 'Hamo’s story: Mêvanê bê simbêl' }));
    const open = screen.getByRole('group', { name: 'Hamo’s story' });
    expect(within(open).getByText('Mêvanê bê simbêl')).toHaveAttribute('lang', 'ku');
    expect(within(open).getByRole('link', { name: 'Read the story' })).toHaveAttribute('href', '/app/learn/stories/road-02-mevane-be-simbel');

    // The path stops at the last chapter online, and says the next is on its way, Hamo recording it.
    const next = screen.getByRole('region', { name: 'House and village' });
    expect(within(next).getByText('Chapter 3')).toBeInTheDocument();
    expect(within(next).getByText('On its way: Hamo is recording it now.')).toBeInTheDocument();
  });

  it('opens a card on a stop: the one to do now in violet with one button, a locked one saying what opens it', async () => {
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
    // The road's main button: its name, which lesson is next, and one button that says what it pays.
    const card = screen.getByRole('group', { name: 'Greetings' });
    expect(card).toHaveClass('is-go');
    expect(within(card).getByText('Lesson 2 of 2')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Continue +10–20 XP' })).toHaveAttribute('href', '/app/learn/lesson/l2?course=c1');

    // Its Tips, fetched once, in a sheet of their own.
    await userEvent.click(within(card).getByRole('button', { name: 'Tips' }));
    const tips = await screen.findByRole('dialog', { name: 'Tips for Greetings' });
    expect(await within(tips).findByRole('heading', { level: 3, name: 'Silavkirin' })).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/skills/greet/grammar')).toHaveLength(1);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // A locked one says, kindly, what opens it — and its lessons are not links yet.
    await userEvent.click(screen.getByRole('button', { name: /^Numbers, Not open yet/ }));
    const locked = screen.getByRole('group', { name: 'Numbers' });
    expect(within(locked).getByText('Finish “Greetings” to open this one.')).toBeInTheDocument();
    expect(within(locked).queryByRole('link', { name: /One to five/ })).not.toBeInTheDocument();
    expect(within(locked).getByText('One to five').closest('li')).toHaveTextContent('Not open yet');

    // Escape closes it, back on its stop.
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
    // As the path was drawn before the lesson: Greetings current with one lesson of two, Numbers closed.
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

    // First as it was: Greetings still current-looking, Numbers still closed, the bubble not yet moved.
    const greet = await screen.findByRole('button', { name: /^Greetings/ });
    expect(greet).toHaveClass('is-current');
    expect(screen.getByRole('button', { name: /^Numbers/ })).toHaveClass('is-locked');
    expect(screen.queryByRole('link', { name: 'Start: Numbers' })).not.toBeInTheDocument();
    // Then Greetings is finished, Numbers opens, and the bubble arrives there.
    await waitFor(() => expect(greet).toHaveClass('is-done', 'is-finishing'), { timeout: 3000 });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Numbers/ })).toHaveClass('is-current', 'is-opening'), { timeout: 3000 });
    expect(await screen.findByRole('link', { name: 'Start: Numbers' }, { timeout: 3000 })).toHaveClass('is-arriving');
    // And the path as it is now is what next time is compared with, rounds and rings with it.
    expect(JSON.parse(sessionStorage.getItem('hevalo:path:c1')!)).toEqual({
      's:greet': { state: 'done', done: 2, rounds: 1, pieces: 0 },
      's:num': { state: 'current', done: 0, rounds: 0, pieces: 0 },
    });
  });

  it('marks no learner on the road, and lists every unit on a rail that goes to it', async () => {
    serve({ 'GET /courses/c1/map': basics, 'GET /courses': courses, 'GET /practice/due': { due: 0, available: 0 } });
    routes('/app/learn/course/c1');
    await screen.findByRole('button', { name: /^Greetings/ });
    // The stop to do now says where the learner is; no figure stands on it.
    expect(screen.queryByTestId('lp-learner')).not.toBeInTheDocument();
    // The rail beside the path: every unit by its number and name, the one the learner is in marked.
    const rail = screen.getAllByRole('navigation', { name: 'Course map' })[0]!;
    const here = within(rail).getByRole('button', { name: 'Chapter 1, Basics' });
    expect(here).toHaveAttribute('aria-current', 'step');
    await userEvent.click(here);
    expect(screen.getByRole('button', { name: /^Greetings/ })).toHaveFocus();
    // Where there is no room for the rail, the heading's flag opens it in a sheet.
    await userEvent.click(screen.getByRole('button', { name: 'Course map' }));
    const sheet = await screen.findByRole('dialog', { name: 'Course map' });
    expect(within(sheet).getByRole('button', { name: 'Chapter 1, Basics' })).toBeInTheDocument();
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
    // The unit's grammar is its heading's guide, not a stop: the first stop on the path is its first skill.
    await userEvent.keyboard('{Home}');
    expect(greetings).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: /^Numbers/ })).toHaveFocus();
  });

  /** A course in three sections, as the road is: the first finished, the learner in the second, the third still shut. */
  const sections = (): Map => {
    const played = (id: string, times: number[]) =>
      skill({ skillId: id, title: `Topic ${id}`, state: 'gold', strength: 90, lessons: times.map((n, i) => ({ ...lesson(`${id}${i + 1}`, true, `Lesson ${id}${i + 1}`), times: n })) });
    return {
      course: { id: 'c1', title: 'The Kurmanji Road' },
      units: [
        { unitId: 'r1', title: 'Hello', level: 'A1', skills: [played('a', [1, 1]), played('b', [2, 1])], story: { slug: 'road-01-tale', title: 'Mêvan' } },
        {
          unitId: 'r2',
          title: 'Family',
          level: 'A2',
          skills: [played('c', [3, 3]), skill({ skillId: 'd', title: 'Topic d', lessons: [{ ...lesson('d1', true, 'Lesson d1'), times: 1 }, lesson('d2', false, 'Lesson d2')] })],
          story: { slug: 'road-02-tale', title: 'Malbat' },
        },
        { unitId: 'r3', title: 'House', level: 'A2', skills: [skill({ skillId: 'e', title: 'Topic e', state: 'locked', lessons: [lesson('e1')] })] },
        { unitId: 'r4', title: 'Market', level: 'B1', skills: [skill({ skillId: 'f', title: 'Topic f', state: 'locked', lessons: [lesson('f1')] })] },
      ],
    };
  };

  it('shows the course a section at a time: the learner’s open, the one before folded into a card, the one after shut', async () => {
    serve({ 'GET /courses/c1/map': sections(), 'GET /practice/due': { due: 0, available: 0 } });
    routes('/app/learn/course/c1');

    // The open section: its units named under the section's number.
    expect(await screen.findByRole('region', { name: 'Section 2, Chapter 2, Family' })).toBeInTheDocument();
    expect(within(screen.getByTestId('lp-pin')).getByText('Section 2 · Chapter 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Chapter 3, House' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Topic d, You are here, 1 of 2 lessons done' })).toBeInTheDocument();

    // The finished one before it, by the app's plain name for its level, never its CEFR letter.
    const done = screen.getByTestId('lp-section-1');
    expect(within(done).getByText('Starter')).toBeInTheDocument();
    expect(within(done).getByText('Section complete')).toBeInTheDocument();
    expect(within(done).queryByText(/A1/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Topic a/ })).not.toBeInTheDocument();

    // The shut one after it: what it is, how many chapters, what opens it; it does not open, but offers the test into it.
    const shut = screen.getByTestId('lp-section-3');
    expect(within(shut).getByText('Intermediate')).toBeInTheDocument();
    expect(within(shut).getByText('One chapter')).toBeInTheDocument();
    expect(within(shut).getByText('Opens when Section 2 is done')).toBeInTheDocument();
    expect(shut.tagName).not.toBe('BUTTON');
    expect(within(shut).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Jump ahead to Chapter 4: a short test opens it']);

    // Pressed, the finished one opens again, and the learner's own folds into a card that says they are there.
    expect(done).toHaveAccessibleName('Section 1, Starter, First words and short sentences, Section complete, One chapter');
    await userEvent.click(done);
    expect(screen.getByRole('button', { name: 'Topic a, Done — strong, round 2 of 3, 0 of 2 lessons' })).toBeInTheDocument();
    const here = screen.getByTestId('lp-section-2');
    expect(within(here).getByText('You are here · 0 of 2 chapters done')).toBeInTheDocument();
    await userEvent.click(here);
    expect(screen.getByRole('button', { name: /^Topic d, You are here/ })).toBeInTheDocument();
  });

  it('offers a test into a later chapter on its first stop and on its section’s card, saying what the test is', async () => {
    serve({ 'GET /courses/c1/map': sections(), 'GET /practice/due': { due: 0, available: 0 } });
    routes('/app/learn/course/c1');

    // Chapter 3's first stop, in the open section, is the offer rather than its card.
    await userEvent.click(await screen.findByRole('button', { name: 'Jump ahead to Chapter 3: a short test opens it' }));
    const offer = screen.getByRole('dialog', { name: 'Jump to Chapter 3?' });
    expect(within(offer).getByText('Chapter 3 · House')).toBeInTheDocument();
    expect(within(offer).getByText('About 10 questions')).toBeInTheDocument();
    expect(within(offer).getByText('Passed with 2 mistakes or fewer')).toBeInTheDocument();
    expect(within(offer).getByRole('link', { name: 'Start the test' })).toHaveAttribute('href', '/app/learn/jump/c1/r3');
    await userEvent.keyboard('{Escape}');

    // The shut section after it offers its own first chapter.
    await userEvent.click(within(screen.getByTestId('lp-section-3')).getByRole('button', { name: 'Jump ahead to Chapter 4: a short test opens it' }));
    expect(within(screen.getByRole('dialog', { name: 'Jump to Chapter 4?' })).getByRole('link', { name: 'Start the test' })).toHaveAttribute('href', '/app/learn/jump/c1/r4');
  });

  it('rings the topic to do now with a piece for each lesson, stands a star on a coin for each round, and says the round in its card', async () => {
    serve({ 'GET /courses/c1/map': sections(), 'GET /practice/due': { due: 0, available: 0 } });
    routes('/app/learn/course/c1');

    // Topic c has all three rounds: three stars on its coin, and no ring, which is for the topic to do now.
    const c = await screen.findByRole('button', { name: 'Topic c, Done — strong, all 3 rounds done' });
    expect(within(c).queryByTestId('lp-ring')).not.toBeInTheDocument();
    expect(within(c).getAllByTestId('lp-stars-3')).toHaveLength(1);
    // Topic d, the one to do now: a piece filled of two, and no stars yet.
    const d = screen.getByRole('button', { name: /^Topic d/ });
    expect(d.querySelectorAll('.lp-ring-piece.is-filled')).toHaveLength(1);
    expect(within(d).queryByTestId(/lp-stars/)).not.toBeInTheDocument();

    await userEvent.click(c);
    const card = screen.getByRole('group', { name: 'Topic c' });
    expect(within(card).getByTestId('lp-card-stars-3')).toBeInTheDocument();
    expect(within(card).getByText('All 3 rounds done')).toBeInTheDocument();
  });

  it('plays a gold topic again from the lesson finished fewest times, and says the round it is in', async () => {
    serve({ 'GET /courses/c1/map': sections(), 'GET /practice/due': { due: 0, available: 0 } });
    routes('/app/learn/course/c1');
    await userEvent.click(await screen.findByTestId('lp-section-1'));
    await userEvent.click(screen.getByRole('button', { name: 'Topic b, Done — strong, round 2 of 3, 1 of 2 lessons' }));
    const card = screen.getByRole('group', { name: 'Topic b' });
    expect(within(card).getByText('Round 2 of 3 · 1 of 2 lessons')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Practise again +3–5 XP, played again' })).toHaveAttribute('href', '/app/learn/lesson/b2?course=c1');
  });

  it('makes a chapter’s story its prize: the chapter complete, the story to read and the chapter to practise', async () => {
    serve({ 'GET /courses/c1/map': sections(), 'GET /practice/due': { due: 0, available: 0 } });
    routes('/app/learn/course/c1');
    await userEvent.click(await screen.findByTestId('lp-section-1'));
    await userEvent.click(screen.getByRole('button', { name: 'Hamo’s story: Mêvan' }));
    const card = screen.getByRole('group', { name: 'Hamo’s story' });
    expect(within(card).getByTestId('lp-chapter-complete')).toHaveTextContent('Chapter complete');
    expect(within(card).getByRole('link', { name: 'Read the story' })).toHaveAttribute('href', '/app/learn/stories/road-01-tale');
    expect(within(card).getByRole('link', { name: 'Practise' })).toHaveAttribute('href', '/app/learn/review');
    // No trophy beside it: the story is the chapter's last stop.
    expect(screen.queryByRole('button', { name: /trophy/ })).not.toBeInTheDocument();
  });

  it('fills the ring, turns the stop gold and drops its star in on coming back from the lesson that finished its round', async () => {
    // As the path was drawn before the lesson: Topic d current, one lesson of two done.
    sessionStorage.setItem(
      'hevalo:path:c1',
      JSON.stringify({ 's:a': { state: 'done', done: 2, rounds: 1, pieces: 0 }, 's:b': { state: 'done', done: 2, rounds: 1, pieces: 1 }, 's:c': { state: 'done', done: 2, rounds: 3, pieces: 2 }, 's:d': { state: 'current', done: 1, rounds: 0, pieces: 1 }, 's:e': { state: 'locked', done: 0, rounds: 0, pieces: 0 }, 's:f': { state: 'locked', done: 0, rounds: 0, pieces: 0 } }),
    );
    const after = sections();
    after.units[1]!.skills[1] = { ...after.units[1]!.skills[1]!, state: 'completed', lessons: [{ ...lesson('d1', true, 'Lesson d1'), times: 1 }, { ...lesson('d2', true, 'Lesson d2'), times: 1 }] };
    after.units[2]!.skills[0] = { ...after.units[2]!.skills[0]!, state: 'unlocked' };
    serve({ 'GET /courses/c1/map': after, 'GET /practice/due': { due: 0, available: 0 } });
    routes('/app/learn/course/c1');

    const d = await screen.findByRole('button', { name: /^Topic d/ });
    // First as it was: one piece filled, no star.
    expect(d.querySelectorAll('.lp-ring-piece.is-filled')).toHaveLength(1);
    // Then the ring whole and gold as the stop turns gold, and its star dropping in.
    await waitFor(() => expect(within(d).getByTestId('lp-ring')).toHaveClass('is-whole'), { timeout: 3000 });
    await waitFor(() => expect(d.querySelector('.lp-star.is-earned')).not.toBeNull(), { timeout: 3000 });
    // And the next round begins as the star lands: the ring empty again, the star kept.
    await waitFor(() => expect(within(d).getByTestId('lp-ring')).not.toHaveClass('is-whole'), { timeout: 3000 });
    expect(d.querySelectorAll('.lp-ring-piece.is-filled')).toHaveLength(0);
    expect(within(d).getByTestId('lp-stars-1')).toBeInTheDocument();
  });

  it('comes back to the section a lesson was played in, a finished one too, with its ring moving on', async () => {
    // As the path was drawn before: the learner in the second section, the first finished.
    sessionStorage.setItem(
      'hevalo:path:c1',
      JSON.stringify({ 's:a': { state: 'done', done: 2, rounds: 1, pieces: 0 }, 's:b': { state: 'done', done: 2, rounds: 1, pieces: 1 }, 's:c': { state: 'done', done: 2, rounds: 3, pieces: 2 }, 's:d': { state: 'current', done: 1, rounds: 0, pieces: 1 }, 's:e': { state: 'locked', done: 0, rounds: 0, pieces: 0 }, 's:f': { state: 'locked', done: 0, rounds: 0, pieces: 0 } }),
    );
    // A lesson of Topic a played a second time.
    const replayed = sections();
    replayed.units[0]!.skills[0] = { ...replayed.units[0]!.skills[0]!, lessons: [{ ...lesson('a1', true, 'Lesson a1'), times: 2 }, { ...lesson('a2', true, 'Lesson a2'), times: 1 }] };
    serve({ 'GET /courses/c1/map': replayed, 'GET /practice/due': { due: 0, available: 0 } });
    routes('/app/learn/course/c1');
    const a = await screen.findByRole('button', { name: 'Topic a, Done — strong, round 2 of 3, 1 of 2 lessons' });
    await waitFor(() => expect(a.querySelectorAll('.lp-ring-piece.is-filled')).toHaveLength(1), { timeout: 3000 });
    // The learner's own section waits folded, to go back to.
    expect(screen.getByTestId('lp-section-2')).toHaveAccessibleName(/^Section 2, Beginner, .*You are here/);
  });

  it('puts review on the path when words are due, and a unit’s guide in the heading over its path', async () => {
    serve({
      'GET /courses/c1/map': basics,
      'GET /practice/due': { due: 6, available: 12 },
      'GET /skills/greet/grammar': { skillId: 'greet', grammarMd: '# Silavkirin\n\n**Silav** — hello' },
    });
    routes('/app/learn/course/c1');

    const review = await screen.findByRole('button', { name: 'Review, words ready: 6' });
    await userEvent.click(review);
    expect(screen.getByRole('link', { name: 'Start review' })).toHaveAttribute('href', '/app/learn/review');

    await userEvent.click(screen.getByRole('button', { name: 'Guide to Basics' }));
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

  // While the session loads, the lesson's own frame shows, with a working way out.
  it('stands in the lesson’s own frame while the session is on its way, with the way out already working', async () => {
    let letGo: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (letGo = resolve));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const path = new URL(url).pathname;
        if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me', emailVerified: true } });
        await held;
        return jsonResponse(200, {
          sessionId: 's1',
          lessonId: 'l2',
          expiresAt: '2026-10-08T00:00:00Z',
          completed: false,
          exercises: [{ id: 'a', position: 1, type: 'translate', prompt: 'hello' }],
          answered: {},
          grammarMd: null,
          dialect: 'kurmanji',
        });
      }),
    );
    routes({ pathname: '/app/learn/lesson/l2', search: '?course=c1' });

    // Said once, as a status, for a screen reader; the boxes are not read out.
    const waiting = (await screen.findByText('Opening the lesson…')).closest('[role="status"]')!;
    expect(waiting).toHaveAttribute('aria-busy', 'true');
    const frame = waiting.closest('.lesson')!;
    expect(frame.querySelector('.lesson-progress')).not.toBeNull();
    expect(frame.querySelector('.lesson-bar')).not.toBeNull();
    // No spinner on an empty page.
    expect(document.querySelector('.spinner')).toBeNull();
    // Leaving does not wait for the lesson, and goes where the lesson's own ✕ will.
    expect(screen.getByRole('link', { name: 'Leave for now — your answers are saved' })).toHaveAttribute('href', '/app/learn/course/c1');

    letGo();
    expect(await screen.findByText('hello')).toBeInTheDocument();
    expect(screen.queryByText('Opening the lesson…')).not.toBeInTheDocument();
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
    // The session it was handed is not fetched again.
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

  it('starts the kind of practice its address asks for, and ends it on the practice page', async () => {
    serve({ 'POST /practice/session': session });
    routes('/app/learn/review?mode=listen');
    expect(await screen.findByText('apple')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/app/learn/review/p1');
    expect(calls.filter((c) => c.path === '/practice/session').map((c) => c.body)).toEqual([{ mode: 'listen' }]);
    expect(screen.getByRole('link', { name: 'Leave for now — your answers are saved' })).toHaveAttribute('href', '/app/learn/practice');
  });

  it('reviews the chapter its address names', async () => {
    serve({ 'POST /practice/session': session });
    routes('/app/learn/review?mode=unit&unit=u2');
    expect(await screen.findByText('apple')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/practice/session').map((c) => c.body)).toEqual([{ mode: 'unit', unitId: 'u2' }]);
  });

  it('with nothing of a kind to practise, leads back to the other kinds', async () => {
    serve({ 'POST /practice/session': { empty: true, suggestion: { lessonId: 'l1', title: 'Hello' } } });
    routes('/app/learn/review?mode=mistakes');
    expect(await screen.findByText('Nothing to practise here right now')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to practice' })).toHaveAttribute('href', '/app/learn/practice');
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
