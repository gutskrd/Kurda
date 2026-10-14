// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { RealtimeProvider } from './RealtimeProvider';
import { useUserEvents, type UserEvent } from './useUserEvents';
import { useRoomEvents, type RoomEvent } from './useRoomEvents';
import { useChatSocket, type ChatEvent } from '../chat/useChatSocket';
import { FakeSocket } from './testing/fakeSocket';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

function Listeners({
  onUser,
  onChat,
  onRoom,
}: {
  onUser: (e: UserEvent) => void;
  onChat: (e: ChatEvent) => void;
  onRoom: (e: RoomEvent) => void;
}) {
  useUserEvents(onUser);
  useChatSocket(onChat);
  useRoomEvents('group:g1', onRoom);
  return null;
}

describe('RealtimeProvider', () => {
  const realWebSocket = globalThis.WebSocket;
  beforeEach(() => {
    FakeSocket.all = [];
    (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket;
    testAuth.client = fakeClient({ 'POST /realtime/ticket': ok({ ticket: 'tk' }) });
  });
  afterEach(() => {
    cleanup();
    (globalThis as { WebSocket?: unknown }).WebSocket = realWebSocket;
  });

  it('serves every hook from one socket, each hearing only its own events', async () => {
    const user: UserEvent[] = [];
    const chat: ChatEvent[] = [];
    const room: RoomEvent[] = [];
    render(
      <RealtimeProvider>
        <Listeners onUser={(e) => user.push(e)} onChat={(e) => chat.push(e)} onRoom={(e) => room.push(e)} />
      </RealtimeProvider>,
    );
    await flush();
    expect(FakeSocket.all).toHaveLength(1);
    const ws = FakeSocket.all[0]!;
    expect(ws.url).toBe('ws://api.test/realtime?ticket=tk');
    act(() => ws.hello());
    expect(ws.sent).toEqual([{ type: 'join', room: 'group:g1' }]);

    act(() => {
      ws.push('user:me', { type: 'play_invite', invite: { id: 'i1' } });
      ws.push('user:me', { type: 'dm', from: 'u2', message: { id: 'm1' } });
      ws.push('group:g1', { type: 'group_msg', groupId: 'g1' });
      ws.push('group:g1', { type: 'play_changed', game: 'stories', lobbyId: 'l' });
      ws.push('group:other', { type: 'group_msg', groupId: 'other' });
    });
    expect(user.map((e) => e.type)).toEqual(['play_invite']);
    expect(chat.map((e) => e.type)).toEqual(['dm']);
    expect(room.map((e) => e.type)).toEqual(['group_msg', 'play_changed']);
  });

  it('closes when the app goes to the background and reconnects when it comes back', async () => {
    render(
      <RealtimeProvider>
        <Listeners onUser={() => undefined} onChat={() => undefined} onRoom={() => undefined} />
      </RealtimeProvider>,
    );
    await flush();
    act(() => FakeSocket.all[0]!.hello());

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(FakeSocket.all[0]!.closed).toBe(true);

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await flush();
    expect(FakeSocket.all).toHaveLength(2);
    expect(FakeSocket.all[1]!.url).toContain('resume=r');
  });

  it('closes the socket when it unmounts (signing out)', async () => {
    const { unmount } = render(
      <RealtimeProvider>
        <Listeners onUser={() => undefined} onChat={() => undefined} onRoom={() => undefined} />
      </RealtimeProvider>,
    );
    await flush();
    unmount();
    expect(FakeSocket.all[0]!.closed).toBe(true);
  });

  it('lets the hooks run outside the provider without doing anything', () => {
    expect(() =>
      render(<Listeners onUser={() => undefined} onChat={() => undefined} onRoom={() => undefined} />),
    ).not.toThrow();
  });
});
