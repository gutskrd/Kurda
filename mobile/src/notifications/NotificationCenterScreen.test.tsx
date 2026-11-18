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
    // The screen is in front: its focus effect runs once, as on arrival.
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
    useScrollToTop: () => undefined,
  };
});
// What the bell is told is unread, as this screen counts it.
const report = vi.fn();
vi.mock('../messages/unread', async (original) => ({
  ...(await original<typeof import('../messages/unread')>()),
  useUnread: () => ({ counts: { chats: 0, groups: 0, requests: 0, notifications: 0, gifts: 0 }, messages: 0, refresh: () => undefined, report }),
}));
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Alert } from 'react-native';
import type { IncomingInvite } from '@kurda/shared';
import type { InboxItem } from './inbox';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { NotificationCenterScreen } from './NotificationCenterScreen';
import { onHaptic, resetHaptics } from '../feedback/haptics';

patchReactNativeWeb();

beforeEach(() => {
  navigate.mockReset();
  report.mockReset();
});
afterEach(() => cleanup());

const DAY = 86_400_000;
// "Now", three days back and three weeks back: one in each stretch, whatever the hour the test runs.
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

function serve(notifications: InboxItem[], incoming: IncomingInvite[] = [], more: Parameters<typeof fakeClient>[0] = {}) {
  const client = fakeClient({
    ...more,
    'GET /me/notifications': ok({ notifications }),
    'GET /play/invites': ok({ incoming, outgoing: [] }),
    'POST /me/notifications/read-all': ok({ marked: notifications.length }),
    'POST /play/invites/i1/accept': ok({ game: 'wordle-battle', lobbyId: 'l1' }),
    'POST /me/notifications/n1/read': ok({ ok: true }),
  });
  testAuth.client = client;
  return client;
}

/** React-native-web wires a press in an effect after the draw: let it run first. */
const settle = () => act(async () => undefined);

describe('the notification list', () => {
  it('holds its place with rows in grey while it loads', async () => {
    testAuth.client = fakeClient({ 'GET /me/notifications': () => new Promise(() => undefined), 'GET /play/invites': ok({ incoming: [], outgoing: [] }) });
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(8);
    expect(screen.getByLabelText('Loading…')).toBeTruthy();
  });

  /* Today, This week, Earlier, with unread said in words as well as by the dot and tint. */
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

  it('marks everything read and the bell clear before the server answers, and puts both back with the reason when refused', async () => {
    const said = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    let answer: (r: unknown) => void = () => undefined;
    testAuth.client = fakeClient({
      'GET /me/notifications': ok({ notifications: [notice('n1', {}), notice('n2', { title: 'Safe this week', readAt: null })] }),
      'GET /play/invites': ok({ incoming: [], outgoing: [] }),
      'POST /me/notifications/read-all': () => new Promise((resolve) => (answer = resolve)),
    } as never);
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    const all = await screen.findByRole('button', { name: 'Mark all as read' });
    await settle();
    expect(report).toHaveBeenLastCalledWith({ notifications: 2 });
    fireEvent.click(all);
    await waitFor(() => expect(report).toHaveBeenLastCalledWith({ notifications: 0 }));
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).toBeNull();
    await act(async () => answer({ ok: false, error: { kind: 'network', message: 'network request failed' } }));
    expect(report).toHaveBeenLastCalledWith({ notifications: 2 });
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeTruthy();
    expect(said).toHaveBeenCalledWith('Can’t reach Hevalo right now. Check your connection and try again.');
    said.mockRestore();
  });

  /*
   * An invite names its sender while it can still be answered, with Join on the row; joining accepts it on the way into
   * the lobby. Once expired there is nothing to join.
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
    // The one way on: finding the friends most of this list comes from.
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Find friends' }));
    expect(navigate).toHaveBeenCalledWith('Search');
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

/** A finger on `from`, pulled sideways `dx` points in steps of 20 and let go slowly, so it lifts with no speed. */
function pull(from: Element, dx: number): void {
  let time = 1_000_000;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => time);
  const at = (x: number) => ({ clientX: x, clientY: 300, pageX: x, pageY: 300, buttons: 1 });
  fireEvent.mouseDown(from, { ...at(300), button: 0 });
  for (let x = 300; Math.abs(x - 300) < Math.abs(dx); x += Math.sign(dx) * 20) {
    fireEvent.mouseMove(from, at(x));
    time += 1;
  }
  fireEvent.mouseMove(from, at(300 + dx));
  time += 200;
  fireEvent.mouseUp(from, at(300 + dx));
  // A browser clicks where the mouse is let go, at the end of a pull, which must not count as a tap.
  fireEvent.click(from);
  clock.mockRestore();
}

