// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn() }), useFocusEffect: () => undefined }));
vi.mock('./useChatSocket', () => ({ useChatSocket: () => undefined }));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { ChatScreen } from './ChatScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const disabled = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true';

describe('the composer’s Send', () => {
  it('is disabled, and says so, until there is something to send', async () => {
    const client = fakeClient({
      'GET /chat/u2/messages': ok({ messages: [] }),
      'POST /chat/u2/read': ok({ ok: true }),
      'POST /chat/u2/typing': ok({ ok: true }),
      'POST /chat/u2/messages': ok({ id: 'm1', senderId: 'me', recipientId: 'u2', body: 'Silav', createdAt: '2026-10-20T10:00:00Z', readAt: null }),
    });
    testAuth.client = client;
    renderWithProviders(<ChatScreen userId="u2" username="azad" onExit={() => undefined} />);
    const field = await screen.findByLabelText('Message…');
    expect(disabled(screen.getByRole('button', { name: 'Send' }))).toBe(true);

    // spaces are not a message
    fireEvent.change(field, { target: { value: '   ' } });
    expect(disabled(screen.getByRole('button', { name: 'Send' }))).toBe(true);

    fireEvent.change(field, { target: { value: 'Silav' } });
    expect(disabled(screen.getByRole('button', { name: 'Send' }))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(client.calls.some((c) => c.method === 'POST' && c.path === '/chat/u2/messages')).toBe(true));
    expect(await screen.findByText('Silav')).toBeTruthy();
  });
});
