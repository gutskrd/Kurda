import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse, renderApp } from '../test/utils';
import { QuestsCard } from './QuestsCard';
import type { QuestDayRead } from './useQuestDay';

/*
 * Today's quests on Learn: the slim card while the day is read, once it is,
 * when it cannot be, and the sheet it opens, with a chest opened from there.
 */

const day: QuestDayRead = {
  date: '2026-10-29',
  monthDone: 3,
  quests: [
    { id: 'q1', kind: 'streak', target: 1, progress: 1, chest: 'common', claimable: true, claimed: false },
    { id: 'q2', kind: 'lessons', target: 3, progress: 1, chest: 'rare', claimable: false, claimed: false },
    { id: 'q3', kind: 'perfect', target: 1, progress: 0, chest: 'epic', claimable: false, claimed: false },
  ],
};

let reads = 0;

function serve(answer: () => Response | Promise<Response>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me', emailVerified: true } });
      if (path === '/me/quests') {
        reads += 1;
        return answer();
      }
      const claim = path.match(/^\/me\/quests\/([^/]+)\/claim$/);
      if (claim && init?.method === 'POST') return jsonResponse(200, { questId: claim[1], tier: 'common', currency: 'zer', amount: 10, balance: 90 });
      return jsonResponse(404, { code: 'NOT_FOUND', message: 'no route' });
    }),
  );
}

beforeEach(() => {
  reads = 0;
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the quests card on Learn', () => {
  it('holds its place while the day is read, then shows a bar for each quest and a chest waiting', async () => {
    let arrive: (r: Response) => void = () => undefined;
    serve(() => new Promise<Response>((resolve) => (arrive = resolve)));
    renderApp(<QuestsCard />);
    expect(screen.getByText('Daily quests').closest('section')).toHaveAttribute('aria-busy', 'true');

    arrive(jsonResponse(200, day));
    const card = await screen.findByRole('button', { name: /Daily quests/ });
    expect(card).toHaveAccessibleName('Daily quests A chest to open! 1 of 3 done');
    expect(card.querySelectorAll('.quests-mini')).toHaveLength(3);
    expect(card.querySelector('.quests-card-dot')).not.toBeNull();
  });

  it('says how many are done when no chest is waiting', async () => {
    serve(() => jsonResponse(200, { ...day, quests: day.quests.map((q) => ({ ...q, claimable: false, claimed: q.id === 'q1' })) }));
    renderApp(<QuestsCard />);
    expect(await screen.findByRole('button', { name: 'Daily quests 1 of 3 done' })).toBeInTheDocument();
    expect(document.querySelector('.quests-card-dot')).toBeNull();
  });

  it('opens the three in a sheet, with the month so far, and a chest from there', async () => {
    serve(() => jsonResponse(200, day));
    renderApp(<QuestsCard />);
    await userEvent.click(await screen.findByRole('button', { name: /Daily quests/ }));
    const sheet = screen.getByRole('dialog', { name: 'Daily quests' });
    expect(within(sheet).getByRole('progressbar', { name: 'Finish 3 lessons' })).toHaveAttribute('aria-valuetext', '1 of 3');
    expect(within(sheet).getByRole('progressbar', { name: 'Finish a lesson with no mistakes' })).toHaveAttribute('aria-valuenow', '0');
    expect(within(sheet).getByText('Quests done this month: 3')).toBeInTheDocument();

    await userEvent.click(within(sheet).getByRole('button', { name: 'Open chest' }));
    const chest = screen.getByRole('dialog', { name: 'Common chest' });
    await userEvent.click(within(chest).getByRole('button', { name: 'Open chest' }));
    expect(await within(chest).findByText('+10 Zêr')).toBeInTheDocument();
    await userEvent.click(within(chest).getByRole('button', { name: 'Done' }));

    // back in the sheet, nothing waiting any more
    const again = screen.getByRole('dialog', { name: 'Daily quests' });
    expect(within(again).getByText('Its chest is open')).toBeInTheDocument();
    expect(within(again).queryByRole('button', { name: 'Open chest' })).not.toBeInTheDocument();
  });

  it('counts the chests still waiting from earlier days, lists them under today, and opens them after the one of today', async () => {
    serve(() =>
      jsonResponse(200, { ...day, waiting: [{ id: 'old', kind: 'lessons', target: 2, progress: 2, chest: 'rare', claimable: true, claimed: false }] }),
    );
    renderApp(<QuestsCard />);
    const card = await screen.findByRole('button', { name: /Daily quests/ });
    expect(card).toHaveAccessibleName('Daily quests 2 chests to open! 1 of 3 done');
    await userEvent.click(card);

    const sheet = screen.getByRole('dialog', { name: 'Daily quests' });
    const earlier = within(sheet).getByRole('region', { name: 'Earlier' });
    expect(within(earlier).getByRole('progressbar', { name: 'Finish 2 lessons' })).toHaveAttribute('aria-valuetext', '2 of 2');
    expect(within(earlier).getByText('Its chest is ready to open')).toBeInTheDocument();

    await userEvent.click(within(sheet).getByRole('button', { name: 'Open chest' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Common chest' })).getByRole('button', { name: 'Open chest' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Next chest' }));
    const second = screen.getByRole('dialog', { name: 'Rare chest' });
    await userEvent.click(within(second).getByRole('button', { name: 'Open chest' }));
    await userEvent.click(await within(second).findByRole('button', { name: 'Done' }));

    expect(within(screen.getByRole('region', { name: 'Earlier' })).getByText('Its chest is open')).toBeInTheDocument();
  });

  it('says plainly when the day cannot be read, and reads it again on Retry', async () => {
    let fail = true;
    serve(() => (fail ? jsonResponse(500, { code: 'INTERNAL', message: 'down' }) : jsonResponse(200, day)));
    renderApp(<QuestsCard />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    fail = false;
    await userEvent.click(retry);
    expect(await screen.findByRole('button', { name: /Daily quests/ })).toBeInTheDocument();
    expect(reads).toBe(2);
  });

  it('says there are none on a day without quests', async () => {
    serve(() => jsonResponse(200, { ...day, quests: [] }));
    renderApp(<QuestsCard />);
    expect(await screen.findByText('No quests today. Come back tomorrow.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
