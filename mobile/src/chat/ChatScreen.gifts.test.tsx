// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
const navigate = vi.fn();
// the catch-up when the screen comes back into focus (realtime/catchUp) is not under test here
vi.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate, goBack: vi.fn() }), useFocusEffect: () => undefined }));
// the thread's live events are not under test here
vi.mock('./useChatSocket', () => ({ useChatSocket: () => undefined }));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { GiftCard } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import type { ChatMessage } from '../gifts/api';
import { ChatScreen } from './ChatScreen';
import { hasControls } from './MessageContent';

patchReactNativeWeb();
beforeEach(() => navigate.mockReset());
afterEach(cleanup);

const gift: GiftCard = {
  batchId: 'b1',
  sku: 'bg_newroz',
  name: 'Newroz fire',
  category: 'background',
  assetUrl: null,
  tier: 'common',
  recipients: [{ name: null, avatarUrl: null, isMe: true, opened: false }],
  myGiftId: 'g1',
  myOpened: false,
  equippable: 'background',
};

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'm1',
  senderId: 'u2',
  username: 'rojda',
  body: 'silav',
  createdAt: '2026-10-13T10:00:00.000Z',
  kind: 'text',
  gift: null,
  game: null,
  ...over,
});

const wordleCard = ok({
  game: 'wordle-battle',
  lobbyId: 'abc12345',
  status: 'open',
  players: 1,
  maxPlayers: 4,
  summary: {},
  canJoin: true,
  isMember: false,
});

describe('ChatScreen', () => {
  it('draws each kind: words, a game invite link as a card, a wrapped gift', async () => {
    testAuth.client = fakeClient({
      'GET /chat/u2/messages': ok({
        messages: [
          msg({}),
          msg({ id: 'm2', body: 'Werin! https://hevalo.app/app/games/wordle-battle?id=abc12345' }),
          msg({ id: 'm3', kind: 'gift', body: null, gift }),
        ],
      }),
      // an old invite link is drawn as the game's live card (play/ChatGameCard)
      'GET /play/cards/wordle-battle/abc12345': wordleCard,
    });
    renderWithProviders(<ChatScreen userId="u2" username="" onExit={() => undefined} />);
    expect(await screen.findByText('silav')).toBeTruthy();
    // the name comes from the conversation when the way in did not bring it
    expect(screen.getAllByText('rojda').length).toBeGreaterThan(0);
    expect(screen.getByText('Werin!')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Join: Wordle Battle' }));
    expect(navigate).toHaveBeenCalledWith('WordleBattle', { id: 'abc12345' });
    expect(screen.getByText('A gift for you')).toBeTruthy();
  });

  it('keeps what was typed when a send is refused, and says why', async () => {
    testAuth.client = fakeClient({
      'GET /chat/u2/messages': ok({ messages: [] }),
      'POST /chat/u2/messages': fail({ code: 'MUTED', details: { scope: 'chat', until: null } }),
    });
    renderWithProviders(<ChatScreen userId="u2" username="rojda" onExit={() => undefined} />);
    const input = await screen.findByLabelText('Message…');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('You can’t send messages right now.')).toBeTruthy();
    expect((screen.getByLabelText('Message…') as HTMLTextAreaElement).value).toBe('hello');
  });

  it('opens the gift picker for this friend, and unwraps a gift it was asked to', async () => {
    testAuth.client = fakeClient({
      'GET /chat/u2/messages': ok({ messages: [msg({ id: 'm3', kind: 'gift', body: null, gift })] }),
      'GET /gifts/catalog?to=u2': ok({ items: [], balance: { zer: 0, gems: 0 } }),
      'POST /gifts/g1/open': ok({ card: { ...gift, myOpened: true }, equippable: 'background' }),
    });
    renderWithProviders(<ChatScreen userId="u2" username="rojda" openGift="g1" onExit={() => undefined} />);
    // from the banner: the unwrap starts as soon as the thread is here
    expect(await screen.findByText('From rojda')).toBeTruthy();
    // its buttons are out of reach until the gift is shown, so skip to it first
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: 'Send a gift' }));
    expect(await screen.findByText('A gift for rojda')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('There’s nothing to give right now.')).toBeTruthy());
  });
});

describe('ChatScreen reports', () => {
  // A hold is a real 350 ms long press, then the report sheet slides up in a
  // Modal: findBy's default one second leaves too little room on a busy CI
  // runner, so these waits allow for the hold itself.
  const HOLD = { timeout: 3000 };
  const thread = () =>
    fakeClient({
      'GET /chat/u2/messages': ok({
        messages: [
          msg({ id: 'm2', body: 'Werin! https://hevalo.app/app/games/wordle-battle?id=abc12345' }),
          msg({ id: 'm3', kind: 'gift', body: null, gift }),
        ],
      }),
      'POST /chat/u2/read': ok({ ok: true }),
      'GET /play/cards/wordle-battle/abc12345': wordleCard,
    });
  /*
   * The thread is opened inside act(), so it has loaded and finished drawing
   * before a finger goes down. A bubble is signed up for presses in an effect
   * that runs after it is drawn; a hold that began in between — which waiting
   * only for the bubble to appear allowed, on a busy machine — reached nothing
   * and never became a long press.
   */
  const openThread = async (): Promise<void> => {
    testAuth.client = thread();
    await act(async () => {
      renderWithProviders(<ChatScreen userId="u2" username="rojda" onExit={() => undefined} />);
    });
  };

  it('reports a gift you were sent by pressing and holding it, though the gift takes the touch', async () => {
    await openThread();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'A gift from rojda. Tap to open.' }), { button: 0, buttons: 1 });
    expect(await screen.findByText('Report this message', {}, HOLD)).toBeTruthy();
    // a hold is not a tap: nothing was unwrapped
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
  });

  it('reports a message with an invite link by holding the game card it is drawn as', async () => {
    await openThread();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Join: Wordle Battle' }), { button: 0, buttons: 1 });
    expect(await screen.findByText('Report this message', {}, HOLD)).toBeTruthy();
    // and the game did not open
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('hasControls', () => {
  it('marks the messages a screen reader must reach part by part', () => {
    // plain words are one element, with Report among its actions
    expect(hasControls(msg({}))).toBe(false);
    // a link to a game the phone opens is a button inside the message
    expect(hasControls(msg({ body: 'Werin! https://hevalo.app/app/games/wordle-battle?id=abc12345' }))).toBe(true);
    expect(hasControls(msg({ kind: 'gift', body: null, gift }))).toBe(true);
    expect(hasControls(msg({ kind: 'game', body: null }))).toBe(true);
  });
});
