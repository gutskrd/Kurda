// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from '../play/testing/navigation';
import { Share, Text } from 'react-native';
import { BadgeCelebrationHost, useCelebrationHold, useFreshBadges } from './BadgeCelebrationHost';
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

/** What a page would mark "New": the fresh keys, in one line. */
function Fresh(): React.JSX.Element {
  const fresh = useFreshBadges();
  return <Text>{[...fresh].sort().join(',') || 'none'}</Text>;
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

  it('tells the pages which badges are news this session, before and after their celebration', async () => {
    testAuth.client = fakeClient({ 'GET /me/badges/unseen': ok({ unseen }), 'POST /me/badges/seen': ok({ seen: true }) });
    renderWithProviders(
      <BadgeCelebrationHost>
        <Fresh />
      </BadgeCelebrationHost>,
    );
    expect(await screen.findByText('agir,tire-rast')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }, { timeout: 3000 }));
    // celebrated, and still news until the app is next opened
    expect(screen.getByText('agir,tire-rast')).toBeTruthy();
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

/*
 * Under the two ways on, a quiet Share: the badge by its name and the site's
 * address, and nothing of who earned it.
 */
describe('sharing a badge', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    navigation.navigate.mockClear();
  });

  it('offers one quiet Share under the ways on, and shares the badge by its name with the site’s address', async () => {
    const share = vi.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    const client = fakeClient({ 'GET /me/badges/unseen': ok({ unseen: [unseen[1]] }), 'POST /me/badges/seen': ok({ seen: true }) });
    testAuth.client = client;
    renderWithProviders(<BadgeCelebrationHost>{null}</BadgeCelebrationHost>);
    const onward = await screen.findByRole('button', { name: 'Continue' }, { timeout: 3000 });
    const see = screen.getByRole('button', { name: 'See your badges' });
    const button = screen.getByRole('button', { name: 'Share' });
    expect(screen.getAllByRole('button', { name: 'Share' })).toHaveLength(1);
    // after both ways on, in the order they are read and reached
    expect(onward.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(see.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(button);
    expect(share).toHaveBeenCalledTimes(1);
    const { message } = share.mock.calls[0]?.[0] as { message: string };
    expect(message).toBe('I earned the “Agir” badge on Hevalo.\nhttps://hevalo.app');
    // the account is "rojda": neither the name nor a page about them is in it
    for (const theirs of [testAuth.user.username, testAuth.user.email, '/users/', '/profile', '@']) expect(message).not.toContain(theirs);

    // sharing is not a way on: the badge is still there, not yet marked seen, and nobody was taken anywhere
    expect(screen.getByText('Agir')).toBeTruthy();
    expect(client.calls.some((c) => c.method === 'POST' && c.path === '/me/badges/seen')).toBe(false);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('shares a secret badge by the name it has once it is found', async () => {
    const share = vi.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    testAuth.client = fakeClient({ 'GET /me/badges/unseen': ok({ unseen: [unseen[2]] }), 'POST /me/badges/seen': ok({ seen: true }) });
    renderWithProviders(<BadgeCelebrationHost>{null}</BadgeCelebrationHost>);
    expect(await screen.findByText('Secret found', {}, { timeout: 3000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect((share.mock.calls[0]?.[0] as { message: string }).message).toBe('I earned the “Tîrê rast” badge on Hevalo.\nhttps://hevalo.app');
  });
});
