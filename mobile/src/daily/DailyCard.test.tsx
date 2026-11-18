// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../theme/Fire', () => import('../theme/testing/fireProbe'));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { refocus } from '../play/testing/navigation';
import { DailyCard } from './DailyCard';
import { TODAY_PATH, fourDayView } from './testing/today';

/* The daily view's card on Home: the streak, the week as dots and today's Zêr in one mark, opening the whole view. */

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

describe('the daily card', () => {
  it('says the streak and today’s Zêr in one tap that opens the daily view', async () => {
    testAuth.client = fakeClient({ [TODAY_PATH]: ok(fourDayView()) });
    renderWithProviders(<DailyCard />);
    const card = await screen.findByRole('button', { name: '4 days. +20 Zêr to claim today' });
    expect(screen.getAllByTestId(/^mini-/)).toHaveLength(7);
    expect(screen.getByTestId('daily-card-claim')).toBeTruthy();
    fireEvent.click(card);
    expect(await screen.findByLabelText('4 day streak')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Claim' })).toBeTruthy();
  });

  it('says when today’s Zêr waits for a lesson, and when it is taken', async () => {
    testAuth.client = fakeClient({ [TODAY_PATH]: ok(fourDayView({ daily: { canClaim: false, learnedToday: false, claimableDay: 3, reward: 20, cycleDay: 2 } })) });
    renderWithProviders(<DailyCard />);
    expect(await screen.findByRole('button', { name: '4 days. +20 Zêr after today’s lesson' })).toBeTruthy();
    cleanup();
    testAuth.client = fakeClient({ [TODAY_PATH]: ok(fourDayView({ daily: { canClaim: false, learnedToday: true, alreadyClaimedToday: true, claimableDay: 3, reward: 20, cycleDay: 3 } })) });
    renderWithProviders(<DailyCard />);
    expect(await screen.findByRole('button', { name: '4 days. Today’s Zêr is claimed' })).toBeTruthy();
    expect(screen.getByTestId('daily-card-claimed')).toBeTruthy();
  });

  it('asks again each time Home comes back', async () => {
    const client = fakeClient({ [TODAY_PATH]: ok(fourDayView()) });
    testAuth.client = client;
    renderWithProviders(<DailyCard />);
    await screen.findByTestId('daily-card');
    const asked = () => client.calls.filter((c) => c.path === '/me/today?weekStart=1').length;
    const before = asked();
    act(() => refocus());
    await waitFor(() => expect(asked()).toBe(before + 1));
  });

  it('gives up its place when the view cannot be had', async () => {
    const client = fakeClient({ [TODAY_PATH]: fail({ code: 'NOT_FOUND', status: 404, message: 'not found' }) });
    testAuth.client = client;
    const { container } = renderWithProviders(<DailyCard />);
    await waitFor(() => expect(client.calls).toHaveLength(1));
    // Its grey placeholder goes too, and nothing takes its place.
    await waitFor(() => expect(container.textContent).toBe(''));
    expect(screen.queryByTestId('daily-card')).toBeNull();
  });
});
