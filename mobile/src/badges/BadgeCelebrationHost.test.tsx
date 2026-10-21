// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from '../play/testing/navigation';
import { BadgeCelebrationHost, useCelebrationHold } from './BadgeCelebrationHost';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
// the user's own channel: here the test is the channel
const userEvents = vi.hoisted(() => ({ handler: null as ((e: unknown) => void) | null }));
vi.mock('../realtime/useUserEvents', () => ({
  useUserEvents: (h: (e: unknown) => void) => {
    userEvents.handler = h;
  },
}));

const unseen = [
  { key: 'agir', family: 'habit', tier: 1, tierKey: 'sifir', secret: false, earnedAt: '2026-10-14T09:00:00Z' },
  { key: 'agir', family: 'habit', tier: 2, tierKey: 'ziv', secret: false, earnedAt: '2026-10-14T09:00:00Z' },
  { key: 'tire-rast', family: 'secret', tier: 1, tierKey: 'zer', secret: true, earnedAt: '2026-10-14T09:01:00Z' },
];

function Holding({ hold }: { hold: boolean }): React.JSX.Element {
  useCelebrationHold(hold);
  return <></>;
}

describe('BadgeCelebrationHost', () => {
  afterEach(() => {
    cleanup();
    navigation.navigate.mockClear();
  });

  it('celebrates what was earned while the app was closed, one badge at a time and each at its highest tier', async () => {
    const client = fakeClient({ 'GET /me/badges/unseen': ok({ unseen }), 'POST /me/badges/seen': ok({ seen: true }) });
    testAuth.client = client;
    renderWithProviders(<BadgeCelebrationHost>{null}</BadgeCelebrationHost>);
    expect(await screen.findByText('Agir', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText('Badge tier up')).toBeTruthy();
    expect(screen.getByText('30 days')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(client.calls.some((c) => c.method === 'POST' && JSON.stringify(c.body) === JSON.stringify({ keys: ['agir'] }))).toBe(true));
    // the secret comes next, said as a secret found
    expect(await screen.findByText('Secret found', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText('Tîrê rast')).toBeTruthy();
  });

  it('waits while a game’s own result holds the stage', async () => {
    testAuth.client = fakeClient({ 'GET /me/badges/unseen': ok({ unseen: [unseen[0]] }) });
    const { rerender } = renderWithProviders(
      <BadgeCelebrationHost>
        <Holding hold />
      </BadgeCelebrationHost>,
    );
    await new Promise((r) => setTimeout(r, 1600));
    expect(screen.queryByText('Agir')).toBeNull();
    rerender(
      <BadgeCelebrationHost>
        <Holding hold={false} />
      </BadgeCelebrationHost>,
    );
    expect(await screen.findByText('Agir', {}, { timeout: 3000 })).toBeTruthy();
  });

  it('opens the badges page from the moment', async () => {
    testAuth.client = fakeClient({ 'GET /me/badges/unseen': ok({ unseen: [unseen[0]] }), 'POST /me/badges/seen': ok({ seen: true }) });
    renderWithProviders(<BadgeCelebrationHost>{null}</BadgeCelebrationHost>);
    fireEvent.click(await screen.findByRole('button', { name: 'See your badges' }, { timeout: 3000 }));
    expect(navigation.navigate).toHaveBeenCalledWith('Badges');
  });

  it('is felt when it was just earned, and only shown when it was waiting from before', async () => {
    const felt: HapticEvent[] = [];
    resetHaptics();
    const stop = onHaptic((e) => felt.push(e));
    try {
      testAuth.client = fakeClient({ 'GET /me/badges/unseen': ok({ unseen: [unseen[0]] }), 'POST /me/badges/seen': ok({ seen: true }) });
      renderWithProviders(<BadgeCelebrationHost>{null}</BadgeCelebrationHost>);
      expect(await screen.findByText('Agir', {}, { timeout: 3000 })).toBeTruthy();
      // past the moment it would have been felt: opening the app is not something to buzz for
      await new Promise((r) => setTimeout(r, 600));
      expect(felt).toEqual([]);
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      // earned now, while the app is open
      userEvents.handler?.({ type: 'badge_unlocked', key: 'tire-rast', family: 'secret', tier: 1, tierKey: 'zer', secret: true });
      expect(await screen.findByText('Secret found', {}, { timeout: 3000 })).toBeTruthy();
      await waitFor(() => expect(felt).toEqual(['celebrate']));
    } finally {
      stop();
    }
  });
});
