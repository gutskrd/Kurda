import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NO_LESSON_MOMENTS, type DeliveredExercise, type LessonMoments, type QuestStep } from '@kurda/shared';
import { jsonResponse, renderApp } from '../test/utils';
import type { QuestDay } from '@kurda/shared';
import { Results } from './Results';
import type { SessionResults } from './types';

/*
 * The end of a lesson on its own: the three cards, the title by how it went,
 * and the screens after it — the streak's card (after its flame, on the day
 * the fire grew), today's quests and a chest — against a scripted API.
 */

let calls: string[] = [];

function serve(routes: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${path}`);
      if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me', emailVerified: true } });
      const reply = routes[`${method} ${path}`];
      if (reply === undefined) return jsonResponse(404, { code: 'NOT_FOUND', message: 'no route' });
      return jsonResponse(200, reply);
    }),
  );
}

const base: SessionResults = {
  correct: 5,
  total: 6,
  accuracy: 5 / 6,
  xpAwarded: 18,
  mistakes: [],
  streak: { current: 4, longest: 30, lastActiveOn: '2026-10-29', freezeProgress: 3, sessionsPerFreeze: 5 },
};

function show(
  over: Partial<SessionResults> = {},
  { moments = NO_LESSON_MOMENTS, elapsedMs = 112_000, kind = 'lesson' }: { moments?: LessonMoments; elapsedMs?: number; kind?: 'lesson' | 'practice' } = {},
): void {
  renderApp(
    <Results
      title="Silav"
      results={{ ...base, ...over }}
      exercises={[]}
      kind={kind}
      dialect="kurmanji"
      moments={moments}
      elapsedMs={elapsedMs}
      exitTo="/app/learn"
      exitLabel="Back to Learn"
      onNext={vi.fn()}
      onPractise={vi.fn()}
    />,
    ['/app/learn/lesson/l1'],
  );
}

/** Reduce Motion, as the browser reports it. */
function reduceMotion(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }));
}

beforeEach(() => {
  calls = [];
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  serve({});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the three cards', () => {
  it('frames the XP, right first time under its kind word, and the time this sitting took, each counting up to its value', async () => {
    show();
    expect(screen.getByText('Total XP')).toBeInTheDocument();
    expect(screen.getByText('Solid')).toBeInTheDocument();
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(await screen.findByText('+18', undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(await screen.findByText('83%', undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(await screen.findByText('1:52', undefined, { timeout: 3000 })).toBeInTheDocument();
  });

  it('writes a sitting of an hour or more as hours, minutes and seconds', async () => {
    reduceMotion();
    show({}, { elapsedMs: 3_725_000 });
    expect(screen.getByText('1:02:05')).toBeInTheDocument();
  });

  it('says the three in one sentence to a screen reader, as the numbers they end on, and hides the cards from it', () => {
    show();
    expect(screen.getByText('+18 XP. 83% right first time (5 of 6): Solid. Time: 1 min 52 s.')).toBeInTheDocument();
    expect(screen.getByText('Total XP').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('shows every number where it ends at once under Reduce Motion', () => {
    reduceMotion();
    show();
    expect(screen.getByText('+18')).toBeInTheDocument();
    expect(screen.getByText('83%')).toBeInTheDocument();
    expect(screen.getByText('1:52')).toBeInTheDocument();
  });
});

describe('the title', () => {
  it('calls a perfect lesson perfect, under Hevalo with his head in at the window', () => {
    show({ correct: 6, accuracy: 1 }, { moments: { ...NO_LESSON_MOMENTS, perfect: true } });
    expect(screen.getByRole('heading', { name: 'Perfect lesson!' })).toBeInTheDocument();
    expect(document.querySelector('.lesson-results .hevalo-window [data-crop="head"]')).toHaveAttribute('data-speaker', 'hevalo');
    expect(screen.getByText('Every answer right the first time.')).toBeInTheDocument();
  });

  it('calls one nearly all right great work', () => {
    show({ accuracy: 0.95 });
    expect(screen.getByRole('heading', { name: 'Great work!' })).toBeInTheDocument();
    expect(screen.getByText('Your Kurdish is getting stronger.')).toBeInTheDocument();
    expect(screen.getByText('Excellent')).toBeInTheDocument();
  });

  it('calls the rest finished, kindly', () => {
    show({ correct: 3, accuracy: 0.5 });
    expect(screen.getByRole('heading', { name: 'Lesson finished' })).toBeInTheDocument();
    expect(screen.getByText('Every lesson makes your Kurdish stronger.')).toBeInTheDocument();
    expect(screen.getByText('Good practice')).toBeInTheDocument();
  });

  it('calls a review a review', () => {
    show({ correct: 3, accuracy: 0.5 }, { kind: 'practice' });
    expect(screen.getByRole('heading', { name: 'Review finished' })).toBeInTheDocument();
  });
});

describe('water for the tree', () => {
  it('says what the lesson earned the learner’s tree, and nothing where it earned none', () => {
    show({ tree: { gained: 1, water: 3 } });
    expect(screen.getByText('+1 water for your tree')).toBeInTheDocument();
    cleanup();
    // no tree planted, a replay, or a server without trees: the results carry nothing about it
    show();
    expect(screen.queryByText(/water for your tree/)).toBeNull();
  });
});

describe('after the results', () => {
  const steps: QuestStep[] = [
    { id: 'q1', kind: 'streak', target: 1, chest: 'common', from: 0, to: 1, claimable: true },
    { id: 'q2', kind: 'lessons', target: 2, chest: 'rare', from: 0, to: 1, claimable: false },
  ];
  const day: QuestDay = {
    date: '2026-10-29',
    monthDone: 7, waiting: [],
    quests: [
      { id: 'q1', kind: 'streak', target: 1, progress: 1, chest: 'common', claimable: true, claimed: false },
      { id: 'q2', kind: 'lessons', target: 2, progress: 1, chest: 'rare', claimable: false, claimed: false },
      { id: 'q3', kind: 'xp', target: 40, progress: 10, chest: 'epic', claimable: false, claimed: false },
    ],
  };
  const kept: LessonMoments = { ...NO_LESSON_MOMENTS, streakKept: true };

  it('goes on to the streak’s card and the quests of the day one tap at a time, and opens the chest there', async () => {
    serve({ 'GET /me/quests': day, 'POST /me/quests/q1/claim': { questId: 'q1', tier: 'common', currency: 'zer', amount: 12, balance: 1252 } });
    show({ quests: steps }, { moments: kept });

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    // an ordinary day: no flame first, the card is the whole of the moment, with the way on from its first frame
    expect(await screen.findByRole('heading', { name: '4-day streak' })).toBeInTheDocument();
    expect(document.querySelector('.end-flame')).toBeNull();
    expect(screen.getByText('Another day learned. See you again tomorrow!')).toBeInTheDocument();
    expect(screen.getByText('3 of 5 sessions to your next freeze')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();

    // then today's three, the one this lesson finished called so
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Quest complete!' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Keep your streak going' })).toHaveAttribute('aria-valuetext', '1 of 1');
    expect(screen.getByRole('progressbar', { name: 'Finish 2 lessons' })).toHaveAttribute('aria-valuetext', '1 of 2');
    expect(screen.getByRole('progressbar', { name: 'Earn 40 XP' })).toHaveAttribute('aria-valuetext', '10 of 40');
    expect(screen.getByText('Its chest is ready to open')).toBeInTheDocument();
    expect(screen.getByText('Quests done this month: 7')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Open chest' }));
    const chest = await screen.findByRole('dialog', { name: 'Common chest' });
    await userEvent.click(within(chest).getByRole('button', { name: 'Open chest' }));
    expect(await within(chest).findByText('+12 Zêr')).toBeInTheDocument();
    expect(calls).toContain('POST /me/quests/q1/claim');
    await userEvent.click(within(chest).getByRole('button', { name: 'Continue' }));

    // back on the quests, the chest open and the way on in the bar
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Its chest is open')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
  });

  it('moves on with Enter from anywhere without a use of its own for it, and the flame with Escape rather than leaving', async () => {
    // the seventh day: the fire grew into a campfire, so its flame has the screen first
    show({ streak: { ...base.streak, current: 7 } }, { moments: kept });
    await screen.findByRole('heading', { name: 'Great work!' });
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: '7-day streak' })).toBeInTheDocument();
    expect(document.querySelector('.end-flame')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('Another day learned. See you again tomorrow!')).toBeInTheDocument();
    // the number rolled on the flame's screen: on the card it stands at today's from the start
    expect(document.querySelector('.end-week .roll-column')).toBeNull();
  });

  it('lets the streak’s card go before the next screen, and takes the way on at once for a reader who asked for less motion', async () => {
    serve({ 'GET /me/quests': day });
    show({ quests: steps }, { moments: kept });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: '4-day streak' });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    // the card is still there, going: its words fading, its medal gathering itself
    expect(document.querySelector('.end-week')).toHaveClass('is-leaving');
    expect(await screen.findByRole('heading', { name: 'Quest complete!' })).toBeInTheDocument();
    expect(document.querySelector('.end-week')).toBeNull();
  });

  it('takes the way on from the streak’s card at once under reduced motion', async () => {
    reduceMotion();
    serve({ 'GET /me/quests': day });
    show({ quests: steps }, { moments: kept });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: '4-day streak' });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(document.querySelector('.end-week')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Quest complete!' })).toBeInTheDocument();
  });

  it('leaves a chest shut for later and offers the way on instead', async () => {
    serve({ 'GET /me/quests': day });
    show({ quests: steps });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Later' }));
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open chest' })).not.toBeInTheDocument();
    expect(calls.filter((c) => c.endsWith('/claim'))).toHaveLength(0);
  });

  it('shows what the session moved when the quests of the day cannot be read', async () => {
    show({ quests: steps });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('progressbar', { name: 'Finish 2 lessons' })).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(2);
  });

  it('reads no quests when the session moved none', () => {
    show();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(calls).not.toContain('GET /me/quests');
  });
});

/*
 * The quiet Share beside the way on: the lesson as it went on its results,
 * the streak on its card on one of its big days, and none on a review. What
 * goes out is a line, the squares and the site's address, and nothing of who
 * is sharing.
 */
describe('sharing', () => {
  const SITE = window.location.origin;
  const exercises: DeliveredExercise[] = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].map((id, i) => ({ id, position: i + 1, type: 'multiple_choice' }));
  // six asked, the third missed the first time
  const lesson: Partial<SessionResults> = { correct: 5, total: 6, accuracy: 5 / 6, mistakes: [{ exerciseId: 'e3', verdict: 'wrong' }] };
  const kept: LessonMoments = { ...NO_LESSON_MOMENTS, streakKept: true };
  // somebody with a name and a country (a made-up one), neither of which a share may carry
  const WHO = { id: 'u-4471', username: 'rojda', displayName: 'Rojda', country: 'DE', emailVerified: true };

  function open(
    over: Partial<SessionResults> = {},
    {
      moments = NO_LESSON_MOMENTS,
      kind = 'lesson',
      lessonName = 'Hello!',
    }: { moments?: LessonMoments; kind?: 'lesson' | 'practice'; lessonName?: string | null } = {},
  ): void {
    renderApp(
      <Results
        title={lessonName ?? 'Lesson'}
        lessonName={lessonName}
        results={{ ...base, ...lesson, ...over }}
        exercises={exercises}
        kind={kind}
        dialect="kurmanji"
        moments={moments}
        elapsedMs={112_000}
        exitTo="/app/learn"
        exitLabel="Back to Learn"
        onNext={vi.fn()}
        onPractise={vi.fn()}
      />,
      ['/app/learn/lesson/l1'],
    );
  }

  /** A device with a share sheet: what it is handed is the test’s to read. */
  function sheet(): { said: () => string; share: ReturnType<typeof vi.fn> } {
    const share = vi.fn(async (_data: ShareData) => undefined);
    vi.stubGlobal('navigator', { ...navigator, share, clipboard: navigator.clipboard });
    return { share, said: () => (share.mock.calls[0]?.[0] as ShareData | undefined)?.text ?? '' };
  }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (new URL(url).pathname === '/me' ? jsonResponse(200, { user: WHO }) : jsonResponse(404, { code: 'NOT_FOUND', message: 'no route' }))),
    );
  });

  it('offers one quiet Share in the bar, beside the way on, which stays the bar’s one button', () => {
    open();
    const bar = document.querySelector('.lesson-bar') as HTMLElement;
    const share = within(bar).getByRole('button', { name: 'Share' });
    expect(share).toHaveClass('btn-secondary');
    expect(share.closest('.lesson-bar-start')).not.toBeNull();
    // the way on is still the last thing in the row, and the only one drawn as it
    const row = bar.querySelector('.lesson-bar-row')!;
    expect(row.lastElementChild).toHaveClass('lesson-bar-go');
    expect(bar.querySelectorAll('.lesson-bar-go')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Share' })).toHaveLength(1);
  });

  it('shares the lesson by its name, with the lesson’s own address under it', async () => {
    const { share, said } = sheet();
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledTimes(1);
    expect(said()).toBe(`I finished “Hello!” in Kurdish on Hevalo. 🍎\n${SITE}/win/lesson`);
  });

  it('shares nothing that says whose lesson it was', async () => {
    const { said } = sheet();
    open();
    // the account is read by now: it is on the page’s side, and stays there
    await userEvent.click(await screen.findByRole('button', { name: 'Share' }));
    const text = said();
    expect(text.length).toBeGreaterThan(0);
    for (const theirs of [WHO.id, WHO.username, WHO.displayName, WHO.country, '/users/', '/profile', '@']) expect(text, theirs).not.toContain(theirs);
    // one address, and it is the page of a lesson finished, which is about nobody
    expect(text.match(/https?:\/\/\S+/g)).toEqual([`${SITE}/win/lesson`]);
  });

  it('says nothing of how the lesson went: no score, and no row of squares', async () => {
    const { said } = sheet();
    open({ correct: 4, total: 5, accuracy: 0.8 });
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(said().split('\n')).toHaveLength(2);
    expect(said()).not.toMatch(/[🟩🟨🟧⬜]|\d+\s*\/\s*\d+|%/u);
  });

  it('says a Kurdish lesson was finished when the page was not told its name', async () => {
    const { said } = sheet();
    open({}, { lessonName: null });
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(said().split('\n')[0]).toBe('I finished a Kurdish lesson on Hevalo. 🍎');
  });

  it('copies the message where the device has no sheet, and says so', async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(writeText).toHaveBeenCalledWith(`I finished “Hello!” in Kurdish on Hevalo. 🍎\n${SITE}/win/lesson`);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('offers no Share on a review: practice is not a lesson finished', () => {
    open({}, { kind: 'practice' });
    expect(screen.getByRole('heading', { name: 'Great work!' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });

  it('never stands in the way on: Enter still moves on, and shares nothing', async () => {
    const { share } = sheet();
    open({}, { moments: kept });
    await screen.findByRole('heading', { name: 'Great work!' });
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: '4-day streak' })).toBeInTheDocument();
    expect(share).not.toHaveBeenCalled();
  });

  it('offers the streak on the day it reaches a week: its days, the fire, and the address of that day’s card', async () => {
    const { share, said } = sheet();
    open({ streak: { ...base.streak, current: 7 } }, { moments: kept });
    await screen.findByRole('heading', { name: 'Great work!' });
    await userEvent.keyboard('{Enter}');
    // the seventh day’s flame first, which has no bar and no Share
    await screen.findByRole('heading', { name: '7-day streak' });
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await screen.findByText('Another day learned. See you again tomorrow!');

    const bar = document.querySelector('.lesson-bar') as HTMLElement;
    await userEvent.click(within(bar).getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledTimes(1);
    expect(said()).toBe(`7 days of Kurdish in a row. 🔥\n${SITE}/win/streak/7`);
    for (const theirs of [WHO.id, WHO.username, WHO.displayName, '/users/']) expect(said()).not.toContain(theirs);
    // the way on is still the bar’s one button
    expect(bar.querySelector('.lesson-bar-row')!.lastElementChild).toHaveClass('lesson-bar-go');
  });

  it('offers no Share on the streak’s card on an ordinary day', async () => {
    open({}, { moments: kept });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: '4-day streak' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });
});
