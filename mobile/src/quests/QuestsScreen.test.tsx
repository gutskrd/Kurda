// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
// a badge earned meanwhile waits on the chest's moment (badges/BadgeCelebrationHost.tsx)
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { QuestDay, QuestStep } from '@kurda/shared';
import type { ApiResult } from '../api/types';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import { QuestsScreen } from './QuestsScreen';

// full motion here: the bars are seen moving
patchReactNativeWeb();
beforeEach(resetHaptics);
afterEach(cleanup);

const day: QuestDay = {
  date: '2026-10-29',
  monthDone: 7,
  quests: [
    { id: 'q:streak', kind: 'streak', target: 1, progress: 1, chest: 'common', claimable: true, claimed: false },
    { id: 'q:xp', kind: 'xp', target: 40, progress: 25, chest: 'rare', claimable: false, claimed: false },
    { id: 'q:perfect', kind: 'perfect', target: 1, progress: 1, chest: 'epic', claimable: true, claimed: false },
  ],
};
const steps: QuestStep[] = [
  { id: 'q:streak', kind: 'streak', target: 1, chest: 'common', from: 0, to: 1, claimable: true },
  { id: 'q:xp', kind: 'xp', target: 40, chest: 'rare', from: 10, to: 25, claimable: false },
];
const opening = (questId: string, amount: number, balance: number) => ok({ questId, tier: 'common', currency: 'zer', amount, balance });
const offline: ApiResult<never> = { ok: false, error: { kind: 'network', message: 'network request failed' } };

/** A route that answers from a list, one reply per call, the last one for ever after. */
function inTurn<T>(...replies: Array<ApiResult<T>>): () => ApiResult<T> {
  let i = 0;
  return () => replies[Math.min(i++, replies.length - 1)]!;
}

describe('the quests after a lesson', () => {
  it('moves each bar from where the lesson found it to where it left it', async () => {
    testAuth.client = fakeClient({ 'GET /me/quests': ok({ ...day, quests: [day.quests[1]!] }) });
    renderWithProviders(<QuestsScreen place="lesson" steps={steps} onDone={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'Daily quests' })).toBeTruthy();
    // the count on the bar starts where the lesson found it, and climbs with the fill
    expect((await screen.findAllByText('10 / 40')).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getAllByText('25 / 40').length).toBeGreaterThan(0));
    expect(screen.getByLabelText('Earn 40 XP: 25 of 40')).toBeTruthy();
    expect(screen.getByText('Quests done this month: 7')).toBeTruthy();
    // nothing waits to be opened: on
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('marks a quest finished by this lesson, and offers its chest or leaves it for later', async () => {
    testAuth.client = fakeClient({ 'GET /me/quests': ok(day) });
    const onDone = vi.fn();
    renderWithProviders(<QuestsScreen place="lesson" steps={steps} onDone={onDone} />);
    expect(await screen.findByText('Quest complete!')).toBeTruthy();
    expect(screen.getByLabelText('Keep your streak going: 1 of 1, Chest ready to open')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open chest' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('shows the quests the lesson moved on their own when the list does not load', async () => {
    testAuth.client = fakeClient({ 'GET /me/quests': offline });
    renderWithProviders(<QuestsScreen place="lesson" steps={steps} onDone={() => undefined} />);
    expect(await screen.findByLabelText('Keep your streak going: 1 of 1, Chest ready to open')).toBeTruthy();
    expect(screen.getByLabelText('Earn 40 XP: 25 of 40')).toBeTruthy();
    expect(screen.queryByLabelText(/Finish a lesson with no mistakes/)).toBeNull();
    expect(screen.queryByText(/Quests done this month/)).toBeNull();
  });
});

describe('a chest', () => {
  it('opens to its Zêr, felt once, with the balance counting to the new total; then the next chest, then on', async () => {
    testAuth.client = fakeClient({
      'GET /me/quests': ok(day),
      'POST /me/quests/q%3Astreak/claim': opening('q:streak', 12, 1252),
      'POST /me/quests/q%3Aperfect/claim': opening('q:perfect', 40, 1292),
    });
    const felt: string[] = [];
    const stop = onHaptic((e) => felt.push(e));
    const onDone = vi.fn();
    try {
      renderWithProviders(<QuestsScreen place="lesson" steps={steps} onDone={onDone} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Open chest' }));
      expect(await screen.findByRole('heading', { name: 'Common chest' })).toBeTruthy();
      expect(screen.getByText('Tap to open')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Open the chest' }));

      expect(await screen.findByRole('heading', { name: '+12 Zêr' })).toBeTruthy();
      expect(screen.getByLabelText('You have 1,252 Zêr')).toBeTruthy();
      await waitFor(() => expect(screen.getByText('1,252')).toBeTruthy());
      await waitFor(() => expect(felt).toContain('celebrate'));
      expect(felt.filter((e) => e === 'celebrate')).toHaveLength(1);

      // the next chest waiting, and after the last of them the way on
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(await screen.findByRole('heading', { name: 'Epic chest' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Open the chest' }));
      expect(await screen.findByRole('heading', { name: '+40 Zêr' })).toBeTruthy();
      expect(onDone).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(onDone).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });

  it('says plainly when it was already opened, and goes on', async () => {
    testAuth.client = fakeClient({
      'GET /me/quests': ok({ ...day, quests: day.quests.slice(0, 2) }),
      'POST /me/quests/q%3Astreak/claim': fail({ code: 'QUEST_CLAIMED', status: 409, message: 'claimed' }),
    });
    const onDone = vi.fn();
    renderWithProviders(<QuestsScreen place="lesson" steps={steps} onDone={onDone} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open chest' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open the chest' }));
    expect(await screen.findByText('This chest is already open, and its Zêr is yours.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('stays shut offline, waiting on Learn, with a way to try again and a way on', async () => {
    testAuth.client = fakeClient({
      'GET /me/quests': ok(day),
      'POST /me/quests/q%3Astreak/claim': inTurn(offline, opening('q:streak', 12, 1252)),
    });
    renderWithProviders(<QuestsScreen place="lesson" steps={steps} onDone={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open chest' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open the chest' }));
    expect(await screen.findByText('You’re offline, so the chest stays shut for now. It will wait for you on Learn.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: '+12 Zêr' })).toBeTruthy();
  });

  it('left shut, ends the run of chests: the next waits on Learn', async () => {
    testAuth.client = fakeClient({ 'GET /me/quests': ok(day), 'POST /me/quests/q%3Astreak/claim': offline });
    const onDone = vi.fn();
    renderWithProviders(<QuestsScreen place="lesson" steps={steps} onDone={onDone} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open chest' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open the chest' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('the quests from Learn', () => {
  it('say when they did not load and ask again, then list today’s quests with a chest to open and a way out', async () => {
    testAuth.client = fakeClient({ 'GET /me/quests': inTurn(offline, ok(day)) });
    const onDone = vi.fn();
    renderWithProviders(<QuestsScreen place="learn" onDone={onDone} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Finish a lesson with no mistakes: 1 of 1, Chest ready to open')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open chest' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('go back to the list after the last chest, with it opened', async () => {
    testAuth.client = fakeClient({
      'GET /me/quests': ok({ ...day, quests: day.quests.slice(0, 2) }),
      'POST /me/quests/q%3Astreak/claim': opening('q:streak', 12, 1252),
    });
    const onDone = vi.fn();
    renderWithProviders(<QuestsScreen place="learn" onDone={onDone} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open chest' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open the chest' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByLabelText('Keep your streak going: 1 of 1, Chest opened')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open chest' })).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });
});
