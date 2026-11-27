import { afterEach, describe, expect, it, vi } from 'vitest';
// The fire as its props: how big it burns and whether it stands still.
vi.mock('../components/Fire', () => import('../test/fireProbe'));
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, fireLevel } from '@kurda/shared';
import { preloadCatalogue } from '../i18n/catalogues';
import { jsonResponse, renderApp } from '../test/utils';
import { fourDayView, todayView } from '../test/today';
import { DailySheet } from './DailySheet';
import { useToday, type TodayView } from './today';

/* The daily view: the fire and the streak, the week, today's Zêr, the week's numbers, the insights and the latest badge. */

interface Sent {
  method: string;
  path: string;
}

/** A fetch that answers the daily view (and a claim), keeping what was asked. */
function api(view: () => TodayView, claim?: () => Response): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const { pathname } = new URL(url, 'http://api.test');
      const method = init?.method ?? 'GET';
      sent.push({ method, path: pathname });
      if (pathname.endsWith('/me/today')) return jsonResponse(200, view());
      if (pathname.endsWith('/rewards/daily/claim') && claim) return claim();
      return jsonResponse(200, {});
    }),
  );
  return sent;
}

function Opened(): React.JSX.Element {
  const today = useToday();
  return <DailySheet open today={today} onClose={() => undefined} />;
}

