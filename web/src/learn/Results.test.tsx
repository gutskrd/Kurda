import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NO_LESSON_MOMENTS, type LessonMoments, type QuestStep } from '@kurda/shared';
import { jsonResponse, renderApp } from '../test/utils';
import type { QuestDay } from '@kurda/shared';
import { Results } from './Results';
import type { SessionResults } from './types';

/*
 * The end of a lesson on its own: the three cards, the title by how it went,
 * and the screens after it — the streak's flame and week, today's quests and
 * a chest — against a scripted API.
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
  it('calls a perfect lesson perfect, under Hevalo leaning out of his window', () => {
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

  it('goes on to the streak flame, the week and the quests of the day one tap at a time, and opens the chest there', async () => {
    serve({ 'GET /me/quests': day, 'POST /me/quests/q1/claim': { questId: 'q1', tier: 'common', currency: 'zer', amount: 12, balance: 1252 } });
    show({ quests: steps }, { moments: kept });

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    // the flame has the screen, and moves on to the week by itself
    expect(await screen.findByRole('heading', { name: '4-day streak' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(await screen.findByText('Another day learned. See you again tomorrow!', undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText('3 of 5 sessions to your next freeze')).toBeInTheDocument();

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
    show({}, { moments: kept });
    await screen.findByRole('heading', { name: 'Great work!' });
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: '4-day streak' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('Another day learned. See you again tomorrow!')).toBeInTheDocument();
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
