// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
// the catch-up when the screen comes back into focus (realtime/catchUp) is not under test here
vi.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn() }), useFocusEffect: () => undefined }));
// the room's live events are not under test here
vi.mock('../realtime/useRoomEvents', () => ({ useRoomEvents: () => undefined }));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { GiftCatalogItem } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { GroupThreadScreen } from './GroupThreadScreen';

patchReactNativeWeb();
afterEach(cleanup);

const item: GiftCatalogItem = {
  sku: 'bg_mountain',
  name: 'Mountain dawn',
  category: 'background',
  assetUrl: null,
  currency: 'zer',
  price: 300,
  tier: 'common',
  alreadyOwnedBy: [],
};

describe('GroupThreadScreen gifts', () => {
  it('gives to friends among the members, and names whoever it did not reach', async () => {
    const client = fakeClient({
      'GET /groups/g1/chat': ok({ messages: [] }),
      'POST /groups/g1/chat/read': ok({ ok: true }),
      'GET /groups/g1': ok({ id: 'g1', name: 'Newroz club', members: [{ userId: 'me' }, { userId: 'u2' }, { userId: 'u3' }, { userId: 'u9' }] }),
      // u9 is a member but not a friend; u4 is a friend but not a member
      'GET /friends?limit=500': ok({
        friends: [
          { userId: 'u2', username: 'shilan', displayName: 'Şîlan' },
          { userId: 'u3', username: 'azad', displayName: null },
          { userId: 'u4', username: 'kawa', displayName: null },
        ],
      }),
      'GET /gifts/catalog?to=u2,u3': ok({ items: [item], balance: { zer: 1000, gems: 0 } }),
      'POST /gifts': ok({ batchId: 'b1', sent: ['u2'], skipped: [{ userId: 'u3', reason: 'already_owned' }], balance: { zer: 700, gems: 0 }, message: null }),
    });
    testAuth.client = client;
    renderWithProviders(
      <GroupThreadScreen groupId="g1" name="Newroz club" onExit={() => undefined} onOpenMembers={() => undefined} onLeft={() => undefined} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Send a gift' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'All my friends here' }));
    // only friends who are members are offered
    expect(screen.getByRole('checkbox', { name: 'Şîlan' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'azad' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'kawa' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByRole('radio', { name: /^Mountain dawn/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send · 600 Zêr' }));
    // it reached Şîlan; Azad is named, with why, under the thread
    expect(await screen.findByText('azad already has it.')).toBeTruthy();
    await waitFor(() => expect(client.calls.find((c) => c.path === '/gifts')?.body).toMatchObject({ toUserIds: ['u2', 'u3'] }));
    // typing again clears it
    fireEvent.change(screen.getByLabelText('Message…'), { target: { value: 'spas' } });
    expect(screen.queryByText('azad already has it.')).toBeNull();
  });
});

describe('GroupThreadScreen header', () => {
  const thread = (myRole: string) =>
    fakeClient({
      'GET /groups/g1/chat': ok({ messages: [] }),
      'POST /groups/g1/chat/read': ok({ ok: true }),
      'GET /groups/g1': ok({ id: 'g1', name: 'Newroz club', members: [], myRole }),
    });

  it('offers a member a way to report the group', async () => {
    testAuth.client = thread('member');
    renderWithProviders(
      <GroupThreadScreen groupId="g1" name="Newroz club" onExit={() => undefined} onOpenMembers={() => undefined} onLeft={() => undefined} />,
    );
    expect(await screen.findByRole('button', { name: 'Report this group' })).toBeTruthy();
  });

  it('does not offer its owner to report their own group', async () => {
    const client = thread('owner');
    testAuth.client = client;
    renderWithProviders(
      <GroupThreadScreen groupId="g1" name="Newroz club" onExit={() => undefined} onOpenMembers={() => undefined} onLeft={() => undefined} />,
    );
    await waitFor(() => expect(client.calls.some((c) => c.path === '/groups/g1')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Report this group' })).toBeNull());
  });
});

describe('GroupThreadScreen reports', () => {
  const thread = (myRole: string) =>
    fakeClient({
      'GET /groups/g1/chat': ok({
        messages: [
          { id: 'm1', senderId: 'u3', username: 'azad', avatarUrl: null, body: 'silav', createdAt: '2026-10-13T10:00:00.000Z', deleted: false, kind: 'text', gift: null, game: null },
        ],
      }),
      'POST /groups/g1/chat/read': ok({ ok: true }),
      'GET /groups/g1': ok({ id: 'g1', name: 'Newroz club', members: [], myRole }),
      'POST /reports': ok({
        report: { id: 'r1', targetType: 'group_message', category: 'spam', status: 'open', targetLabel: null, createdAt: '2026-10-13T10:00:00.000Z', closedAt: null, canAppeal: false, caseId: 'c1' },
        deduped: false,
      }),
    });

  const reportTheMessage = async (): Promise<void> => {
    fireEvent.mouseDown(await screen.findByText('silav'), { button: 0, buttons: 1 });
    // a hold is a real long press, so wait longer than findBy's default second
    fireEvent.click(await screen.findByRole('button', { name: 'Scam or spam' }, { timeout: 3000 }));
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await screen.findByText('Thanks for telling us');
  };

  it('offers a member to leave the club after reporting a message in it', async () => {
    const client = thread('member');
    testAuth.client = client;
    renderWithProviders(
      <GroupThreadScreen groupId="g1" name="Newroz club" onExit={() => undefined} onOpenMembers={() => undefined} onLeft={() => undefined} />,
    );
    await waitFor(() => expect(client.calls.some((c) => c.path === '/groups/g1')).toBe(true));
    await reportTheMessage();
    expect(screen.getByRole('button', { name: 'Leave Newroz club' })).toBeTruthy();
  });

  it('does not offer its owner to leave, which the server would refuse', async () => {
    const client = thread('owner');
    testAuth.client = client;
    renderWithProviders(
      <GroupThreadScreen groupId="g1" name="Newroz club" onExit={() => undefined} onOpenMembers={() => undefined} onLeft={() => undefined} />,
    );
    await waitFor(() => expect(client.calls.some((c) => c.path === '/groups/g1')).toBe(true));
    await reportTheMessage();
    expect(screen.getByRole('button', { name: 'Block azad' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Leave Newroz club' })).toBeNull();
  });
});