/** A finger down on `on` and up again, which is a tap. */
function tap(on: Element): void {
  fireEvent.mouseDown(on, { button: 0, buttons: 1 });
  fireEvent.mouseUp(on, { button: 0 });
  fireEvent.click(on);
}

describe('a notification row pulled aside', () => {
  const two = () => [notice('n1', { title: 'A new badge' }), notice('n2', { title: 'Safe this week', category: 'events' })];

  /*
   * Pulled toward its start past halfway, a row stays open on Settings and Delete; Delete goes to the server, the row
   * goes, and the bell counts one fewer.
   */
  it('opens on Settings and Delete, and deletes from there, with the bell counting one fewer', async () => {
    const client = serve(two(), [], { 'DELETE /me/notifications/n1': ok({ ok: true, unread: 1 }) });
    resetHaptics();
    const felt: string[] = [];
    const stop = onHaptic((e) => felt.push(e));
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    const row = await screen.findByText('A new badge');
    await settle();
    expect(screen.queryByRole('button', { name: 'Delete: A new badge' })).toBeNull();
    await waitFor(() => expect(report).toHaveBeenLastCalledWith({ notifications: 2 }));
    pull(row, -120);
    const remove = await screen.findByRole('button', { name: 'Delete: A new badge' });
    // Beside the header's own gear, the row's way to the settings.
    expect(screen.getAllByRole('button', { name: 'Notification settings' })).toHaveLength(2);
    await settle();
    fireEvent.click(remove);
    await waitFor(() => expect(client.calls.some((c) => c.method === 'DELETE' && c.path === '/me/notifications/n1')).toBe(true));
    await waitFor(() => expect(screen.queryByText('A new badge')).toBeNull());
    expect(screen.getByText('Safe this week')).toBeTruthy();
    expect(report).toHaveBeenLastCalledWith({ notifications: 1 });
    // Nothing was opened on the way.
    expect(navigate).not.toHaveBeenCalled();
    // A light knock as it opened, and another as it went.
    expect(felt).toEqual(['tap', 'tap']);
    stop();
  });

  it('deletes at once when pulled most of the way across, and keeps it gone when it already was', async () => {
    // Already taken away from another device: gone is what was asked for.
    const client = serve(two(), [], { 'DELETE /me/notifications/n2': { ok: false, error: { kind: 'client', message: 'gone', status: 404 } } });
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    const row = await screen.findByText('Safe this week');
    await settle();
    pull(row, -280);
    await waitFor(() => expect(client.calls.some((c) => c.method === 'DELETE' && c.path === '/me/notifications/n2')).toBe(true));
    await waitFor(() => expect(screen.queryByText('Safe this week')).toBeNull());
    expect(screen.getByText('A new badge')).toBeTruthy();
  });

  it('puts a row back when the server would not delete it, and says why', async () => {
    const said = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    // Something went wrong on the server's side, a moment after it was asked.
    const refused = { ok: false as const, error: { kind: 'server' as const, message: 'boom', status: 500 } };
    serve(two(), [], { 'DELETE /me/notifications/n2': () => new Promise((answer) => setTimeout(() => answer(refused), 60)) });
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    const row = await screen.findByText('Safe this week');
    await settle();
    pull(row, -280);
    // Gone at once, and the bell counts one fewer, before the server has answered.
    await waitFor(() => expect(report).toHaveBeenLastCalledWith({ notifications: 1 }));
    // Back, and counted again, once it has.
    await waitFor(() => expect(report).toHaveBeenLastCalledWith({ notifications: 2 }));
    await act(() => new Promise((done) => setTimeout(done, 400)));
    expect(screen.getByText('Safe this week')).toBeTruthy();
    expect(said).toHaveBeenCalledWith('Something went wrong on our end. Please try again shortly.');
    said.mockRestore();
  });

  it('springs back closed when let go short of halfway, and closes on a tap rather than opening', async () => {
    serve([notice('n1', { title: 'A new badge', data: { kind: 'badge', day: '2026-10-14' } })]);
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    const row = await screen.findByText('A new badge');
    await settle();
    pull(row, -40);
    expect(screen.queryByRole('button', { name: 'Delete: A new badge' })).toBeNull();
    pull(row, -120);
    expect(await screen.findByRole('button', { name: 'Delete: A new badge' })).toBeTruthy();
    await settle();
    tap(row);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete: A new badge' })).toBeNull());
    expect(navigate).not.toHaveBeenCalled();
    // Closed, the same tap opens it.
    await settle();
    tap(row);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('Badges'));
  });

  it('opens the notification settings from under a row', async () => {
    serve(two());
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    const row = await screen.findByText('A new badge');
    await settle();
    pull(row, -120);
    await screen.findByRole('button', { name: 'Delete: A new badge' });
    await settle();
    // The header's gear is the first, the row's own the second.
    const settings = screen.getAllByRole('button', { name: 'Notification settings' });
    expect(settings).toHaveLength(2);
    fireEvent.click(settings[1]!);
    expect(navigate).toHaveBeenCalledWith('Notifications');
  });
});

