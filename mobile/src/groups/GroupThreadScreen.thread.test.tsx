// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
// the room's live events, handed to the test to send
const room = vi.hoisted(() => ({ emit: (_event: Record<string, unknown>): void => undefined }));
vi.mock('../realtime/useRoomEvents', () => ({
  useRoomEvents: (_name: string, handler: (event: Record<string, unknown>) => void) => {
    room.emit = handler;
  },
}));
import { act, cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { GroupThreadScreen } from './GroupThreadScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

/** A message so many minutes before now, so "Today" is today whenever the test runs. */
const minutesAgo = (n: number): string => new Date(Date.now() - n * 60_000).toISOString();
const said = (id: string, senderId: string, username: string, body: string, ago: number, more: Record<string, unknown> = {}) => ({
  id,
  senderId,
  username,
  avatarUrl: null,
  body,
  createdAt: minutesAgo(ago),
  deleted: false,
  kind: 'text',
  gift: null,
  game: null,
  ...more,
});

function open(messages: unknown[]) {
  testAuth.client = fakeClient({
    'POST /groups/g1/chat/read': ok({ ok: true }),
    'GET /groups/g1': ok({
      id: 'g1',
      name: 'Newroz club',
      description: null,
      ownerId: 'u-owner',
      archivedAt: null,
      memberCount: 3,
      photoUrl: null,
      myRole: 'member',
      members: [{ userId: 'me', username: 'rojda', avatarUrl: null, role: 'member', joinedAt: minutesAgo(600) }],
      standing: { kind: 'member', role: 'member' },
    }),
    'GET /groups/g1/chat': ok({ messages, cleared: { forEveryone: null, forMe: null } }),
  } as never);
  testAuth.user = { ...testAuth.user, id: 'me', username: 'rojda' };
  renderWithProviders(
    <GroupThreadScreen groupId="g1" name="Newroz club" onExit={() => undefined} onOpenMembers={() => undefined} onLeft={() => undefined} onFindPeople={() => undefined} />,
  );
}

describe('a group’s thread as it is read', () => {
  it('names each member once, over the first message of their run, with their face once at its foot', async () => {
    open([
      said('m1', 'u2', 'azad', 'Silav', 5),
      said('m2', 'u2', 'azad', 'Kes li vir e?', 4),
      said('m3', 'u3', 'şêrîn', 'Erê!', 3),
      said('m4', 'me', 'rojda', 'Ez jî', 2),
    ]);
    await screen.findByText('Silav');
    // twice he spoke, once he is named; your own messages carry no name at all
    expect(screen.getAllByText('azad')).toHaveLength(1);
    expect(screen.getAllByText('şêrîn')).toHaveLength(1);
    expect(screen.queryByText('rojda')).toBeNull();
    // a face for each of the two runs of other people’s, none for yours
    expect(screen.getAllByTestId('run-face')).toHaveLength(2);
    expect(screen.getAllByRole('heading', { name: 'Today' })).toHaveLength(1);
  });

  it('keeps a removed message in its place, saying it was removed', async () => {
    open([said('m1', 'u2', 'azad', 'Silav', 3), said('m2', 'u2', 'azad', '', 2, { deleted: true, body: null })]);
    await screen.findByText('Silav');
    expect(screen.getByText('This message was removed.')).toBeTruthy();
  });

  it('shows who is writing as a bubble of dots with their name over it', async () => {
    open([said('m1', 'u2', 'azad', 'Silav', 1)]);
    await screen.findByText('Silav');
    expect(screen.queryByTestId('typing-bubble')).toBeNull();
    act(() => room.emit({ type: 'group_typing', groupId: 'g1', userId: 'u3', username: 'şêrîn' }));
    expect(screen.getByTestId('typing-bubble')).toBeTruthy();
    expect(screen.getByText('şêrîn is typing…')).toBeTruthy();
    // your own pings come back from the room, and are not shown to you
    act(() => room.emit({ type: 'group_typing', groupId: 'g1', userId: 'me', username: 'rojda' }));
    expect(screen.queryByText(/rojda/)).toBeNull();
  });
});
