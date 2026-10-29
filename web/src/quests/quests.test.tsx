import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QuestStep } from '@kurda/shared';
import { jsonResponse, renderApp } from '../test/utils';
import { ChestScreen, type ChestToOpen } from './ChestScreen';
import { QuestList } from './QuestList';
import { earlierRows, justDone, questRows, withOpened } from './rows';
import type { QuestDayRead } from './useQuestDay';

/*
 * Daily quests: the rows a session's steps and the day make, their bars, and a
 * chest opened over the whole screen — opened, already opened, not yet done,
 * and a request that never arrived.
 */

const day: QuestDayRead = {
  date: '2026-10-29',
  monthDone: 3,
  quests: [
    { id: 'q1', kind: 'streak', target: 1, progress: 1, chest: 'common', claimable: true, claimed: false },
    { id: 'q2', kind: 'accuracy', target: 2, progress: 1, chest: 'rare', claimable: false, claimed: false },
    { id: 'q3', kind: 'listening', target: 6, progress: 6, chest: 'epic', claimable: false, claimed: true },
  ],
};
const steps: QuestStep[] = [
  { id: 'q1', kind: 'streak', target: 1, chest: 'common', from: 0, to: 1, claimable: true },
  { id: 'q2', kind: 'accuracy', target: 2, chest: 'rare', from: 0, to: 1, claimable: false },
];

describe('the rows', () => {
  it('start the quests a session moved where they stood before it, and the others where they are', () => {
    const rows = questRows(day, steps);
    expect(rows.map((r) => [r.id, r.from, r.to])).toEqual([
      ['q1', 0, 1],
      ['q2', 0, 1],
      ['q3', 6, 6],
    ]);
    expect(rows.filter(justDone).map((r) => r.id)).toEqual(['q1']);
  });

  it('are the steps alone when the day could not be read, never past their target', () => {
    const rows = questRows(null, [{ ...steps[0]!, from: 0, to: 3 }]);
    expect(rows).toEqual([{ id: 'q1', kind: 'streak', target: 1, chest: 'common', from: 0, to: 1, claimable: true, claimed: false }]);
  });

  it('keep the chests of earlier days waiting, and none from an older server that does not send them', () => {
    const waiting = { id: 'old', kind: 'xp' as const, target: 40, progress: 40, chest: 'rare' as const, claimable: true, claimed: false };
    expect(earlierRows({ ...day, waiting: [waiting] })).toEqual([{ id: 'old', kind: 'xp', target: 40, chest: 'rare', from: 40, to: 40, claimable: true, claimed: false }]);
    expect(earlierRows(day)).toEqual([]);
    expect(earlierRows(null)).toEqual([]);
  });

  it('mark a chest opened since the day was read', () => {
    const rows = withOpened(questRows(day), new Set(['q1']));
    expect(rows[0]).toMatchObject({ claimable: false, claimed: true });
    expect(rows[1]).toMatchObject({ claimable: false, claimed: false });
  });
});

describe('the list', () => {
  it('says each quest in words with its target, how far its bar has got, and what its chest is waiting for', () => {
    renderApp(<QuestList rows={questRows(day)} />);
    expect(screen.getByRole('progressbar', { name: 'Keep your streak going' })).toHaveAttribute('aria-valuetext', '1 of 1');
    expect(screen.getByRole('progressbar', { name: 'Finish 2 lessons with 80% right first time' })).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByRole('progressbar', { name: 'Answer 6 listening exercises right' })).toHaveAttribute('aria-valuemax', '6');
    const [first, second, third] = screen.getAllByRole('listitem');
    expect(first).toHaveClass('is-done', 'is-claimable');
    expect(within(first!).getByText('Its chest is ready to open')).toBeInTheDocument();
    expect(second).not.toHaveClass('is-done');
    expect(within(third!).getByText('Its chest is open')).toBeInTheDocument();
  });

  it('fills a bar from where it stood only when it is moving, and lifts a quest finished just now', () => {
    renderApp(<QuestList rows={questRows(day, steps)} moving />);
    const [first, second, third] = screen.getAllByRole('listitem');
    expect(first).toHaveClass('is-fresh');
    expect(first!.querySelector('.quest-fill')).toHaveClass('is-moving');
    expect(second).not.toHaveClass('is-fresh');
    expect(third!.querySelector('.quest-fill')).not.toHaveClass('is-moving');
  });
});

