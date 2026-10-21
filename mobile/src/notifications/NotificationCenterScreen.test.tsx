// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
const navigate = vi.fn();
vi.mock('@react-navigation/native', async () => {
  const { useEffect } = await import('react');
  return {
    useNavigation: () => ({ navigate, goBack: vi.fn() }),
    // the screen is in front: its focus effect runs once, as on arrival
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
    useScrollToTop: () => undefined,
  };
});
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { IncomingInvite } from '@kurda/shared';
import type { InboxItem } from './inbox';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { NotificationCenterScreen } from './NotificationCenterScreen';

patchReactNativeWeb();

beforeEach(() => navigate.mockReset());
afterEach(() => cleanup());

const DAY = 86_400_000;
// "now", three days back and three weeks back: one in each stretch, whatever the hour the test runs
const when = (ago: number) => new Date(Date.now() - ago).toISOString();

const notice = (id: string, over: Partial<InboxItem>): InboxItem => ({
  id,
  category: 'progress',
  title: 'A new badge',
  body: 'You earned Ders.',
  data: {},
  createdAt: when(0),
  readAt: null,
  ...over,
});

const invite: IncomingInvite = {
  id: 'i1',
  game: 'wordle-battle',
  lobbyId: 'l1',
  status: 'pending',
  from: { name: 'Azad', avatarUrl: null },
  summary: { difficulty: 'easy' },
  rematch: false,
  createdAt: when(60_000),
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
} as IncomingInvite;

function serve(notifications: InboxItem[], incoming: IncomingInvite[] = []) {
  const client = fakeClient({
    'GET /me/notifications': ok({ notifications }),
    'GET /play/invites': ok({ incoming, outgoing: [] }),
    'POST /me/notifications/read-all': ok({ marked: notifications.length }),
    'POST /play/invites/i1/accept': ok({ game: 'wordle-battle', lobbyId: 'l1' }),
    'POST /me/notifications/n1/read': ok({ ok: true }),
  });
  testAuth.client = client;
  return client;
}

/** react-native-web wires a press in an effect after the draw: let it run first. */
const settle = () => act(async () => undefined);

describe('the notification list', () => {
  it('holds its place with rows in grey while it loads', async () => {
    testAuth.client = fakeClient({ 'GET /me/notifications': () => new Promise(() => undefined), 'GET /play/invites': ok({ incoming: [], outgoing: [] }) });
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(8);
    expect(screen.getByLabelText('Loading…')).toBeTruthy();
  });

  /*
   * Today, This week, Earlier — and unread said in words as well as by the
   * dot and the tint, so a screen reader hears what the eye sees.
   */
  it('cuts the list into Today, This week and Earlier, and says which are unread', async () => {
    serve([
      notice('n1', { createdAt: when(0) }),
      notice('n2', { title: 'Safe this week', createdAt: when(3 * DAY), readAt: when(2 * DAY) }),
      notice('n3', { title: 'Newroz quests are here', createdAt: when(21 * DAY), readAt: when(20 * DAY) }),
    ]);
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    expect(await screen.findByText('Today')).toBeTruthy();
    expect(screen.getByText('This week')).toBeTruthy();
    expect(screen.getByText('Earlier')).toBeTruthy();
    const rows = screen.getAllByRole('button').filter((b) => /badge|Safe|Newroz/.test(b.getAttribute('aria-label') ?? ''));
    expect(rows.map((r) => r.getAttribute('aria-label')?.startsWith('Unread'))).toEqual([true, false, false]);
  });

  it('marks everything read in one tap, and takes the button away once nothing is left unread', async () => {
    const client = serve([notice('n1', {}), notice('n2', { title: 'Safe this week', readAt: null })]);
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    const all = await screen.findByRole('button', { name: 'Mark all as read' });
    await settle();
    fireEvent.click(all);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark all as read' })).toBeNull());
    expect(client.calls.some((c) => c.method === 'POST' && c.path === '/me/notifications/read-all')).toBe(true);
    expect(screen.getAllByRole('button').some((b) => b.getAttribute('aria-label')?.startsWith('Unread'))).toBe(false);
  });

  /*
   * An invite names who sent it while it can still be answered, with Join on
   * the row; joining is the same as opening it — accepted on the way into
   * the game's lobby. Once it has run out there is nothing to join.
   */
  it('offers Join on an invite that can still be answered, and joins on the way into the game', async () => {
    const client = serve([notice('n1', { category: 'games', title: 'Game invite', body: 'Azad invited you to play.', data: { kind: 'play_invite', inviteId: 'i1', game: 'wordle-battle', lobbyId: 'l1' } })], [invite]);
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    const join = await screen.findByRole('button', { name: 'Join' });
    expect(screen.getByText('Azad').tagName).toBeTruthy();
    expect(screen.getAllByRole('button').some((b) => /^Unread\. Azad invited you to /.test(b.getAttribute('aria-label') ?? ''))).toBe(true);
    await settle();
    fireEvent.click(join);
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(client.calls.some((c) => c.path === '/play/invites/i1/accept')).toBe(true);
    expect(client.calls.some((c) => c.path === '/me/notifications/n1/read')).toBe(true);
  });

  it('has no Join on an invite that has run out', async () => {
    serve([notice('n1', { category: 'games', title: 'Game invite', body: 'Azad invited you to play.', data: { kind: 'play_invite', inviteId: 'i1', game: 'wordle-battle', lobbyId: 'l1' } })], []);
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    expect(await screen.findByText('Game invite')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull();
  });

  it('opens the notification settings from the header', async () => {
    serve([notice('n1', { readAt: when(0) })]);
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    await screen.findByText('Today');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Notification settings' }));
    expect(navigate).toHaveBeenCalledWith('Notifications');
  });

  it('says it is all caught up with nothing in it, with one way on', async () => {
    serve([]);
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    expect(await screen.findByText('You’re all caught up.')).toBeTruthy();
    expect(screen.getByText('Game invites, gifts, badges and news from Hevalo will show up here.')).toBeTruthy();
    // the one way on: finding the friends most of this list comes from
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Find friends' }));
    expect(navigate).toHaveBeenCalledWith('Tabs', { screen: 'Search' });
  });

  it('says it could not load without blaming anybody, and tries again', async () => {
    let answers = 0;
    testAuth.client = fakeClient({
      'GET /me/notifications': () => {
        answers += 1;
        return answers === 1
          ? { ok: false, error: { kind: 'server', message: 'boom', status: 500 } }
          : ok({ notifications: [notice('n1', {})] });
      },
      'GET /play/invites': ok({ incoming: [], outgoing: [] }),
    });
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    expect(await screen.findByText('Couldn’t load')).toBeTruthy();
    expect(screen.getByText('Something went wrong on our end. Please try again shortly.')).toBeTruthy();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('A new badge')).toBeTruthy();
  });
});
