// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { QuestDay } from '@kurda/shared';
import type { ApiResult } from '../api/types';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { QuestsCard } from './QuestsCard';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => navigation.navigate.mockReset());
afterEach(cleanup);

const day: QuestDay = {
  date: '2026-10-29',
  monthDone: 3,
  waiting: [],
  quests: [
    { id: 'q:streak', kind: 'streak', target: 1, progress: 1, chest: 'common', claimable: true, claimed: false },
    { id: 'q:xp', kind: 'xp', target: 40, progress: 25, chest: 'rare', claimable: false, claimed: false },
    { id: 'q:lessons', kind: 'lessons', target: 2, progress: 0, chest: 'epic', claimable: false, claimed: false },
  ],
};
const offline: ApiResult<never> = { ok: false, error: { kind: 'network', message: 'network request failed' } };

describe('the quests card on Learn', () => {
  it('holds its place while today’s quests load, then says how many are done and that a chest waits, with a dot on it', async () => {
    let answer: (r: ApiResult<QuestDay>) => void = () => undefined;
    testAuth.client = fakeClient({ 'GET /me/quests': () => new Promise<ApiResult<QuestDay>>((resolve) => (answer = resolve)) });
    renderWithProviders(<QuestsCard />);
    expect(screen.getByTestId('quests-card-loading')).toBeTruthy();
    expect(screen.queryByTestId('quests-card')).toBeNull();

    answer(ok(day));
    const card = await screen.findByRole('button', { name: 'Daily quests, 1 of 3 done, Chest ready to open' });
    expect(screen.getByTestId('quests-card-dot')).toBeTruthy();
    expect(screen.getByText('Chest ready to open')).toBeTruthy();
    fireEvent.click(card);
    expect(navigation.navigate).toHaveBeenCalledWith('Quests');
  });

  it('has no dot once every chest is open', async () => {
    testAuth.client = fakeClient({ 'GET /me/quests': ok({ ...day, quests: day.quests.map((q) => ({ ...q, claimable: false, claimed: q.progress >= q.target })) }) });
    renderWithProviders(<QuestsCard />);
    expect(await screen.findByRole('button', { name: 'Daily quests, 1 of 3 done' })).toBeTruthy();
    expect(screen.queryByTestId('quests-card-dot')).toBeNull();
  });

  it('puts the dot on for an earlier day’s chest still unopened', async () => {
    const opened = day.quests.map((q) => ({ ...q, claimable: false, claimed: q.progress >= q.target }));
    const earlier = { id: '2026-10-27:lessons', kind: 'lessons' as const, target: 2, progress: 2, chest: 'rare' as const, claimable: true, claimed: false };
    testAuth.client = fakeClient({ 'GET /me/quests': ok({ ...day, quests: opened, waiting: [earlier] }) });
    renderWithProviders(<QuestsCard />);
    expect(await screen.findByRole('button', { name: 'Daily quests, 1 of 3 done, Chest ready to open' })).toBeTruthy();
    expect(screen.getByTestId('quests-card-dot')).toBeTruthy();
  });

  it('says when the quests did not load, and asks again at a tap', async () => {
    let calls = 0;
    testAuth.client = fakeClient({ 'GET /me/quests': () => (calls++ === 0 ? offline : ok(day)) });
    renderWithProviders(<QuestsCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Today’s quests didn’t load. Tap to try again.' }));
    expect(await screen.findByRole('button', { name: 'Daily quests, 1 of 3 done, Chest ready to open' })).toBeTruthy();
  });

  it('is not there on a day with no quests', async () => {
    testAuth.client = fakeClient({ 'GET /me/quests': ok({ ...day, quests: [] }) });
    renderWithProviders(<QuestsCard />);
    await waitFor(() => expect(screen.queryByTestId('quests-card-loading')).toBeNull());
    expect(screen.queryByTestId('quests-card')).toBeNull();
  });
});
