// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn() }) }));
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
