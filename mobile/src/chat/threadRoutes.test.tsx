// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn() }) }));
vi.mock('./useChatSocket', () => ({ useChatSocket: () => undefined }));
import { cleanup, fireEvent, screen } from '@testing-library/react';
// the router itself, as the app's native stack runs it (pure: no React Native in it)
import { CommonActions, StackRouter, type ParamListBase, type StackNavigationState } from '@react-navigation/routers';
import type { GiftCard } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { chatRouteId, groupThreadRouteId } from '../navigation/rootStack';
import type { ChatMessage } from '../gifts/api';
import { ChatScreen } from './ChatScreen';

patchReactNativeWeb();
afterEach(cleanup);

/** The root stack's router with the ids App.tsx gives the two thread routes. */
function threadRouter() {
  const router = StackRouter({});
  const options = {
    routeNames: ['Tabs', 'Chat', 'GroupThread', 'UserProfile'],
    routeParamList: {},
    routeGetIdList: {
      Chat: chatRouteId as (o: { params?: object }) => string,
      GroupThread: groupThreadRouteId as (o: { params?: object }) => string,
    },
  };
  let state = router.getInitialState(options) as StackNavigationState<ParamListBase>;
  const go = (name: string, params: object): StackNavigationState<ParamListBase> => {
    state = router.getStateForAction(state, CommonActions.navigate(name, params), options) as StackNavigationState<ParamListBase>;
    return state;
  };
  return { go };
}

describe('the thread routes', () => {
  it('give another person’s chat a screen of its own, and bring an open one forward', () => {
    const { go } = threadRouter();
    const rojda = go('Chat', { userId: 'u-rojda', username: 'Rojda' }).routes[1];
    // the gift banner's Open, pressed in Rojda's chat for a gift from Azad
    const withAzad = go('Chat', { userId: 'u-azad', username: 'Azad', openGift: 'g7' });
    expect(withAzad.routes.map((r) => r.name)).toEqual(['Tabs', 'Chat', 'Chat']);
    expect(withAzad.routes[1]).toMatchObject({ key: rojda?.key, params: { userId: 'u-rojda' } });
    expect(withAzad.routes[2]?.key).not.toBe(rojda?.key);
    expect(withAzad.routes[2]?.params).toMatchObject({ userId: 'u-azad', openGift: 'g7' });

    // Rojda's again, with a gift of hers: the same screen comes forward, not a second copy
    const back = go('Chat', { userId: 'u-rojda', username: 'Rojda', openGift: 'g8' });
    expect(back.routes.filter((r) => (r.params as { userId?: string } | undefined)?.userId === 'u-rojda')).toHaveLength(1);
    expect(back.routes[back.index]).toMatchObject({ key: rojda?.key, params: { openGift: 'g8' } });
  });

  it('do the same for groups', () => {
    const { go } = threadRouter();
    go('GroupThread', { groupId: 'g-a', name: 'A' });
    const both = go('GroupThread', { groupId: 'g-b', name: '', openGift: 'g1' });
    expect(both.routes.map((r) => (r.params as { groupId?: string } | undefined)?.groupId)).toEqual([undefined, 'g-a', 'g-b']);
  });
});

const gift = (id: string, over: Partial<GiftCard> = {}): GiftCard => ({
  batchId: `b-${id}`,
  sku: 'bg_newroz',
  name: 'Newroz fire',
  category: 'background',
  assetUrl: null,
  tier: 'common',
  recipients: [{ name: null, avatarUrl: null, isMe: true, opened: false }],
  myGiftId: id,
  myOpened: false,
  equippable: 'background',
  ...over,
});

const giftMessage = (id: string): ChatMessage => ({
  id: `m-${id}`,
  senderId: 'u-azad',
  username: 'Azad',
  body: null,
  createdAt: '2026-10-13T10:00:00.000Z',
  kind: 'gift',
  gift: gift(id),
  game: null,
});

describe('ChatScreen brought forward with another gift', () => {
  it('unwraps the second gift too, not only the first it was opened for', async () => {
    testAuth.client = fakeClient({
      'GET /chat/u-azad/messages': ok({ messages: [giftMessage('g1'), giftMessage('g2')] }),
      'POST /chat/u-azad/read': ok({ ok: true }),
      'POST /gifts/g1/open': ok({ card: gift('g1', { myOpened: true }), equippable: 'background' }),
      'POST /gifts/g2/open': ok({ card: gift('g2', { myOpened: true, name: 'Mountain dawn' }), equippable: 'background' }),
    });
    const { rerender } = renderWithProviders(<ChatScreen userId="u-azad" username="Azad" openGift="g1" onExit={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Say thanks' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('button', { name: 'Say thanks' })).toBeNull();

    rerender(<ChatScreen userId="u-azad" username="Azad" openGift="g2" onExit={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Say thanks' })).toBeTruthy();
    expect(screen.getByText('Mountain dawn')).toBeTruthy();
    expect((testAuth.client as ReturnType<typeof fakeClient>).calls.map((c) => c.path)).toContain('/gifts/g2/open');
  });
});
