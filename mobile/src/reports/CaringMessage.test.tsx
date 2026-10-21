// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('./testing/svg'));
vi.mock('expo-secure-store', () => import('./testing/stubs'));
vi.mock('expo-linear-gradient', () => import('./testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('./testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('./testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('./testing/auth'));
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
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { Linking } from 'react-native';
import type { InboxItem } from '../notifications/inbox';
import { renderWithProviders } from './testing/harness';
import { patchReactNativeWeb } from './testing/rnWebPatches';
import { fakeClient, ok, testAuth } from './testing/auth';
import { MessagesScreen } from '../messages/MessagesScreen';
import { NotificationCenterScreen } from '../notifications/NotificationCenterScreen';

patchReactNativeWeb();

let open: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  navigate.mockReset();
  open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const body = [
  'Rojda, we read what you wrote.',
  "We wanted to check in. If things feel hard right now, you don't have to face it alone.",
  'You can find a free, confidential helpline in your country at https://findahelpline.com.',
  'If you are in danger right now, please call your local emergency number.',
].join('\n\n');

const caring: InboxItem = {
  id: 'n1',
  category: 'moderation',
  title: "We're thinking of you",
  body,
  data: { kind: 'caring_message', helplineUrl: 'https://findahelpline.com' },
  createdAt: '2026-10-14T09:00:00.000Z',
  readAt: null,
};

const client = () =>
  fakeClient({
    'GET /friends/requests': ok({ requests: [] }),
    'GET /chat/conversations': ok({ conversations: [] }),
    'GET /me/groups': ok({ groups: [] }),
    'GET /me/groups/unread': ok({ unread: [] }),
    'GET /me/notifications': ok({ notifications: [caring] }),
    'POST /me/notifications/n1/read': ok({ ok: true }),
  });

describe('a caring message', () => {
  /*
   * Notifications moved to the bell on Home, but this one is pinned at the top
   * of Messages too until it is read: a check on somebody's wellbeing is the
   * one notice that must not wait behind a bell.
   */
  it('is pinned at the top of Messages, and opens there in full with its helpline one tap away', async () => {
    testAuth.client = client();
    renderWithProviders(<MessagesScreen />);
    const row = await screen.findByRole('button', { name: "We're thinking of you" });
    expect(screen.queryByRole('button', { name: 'Find a helpline' })).toBeNull();
    fireEvent.click(row);
    // the whole of it, the helpline paragraph included, which the row cuts to two lines
    const words = await screen.findAllByText((_, el) => el?.tagName === 'DIV' && el.textContent === body && el.children.length === 0);
    expect(words.some((el) => !row.contains(el))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Find a helpline' }));
    expect(open).toHaveBeenCalledWith('https://findahelpline.com');
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('button', { name: 'Find a helpline' })).toBeNull();
  });

  it('opens from the notification list the same way', async () => {
    testAuth.client = client();
    renderWithProviders(<NotificationCenterScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByText("We're thinking of you"));
    fireEvent.click(await screen.findByRole('button', { name: 'Find a helpline' }));
    expect(open).toHaveBeenCalledWith('https://findahelpline.com');
    expect(navigate).not.toHaveBeenCalled();
  });
});
