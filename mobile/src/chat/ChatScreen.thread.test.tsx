// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn() }), useFocusEffect: () => undefined }));
// the thread's live events, handed to the test to send
const live: { send: (event: unknown) => void } = { send: () => undefined };
vi.mock('./useChatSocket', () => ({
  useChatSocket: (onEvent: (event: unknown) => void) => {
    live.send = onEvent;
  },
}));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { resetCourseDialect } from '../learn/courseDialect';
import { ChatScreen } from './ChatScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  resetCourseDialect();
});

/** A message so many minutes before now, so "Today" is today whenever the test runs. */
const minutesAgo = (n: number): string => new Date(Date.now() - n * 60_000).toISOString();
const from = (id: string, senderId: string, body: string, ago: number, more: Record<string, unknown> = {}) => ({
  id,
  senderId,
  username: senderId === 'u2' ? 'rojda' : 'me',
  body,
  createdAt: minutesAgo(ago),
  kind: 'text',
  gift: null,
  game: null,
  ...more,
});

function open(routes: Record<string, unknown>) {
  const client = fakeClient({ 'POST /chat/u2/read': ok({ ok: true }), 'POST /chat/u2/typing': ok({ ok: true }), ...routes } as never);
  testAuth.client = client;
  testAuth.user = { ...testAuth.user, id: 'me', username: 'me' };
  renderWithProviders(<ChatScreen userId="u2" username="rojda" onExit={() => undefined} />);
  return client;
}

describe('a conversation as it is read', () => {
  it('draws a run of their messages as one turn: one face at its foot, one tail, and the day over it', async () => {
    open({
      'GET /chat/u2/messages': ok({ messages: [from('m1', 'u2', 'Silav', 3), from('m2', 'u2', 'Çawa yî?', 2), from('m3', 'me', 'Baş im', 1)] }),
    });
    await screen.findByText('Silav');
    // the day is named once, over its first message
    expect(screen.getAllByRole('heading', { name: 'Today' })).toHaveLength(1);
    // two messages of theirs in a row: one face, at the foot of the run, not one beside each
    expect(screen.getAllByTestId('run-face')).toHaveLength(1);
    // a tail on the last bubble of each run: theirs and yours
    expect(screen.getAllByTestId('bubble-tail')).toHaveLength(2);
  });

  it('says "Read" beside the time of your own message once they have read it', async () => {
    open({ 'GET /chat/u2/messages': ok({ messages: [from('m1', 'me', 'Silav', 1, { readAt: minutesAgo(0) })] }) });
    await screen.findByText('Silav');
    expect(screen.getByText(/· Read$/)).toBeTruthy();
  });

  it('shows a message of nothing but emoji large, with no bubble or tail', async () => {
    open({ 'GET /chat/u2/messages': ok({ messages: [from('m1', 'me', '❤️', 1)] }) });
    await screen.findByText('❤️');
    expect(screen.queryByTestId('bubble-tail')).toBeNull();
  });

  it('shows a bubble of dots while they are writing, said to a screen reader as who is typing', async () => {
    open({ 'GET /chat/u2/messages': ok({ messages: [from('m1', 'u2', 'Silav', 1)] }) });
    await screen.findByText('Silav');
    expect(screen.queryByTestId('typing-bubble')).toBeNull();
    act(() => live.send({ type: 'dm_typing', from: 'u2' }));
    expect(screen.getByTestId('typing-bubble')).toBeTruthy();
    expect(screen.getByLabelText('rojda is typing…')).toBeTruthy();
  });

  it('shows their picture and that they are online in the header, from the list of conversations', async () => {
    open({
      'GET /chat/u2/messages': ok({ messages: [from('m1', 'u2', 'Silav', 1)] }),
      'GET /chat/conversations': ok({ conversations: [{ userId: 'u2', username: 'rojda', avatarUrl: null, online: true, lastMessage: 'Silav', lastFromMe: false, unread: 0 }] }),
    });
    await screen.findByText('Silav');
    expect(await screen.findByTestId('header-online')).toBeTruthy();
  });
});

describe('a conversation nobody has written in yet', () => {
  it('opens on who it is with and three greetings, and sends one with a tap', async () => {
    const client = open({
      'GET /chat/u2/messages': ok({ messages: [] }),
      'POST /chat/u2/messages': (body: unknown) => ok(from('m1', 'me', (body as { body: string }).body, 0)),
    });
    expect(await screen.findByText('This is the start of your conversation with rojda.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'rojda' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rojbaş!' }));
    await waitFor(() => expect(client.calls.some((c) => c.method === 'POST' && c.path === '/chat/u2/messages' && (c.body as { body: string }).body === 'Rojbaş!')).toBe(true));
    // the greeting is the conversation now: the welcome has made way for it
    expect(await screen.findByText('Rojbaş!')).toBeTruthy();
    expect(screen.queryByText('This is the start of your conversation with rojda.')).toBeNull();
  });
});