async function open(): Promise<HTMLElement> {
  renderApp(<Opened />);
  const sheet = await screen.findByRole('dialog', { name: 'Streak' });
  await within(sheet).findByRole('list', { name: 'This week' });
  return sheet;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('the daily view', () => {
  it('shows the fire with the streak large under it, and the week with today ringed', async () => {
    api(() => fourDayView());
    const sheet = await open();
    expect(within(sheet).getByRole('heading', { name: '4-day streak' })).toBeInTheDocument();
    const [head] = within(sheet).getAllByTestId('fire');
    expect(head).toHaveAttribute('data-stage', fireLevel(4).stage);
    expect(within(sheet).getByText('day streak')).toBeInTheDocument();
    const week = within(within(sheet).getByRole('list', { name: 'This week' })).getAllByRole('listitem');
    expect(week.map((d) => d.getAttribute('aria-label'))).toEqual([
      'Monday: learned',
      'Tuesday: learned',
      'Wednesday: learned today',
      'Thursday: still to come',
      'Friday: still to come',
      'Saturday: still to come',
      'Sunday: still to come',
    ]);
    expect(week.map((d) => d.querySelector('.week-day-name')?.textContent).join('')).toBe('MTWTFSS');
    expect(week[2]).toHaveClass('is-today', 'is-learned');
  });

  it('counts this week’s days, lessons, practice and XP from the server’s days', async () => {
    api(() => fourDayView());
    const sheet = await open();
    const stats = within(sheet).getByRole('region', { name: 'Your stats' });
    const value = (label: string): string | null | undefined => within(stats).getByText(label).nextElementSibling?.textContent;
    expect(value('Days')).toBe('3');
    expect(value('Lessons')).toBe('4');
    expect(value('Practice')).toBe('1');
    expect(value('XP')).toBe('85');
  });

  it('opens the insights: this week against last by the same day, as a chart with its table', async () => {
    api(() => fourDayView());
    const sheet = await open();
    await userEvent.click(within(sheet).getByRole('button', { name: '2 insights available' }));
    expect(within(sheet).getByRole('heading', { name: 'Insights' })).toBeInTheDocument();
    expect(within(sheet).getByText('50 more XP than by this day last week')).toBeInTheDocument();
    expect(within(sheet).getByText('2 more lessons than by this day last week')).toBeInTheDocument();
    // Both weeks have a legend entry, and every value is in the table for a screen reader.
    expect(within(sheet).getAllByText('This week').length).toBeGreaterThan(0);
    const rows = within(within(sheet).getByRole('table')).getAllByRole('row');
    expect(rows.map((r) => r.textContent)).toEqual([
      'DayThis weekLast week',
      'Monday40 XP0 XP',
      'Tuesday25 XP20 XP',
      'Wednesday20 XP15 XP',
      'Thursday0 XP',
      'Friday0 XP',
      'Saturday0 XP',
      'Sunday30 XP',
    ]);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Back' }));
    expect(within(sheet).getByRole('heading', { name: '4-day streak' })).toBeInTheDocument();
  });

  it('offers no insights when neither week has anything to say, and calls a first week that', async () => {
    api(() => todayView());
    const quiet = await open();
    expect(within(quiet).queryByRole('button', { name: /insights? available/ })).not.toBeInTheDocument();
    expect(within(quiet).getByRole('heading', { name: 'Finish a lesson to start a streak' })).toBeInTheDocument();
  });

  it('says a learner’s first week kindly rather than as a gain on nothing', async () => {
    api(() => todayView({ days: { 8: { learned: true, lessons: 1, xp: 20 } }, streak: { current: 1, daysLearned: 1 } }));
    const sheet = await open();
    await userEvent.click(within(sheet).getByRole('button', { name: 'One insight available' }));
    expect(within(sheet).getByText('Your first week: here is where it starts.')).toBeInTheDocument();
  });

  it('claims today’s Zêr on one press, with the coin’s pop, and asks for the view again', async () => {
    let claimed = false;
    const sent = api(
      () => (claimed ? fourDayView({ daily: { canClaim: false, learnedToday: true, alreadyClaimedToday: true, claimableDay: 3, reward: 20, cycleDay: 3 } }) : fourDayView()),
      () => {
        claimed = true;
        return jsonResponse(200, { claimed: true, cycleDay: 3, reward: 20, balance: 120 });
      },
    );
    const sheet = await open();
    expect(within(sheet).getByText('Day 3 reward: +20 Zêr')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Claim' }));
    expect(await within(sheet).findByRole('status')).toHaveTextContent('+20 Zêr claimed!');
    expect(sheet.querySelector('.zer-coin')).toHaveClass('is-landed');
    expect(sheet.querySelector('.zer-burst')).not.toBeNull();
    expect(within(sheet).queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument();
    expect(sent.filter((s) => s.method === 'POST').map((s) => s.path)).toEqual([expect.stringMatching(/\/rewards\/daily\/claim$/)]);
    await waitFor(() => expect(sent.filter((s) => s.path.endsWith('/me/today'))).toHaveLength(2));
  });

  it('asks for a lesson first, and says tomorrow once today’s Zêr is taken', async () => {
    api(() => fourDayView({ daily: { canClaim: false, learnedToday: false, claimableDay: 3, reward: 20, cycleDay: 2 } }));
    const sheet = await open();
    expect(within(sheet).getByText('Finish a lesson or a practice session to claim today’s +20 Zêr.')).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Go to Learn' })).toHaveAttribute('href', '/app/learn');
  });

  it('closes on Go to Learn and asks Learn for the lesson to do now, even when Learn is already open', async () => {
    api(() => fourDayView({ daily: { canClaim: false, learnedToday: false, claimableDay: 3, reward: 20, cycleDay: 2 } }));
    function OnLearn(): React.JSX.Element {
      const today = useToday();
      const [shown, setShown] = useState(true);
      const location = useLocation();
      return (
        <>
          <p data-testid="at">{`${location.pathname} ${JSON.stringify(location.state)}`}</p>
          <DailySheet open={shown} today={today} onClose={() => setShown(false)} />
        </>
      );
    }
    renderApp(<OnLearn />, ['/app/learn']);
    const sheet = await screen.findByRole('dialog', { name: 'Streak' });
    await userEvent.click(await within(sheet).findByRole('link', { name: 'Go to Learn' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Streak' })).not.toBeInTheDocument());
    expect(screen.getByTestId('at')).toHaveTextContent('/app/learn {"toLesson":true}');
  });

  it('says tomorrow once today’s Zêr is taken', async () => {
    api(() => fourDayView({ daily: { canClaim: false, learnedToday: true, alreadyClaimedToday: true, claimableDay: 3, reward: 20, cycleDay: 3 } }));
    const sheet = await open();
    expect(within(sheet).getByText('Come back tomorrow for more Zêr.')).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument();
  });

  it('shows the latest badge with its name and level, leading to every badge', async () => {
    api(() => fourDayView({ badge: { key: 'ders', tier: 2, earnedAt: '2026-11-12T00:00:00.000Z' } }));
    const sheet = await open();
    const badge = within(sheet).getByRole('link', { name: /Earned a badge/ });
    expect(badge).toHaveAttribute('href', '/app/badges');
    expect(badge).toHaveTextContent('Wane · Zîv');
  });

  it('keeps the freezes, the fire’s stages and the longest streak quietly at the end', async () => {
    api(() => fourDayView());
    const sheet = await open();
    expect(within(sheet).getByText('You have a freeze saved')).toBeInTheDocument();
    expect(within(sheet).getByRole('heading', { name: 'How your fire grows' })).toBeInTheDocument();
    const steps = sheet.querySelectorAll('.fire-step');
    expect([...steps].map((s) => s.querySelector('.sr-only')?.textContent)).toEqual([
      'Spark, from day 1, reached',
      'Little flame, from day 3, your fire now',
      'Campfire, from day 7, ahead',
      'Big fire, from day 14, ahead',
      'Bonfire, from day 30, ahead',
      'Blaze, from day 100, ahead',
      'Newroz fire, from day 365, ahead',
    ]);
    expect(within(sheet).getByText('Longest streak').nextElementSibling).toHaveTextContent('9');
  });

  it('lays the week out from Saturday in Sorani, right to left, with the course’s day names', async () => {
    localStorage.setItem('hevalo_locale', 'ckb');
    await preloadCatalogue();
    // The same days, as the server lays them out for a Saturday week.
    const saturdays = fourDayView();
    const sent = api(() => ({ ...saturdays, weekStart: 6, days: saturdays.days.map((d, i) => ({ ...d, date: addDays('2026-11-07', i) })) }));
    renderApp(<Opened />);
    const sheet = await screen.findByRole('dialog');
    await waitFor(() => expect(sheet.querySelectorAll('.week-day')).toHaveLength(7));
    expect(document.documentElement.dir).toBe('rtl');
    expect(sent.find((s) => s.path.endsWith('/me/today'))).toBeTruthy();
    // The week was asked for from Saturday, the day a Kurdish week starts on.
    const asked = (vi.mocked(fetch).mock.calls as unknown as [string][]).map(([url]) => url).find((u) => u.includes('/me/today'));
    expect(asked).toMatch(/weekStart=6$/);
    expect(sheet.querySelector('.week-day-name')?.textContent).toBe('ش');
  });
});
