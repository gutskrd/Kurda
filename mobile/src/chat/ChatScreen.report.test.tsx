// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
const navigate = vi.fn();
vi.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate, goBack: vi.fn() }), useFocusEffect: () => undefined }));
// the thread's live events are not under test here
vi.mock('./useChatSocket', () => ({ useChatSocket: () => undefined }));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { Alert, type AlertButton } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { ChatScreen } from './ChatScreen';

patchReactNativeWeb();
afterEach(cleanup);

describe('reporting from the top of a conversation', () => {
  /*
   * Holding a message reports that message; the "⋯" at the top is about the
   * person — their profile, a report, a block — where anybody looks first.
   */
  // the name at the top, with their face, is the quickest way to their profile, as in any conversation
  it('opens their profile from the name at the top', async () => {
    navigate.mockReset();
    testAuth.client = fakeClient({ 'GET /chat/u2/messages': ok({ messages: [] }) });
    renderWithProviders(<ChatScreen userId="u2" username="rojda" onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'rojda' }));
    expect(navigate).toHaveBeenCalledWith('UserProfile', { userId: 'u2' });
  });

  it('offers the profile, a report and a block from the header, the block last and confirmed', async () => {
    const client = fakeClient({
      'GET /chat/u2/messages': ok({
        messages: [{ id: 'm1', senderId: 'u2', username: 'rojda', body: 'silav', createdAt: '2026-10-13T10:00:00.000Z', kind: 'text', gift: null, game: null }],
      }),
      'POST /friends/u2/block': ok({}),
    });
    testAuth.client = client;
    const alerts: { title: string; buttons: AlertButton[] }[] = [];
    vi.spyOn(Alert, 'alert').mockImplementation((title, _message, buttons) => {
      alerts.push({ title, buttons: buttons ?? [] });
    });
    const onExit = vi.fn();
    renderWithProviders(<ChatScreen userId="u2" username="rojda" onExit={onExit} />);
    await screen.findByText('silav');
    fireEvent.click(screen.getByRole('button', { name: 'More about rojda' }));
    const menu = alerts[0]!;
    expect(menu.buttons.map((b) => b.text)).toEqual(['View profile', 'Report rojda', 'Block rojda', 'Cancel']);
    expect(menu.buttons[2]!.style).toBe('destructive');

    act(() => menu.buttons[0]!.onPress?.());
    expect(navigate).toHaveBeenCalledWith('UserProfile', { userId: 'u2' });

    act(() => menu.buttons[1]!.onPress?.());
    expect(await screen.findByText('What’s wrong?')).toBeTruthy();

    // a block is asked again before it is done, and ends the conversation
    act(() => menu.buttons[2]!.onPress?.());
    const confirm = alerts[1]!;
    expect(confirm.title).toBe('Block rojda?');
    await act(async () => {
      confirm.buttons.find((b) => b.style === 'destructive')!.onPress?.();
    });
    expect(client.calls.some((c) => c.method === 'POST' && c.path.endsWith('/block'))).toBe(true);
    expect(onExit).toHaveBeenCalled();
  });
});