describe('the notification list’s filters and pictures', () => {
  it('offers a filter for each kind it has, and shows only that kind under it', async () => {
    serve([
      notice('n1', { category: 'friends', title: 'You have a gift', data: { kind: 'gift', giftId: 'g1', chat: 'dm:u1' } }),
      notice('n2', { category: 'streak', title: 'Keep your streak' }),
      notice('n3', { category: 'events', title: 'Newroz is coming' }),
    ]);
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    const filters = await screen.findByRole('group', { name: 'Show notifications' });
    const chips = within(filters).getAllByRole('button');
    expect(chips.map((b) => b.getAttribute('aria-label'))).toEqual(['All', 'People', 'Progress', 'From Hevalo']);
    await settle();
    fireEvent.click(within(filters).getByRole('button', { name: 'Progress' }));
    await waitFor(() => expect(screen.queryByText('Newroz is coming')).toBeNull());
    expect(screen.getByText('Keep your streak')).toBeTruthy();
    expect(screen.queryByText('You have a gift')).toBeNull();
  });

  it('has no filters while everything in it is one kind', async () => {
    serve([notice('n1', {}), notice('n2', { title: 'Safe this week' })]);
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    await screen.findByText('Safe this week');
    expect(screen.queryByRole('group', { name: 'Show notifications' })).toBeNull();
  });

  it('draws what one is about at the end of its row where it can be drawn, and nothing for a plain notice', async () => {
    serve([
      notice('n1', { title: 'Promoted', data: { kind: 'league_promotion', tier: 'kani' } }),
      notice('n2', { category: 'events', title: 'Newroz is coming' }),
    ]);
    const { container } = renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    await screen.findByText('Newroz is coming');
    expect(container.querySelectorAll('[data-testid^="notice-picture-"]')).toHaveLength(1);
    const league = screen.getByTestId('notice-picture-league');
    expect(league.querySelector('svg')?.getAttribute('data-xml')).toBe('drawn');
    // Nobody is named in either, so both wear Hevalo’s own mark.
    expect(screen.getAllByTestId('notice-from-hevalo')).toHaveLength(2);
  });

  it('names who sent a gift, in bold, when they are a friend, with the time after the words', async () => {
    serve([notice('n1', { category: 'friends', title: 'You have a gift', body: 'berfin sent you Gola Şîn.', data: { kind: 'gift', giftId: 'g1', chat: 'dm:u-berfin', fromUserId: 'u-berfin' } })], [], {
      'GET /friends': ok({ total: 1, friends: [{ userId: 'u-berfin', username: 'berfin', displayName: 'Berfin', avatarUrl: null }] }),
    });
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    expect(await screen.findByText('Berfin')).toBeTruthy();
    // Each piece said once, with one full stop between them.
    expect(screen.getByRole('button', { name: 'Unread. Berfin sent you a gift. berfin sent you Gola Şîn. just now' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy();
    expect(screen.queryByTestId('notice-from-hevalo')).toBeNull();
    expect(screen.getByTestId('notice-picture-gift')).toBeTruthy();
  });
});