describe('a chest', () => {
  let claims: string[] = [];

  function serve(reply: (questId: string) => Response | Promise<Response>): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = new URL(url).pathname;
        if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me', emailVerified: true } });
        const claim = path.match(/^\/me\/quests\/([^/]+)\/claim$/);
        if (claim && init?.method === 'POST') {
          claims.push(decodeURIComponent(claim[1]!));
          return reply(decodeURIComponent(claim[1]!));
        }
        return jsonResponse(404, { code: 'NOT_FOUND', message: 'no route' });
      }),
    );
  }

  const opened = (questId: string, amount = 12, balance = 1252) => jsonResponse(200, { questId, tier: 'common', currency: 'zer', amount, balance });

  function open(chests: ChestToOpen[] = [{ id: '2026-10-29:streak', chest: 'common' }]) {
    const onOpened = vi.fn();
    const onClose = vi.fn();
    renderApp(<ChestScreen chests={chests} onOpened={onOpened} onClose={onClose} doneLabel="Continue" />);
    return { onOpened, onClose };
  }

  beforeEach(() => {
    claims = [];
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens on a tap: what it held, with the balance it makes, said as it lands', async () => {
    serve((id) => opened(id));
    const { onOpened, onClose } = open();
    const dialog = screen.getByRole('dialog', { name: 'Common chest' });
    const chest = within(dialog).getByRole('button', { name: 'Open chest' });
    expect(chest).toHaveFocus();
    expect(within(dialog).getByText('Tap to open!')).toBeInTheDocument();

    await userEvent.click(chest);
    expect(await within(dialog).findByText('+12 Zêr')).toBeInTheDocument();
    expect(within(dialog).getByRole('status')).toHaveTextContent('+12 Zêr. You have 1,252 Zêr now.');
    expect(claims).toEqual(['2026-10-29:streak']);
    expect(onOpened).toHaveBeenCalledWith('2026-10-29:streak', expect.objectContaining({ amount: 12, balance: 1252 }));
    const go = within(dialog).getByRole('button', { name: 'Continue' });
    expect(go).toHaveFocus();
    await userEvent.click(go);
    expect(onClose).toHaveBeenCalled();
  });

  it('goes on to the next chest waiting, and then on', async () => {
    serve((id) => opened(id, id === 'a' ? 5 : 20));
    const { onClose } = open([
      { id: 'a', chest: 'common' },
      { id: 'b', chest: 'epic' },
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Open chest' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Next chest' }));
    expect(screen.getByRole('dialog', { name: 'Epic chest' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open chest' }));
    expect(await screen.findByText('+20 Zêr')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(claims).toEqual(['a', 'b']);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('says so when it was opened already somewhere else, and lets the learner go on', async () => {
    serve(() => jsonResponse(409, { code: 'QUEST_CLAIMED', message: 'claimed' }));
    const { onOpened } = open();
    await userEvent.click(screen.getByRole('button', { name: 'Open chest' }));
    expect(await screen.findByText('This chest is already open, and its Zêr is yours.')).toBeInTheDocument();
    expect(onOpened).toHaveBeenCalledWith('2026-10-29:streak', null);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('stays shut and says why when its quest is not done', async () => {
    serve(() => jsonResponse(409, { code: 'QUEST_NOT_DONE', message: 'not done' }));
    const { onOpened } = open();
    await userEvent.click(screen.getByRole('button', { name: 'Open chest' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This quest isn’t finished yet, so its chest stays shut for now.');
    expect(onOpened).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Open chest' })).toBeInTheDocument();
  });

  it('keeps the chest waiting when the request never arrives, and opens it on the next tap', async () => {
    let fail = true;
    serve((id) => {
      if (fail) {
        fail = false;
        throw new TypeError('network down');
      }
      return opened(id);
    });
    const { onOpened } = open();
    await userEvent.click(screen.getByRole('button', { name: 'Open chest' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The chest is still here: tap it to try again.');
    expect(onOpened).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Open chest' }));
    expect(await screen.findByText('+12 Zêr')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('closes shut with Escape, for later', async () => {
    serve((id) => opened(id));
    const { onClose } = open();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    expect(claims).toHaveLength(0);
  });
});
