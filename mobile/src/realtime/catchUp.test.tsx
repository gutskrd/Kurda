// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { ChatScreen } from '../chat/ChatScreen';
import { GroupThreadScreen } from '../groups/GroupThreadScreen';
import { RealtimeProvider } from './RealtimeProvider';
import { appendOnce, mergeLatest } from './catchUp';
import { FakeSocket } from './testing/fakeSocket';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
// the loading skeleton asks the OS about Reduce Motion, which the web stand-in cannot answer
vi.mock('../a11y/useReducedMotion', () => ({ useReducedMotion: () => false }));

/** navigation whose focus the test can give back, as when a screen on top is closed */
const focus = vi.hoisted(() => ({ effects: new Set<() => void>() }));
vi.mock('@react-navigation/native', async () => {
  const React = await import('react');
  const nav = { navigate: () => undefined, replace: () => undefined, goBack: () => undefined };
  return {
    useNavigation: () => nav,
    useFocusEffect: (effect: () => void) => {
      React.useEffect(() => {
        focus.effects.add(effect);
        effect();
        return () => {
          focus.effects.delete(effect);
        };
      }, [effect]);
    },
  };
});

const msg = (id: string, at: number, over: { senderId?: string; body?: string; readAt?: string | null } = {}) => ({
  id,
  senderId: 'u2',
  body: `message ${id}`,
  createdAt: new Date(Date.UTC(2026, 9, 1, 12, 0, at)).toISOString(),
  readAt: null as string | null,
  ...over,
});

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

describe('mergeLatest', () => {
  it('adds what is new, takes the server copy of what both have, and keeps the thread oldest first', () => {
    const held = [msg('a', 1), msg('b', 2, { readAt: null }), msg('mine', 5)];
    const latest = [msg('b', 2, { readAt: 'now' }), msg('c', 3), msg('mine', 5)];
    expect(mergeLatest(held, latest).map((m) => [m.id, m.readAt ?? null])).toEqual([
      ['a', null],
      ['b', 'now'],
      ['c', null],
      ['mine', null],
    ]);
  });

  it('starts from the latest page when more arrived than one page holds', () => {
    expect(mergeLatest([msg('a', 1)], [msg('x', 8), msg('y', 9)]).map((m) => m.id)).toEqual(['x', 'y']);
    expect(mergeLatest([msg('a', 1)], []).map((m) => m.id)).toEqual(['a']);
    expect(mergeLatest([], [msg('x', 8)]).map((m) => m.id)).toEqual(['x']);
  });
});

describe('appendOnce', () => {
  it('adds a message the thread does not have, and leaves the thread as it is when it does', () => {
    const held = [msg('a', 1)];
    expect(appendOnce(held, msg('b', 2)).map((m) => m.id)).toEqual(['a', 'b']);
    expect(appendOnce(held, msg('a', 1))).toBe(held);
  });
});

describe('a thread on the shared connection', () => {
  const realWebSocket = globalThis.WebSocket;
  beforeEach(() => {
    FakeSocket.all = [];
    focus.effects.clear();
    (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket;
  });
  afterEach(() => {
    cleanup();
    (globalThis as { WebSocket?: unknown }).WebSocket = realWebSocket;
  });

  it('shows a direct message that arrived while the app was away, once the connection is back', async () => {
    let page = [msg('m1', 1)];
    const client = fakeClient({
      'POST /realtime/ticket': ok({ ticket: 'tk' }),
      'GET /chat/u2/messages': () => ok({ messages: page }),
      'POST /chat/u2/read': ok({ ok: true }),
    });
    testAuth.client = client;
    renderWithProviders(
      <RealtimeProvider>
        <ChatScreen userId="u2" username="Azad" onExit={() => undefined} />
      </RealtimeProvider>,
    );
    expect(await screen.findByText('message m1')).toBeTruthy();
    await flush();
    act(() => FakeSocket.all[0]!.hello());
    await flush();

    // away: the socket closed, and the friend wrote meanwhile
    page = [msg('m1', 1), msg('m2', 2)];
    act(() => {
      FakeSocket.all[0]!.close();
      FakeSocket.all[0]!.onclose?.({ code: 1006 });
    });
    await waitFor(() => expect(FakeSocket.all.length).toBe(2), { timeout: 3000 });
    act(() => FakeSocket.all[1]!.hello());
    expect(await screen.findByText('message m2')).toBeTruthy();
    expect(screen.getAllByText('message m1')).toHaveLength(1);
  });

  it('shows a message once when the catch-up read it before it was pushed live', async () => {
    let page = [msg('m1', 1)];
    testAuth.client = fakeClient({
      'POST /realtime/ticket': ok({ ticket: 'tk' }),
      'GET /chat/u2/messages': () => ok({ messages: page }),
      'POST /chat/u2/read': ok({ ok: true }),
    });
    renderWithProviders(
      <RealtimeProvider>
        <ChatScreen userId="u2" username="Azad" onExit={() => undefined} />
      </RealtimeProvider>,
    );
    expect(await screen.findByText('message m1')).toBeTruthy();
    await flush();
    // the connection comes back: the catch-up reads m2, which was saved a moment ago
    page = [msg('m1', 1), msg('m2', 2)];
    act(() => FakeSocket.all[0]!.hello());
    expect(await screen.findByText('message m2')).toBeTruthy();
    // and only then is m2 pushed live
    act(() => FakeSocket.all[0]!.push('user:me', { type: 'dm', from: 'u2', message: msg('m2', 2) }));
    await flush();
    expect(screen.getAllByText('message m2')).toHaveLength(1);
  });

  it('shows the card of a game started from this chat when the thread is shown again', async () => {
    let page = [msg('m1', 1)];
    testAuth.client = fakeClient({
      'POST /realtime/ticket': ok({ ticket: 'tk' }),
      'GET /chat/u2/messages': () => ok({ messages: page }),
      'POST /chat/u2/read': ok({ ok: true }),
    });
    renderWithProviders(<ChatScreen userId="u2" username="Azad" onExit={() => undefined} />);
    expect(await screen.findByText('message m1')).toBeTruthy();
    page = [msg('m1', 1), msg('m2', 2, { senderId: 'me', body: 'back from the lobby' })];
    act(() => {
      for (const effect of focus.effects) effect();
    });
    expect(await screen.findByText('back from the lobby')).toBeTruthy();
  });

  it('catches a group thread up after the connection comes back', async () => {
    const member = (id: string, at: number) => ({ ...msg(id, at), username: 'azad', avatarUrl: null, deleted: false });
    let page = [member('g1', 1)];
    testAuth.client = fakeClient({
      'POST /realtime/ticket': ok({ ticket: 'tk' }),
      'GET /groups/grp/chat': () => ok({ messages: page }),
      'POST /groups/grp/chat/read': ok({ ok: true }),
    });
    renderWithProviders(
      <RealtimeProvider>
        <GroupThreadScreen groupId="grp" name="Hevalên" onExit={() => undefined} onOpenMembers={() => undefined} onLeft={() => undefined} />
      </RealtimeProvider>,
    );
    expect(await screen.findByText('message g1')).toBeTruthy();
    await flush();
    page = [member('g1', 1), member('g2', 2)];
    act(() => FakeSocket.all[0]!.hello());
    expect(await screen.findByText('message g2')).toBeTruthy();
  });
});
