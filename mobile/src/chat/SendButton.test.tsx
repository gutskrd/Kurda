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
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import type { ApiResult } from '../api/types';
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

/*
 * A message used to leave the field and be nowhere until the server answered.
 * It is in the thread at once, drawn as one on its way, and is never left
 * looking sent when the server would not take it.
 */
describe('a message being sent', () => {
  const sent = { id: 'm1', senderId: 'me', recipientId: 'u2', body: 'Silav', createdAt: '2026-10-20T10:00:00Z', readAt: null };

  /** The thread open on an empty conversation, with the send answered when the test says so. */
  async function open(): Promise<{ answer: (result: ApiResult<unknown>) => Promise<void>; field: HTMLElement }> {
    let resolve: (result: ApiResult<unknown>) => void = () => undefined;
    testAuth.client = fakeClient({
      'GET /chat/u2/messages': ok({ messages: [] }),
      'POST /chat/u2/read': ok({ ok: true }),
      'POST /chat/u2/typing': ok({ ok: true }),
      'POST /chat/u2/messages': () => new Promise<ApiResult<unknown>>((r) => (resolve = r)),
    });
    renderWithProviders(<ChatScreen userId="u2" username="azad" onExit={() => undefined} />);
    const field = await screen.findByLabelText('Message…');
    fireEvent.change(field, { target: { value: 'Silav' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    return { answer: (result) => act(async () => resolve(result)), field };
  }

  it('is in the thread at once, as one on its way, and becomes the server’s when it answers', async () => {
    const { answer, field } = await open();
    // before the server has said anything: there, marked as on its way, and the field is free for the next one
    const sending = screen.getByTestId('message-sending');
    expect(sending.textContent).toContain('Silav');
    expect(sending.getAttribute('aria-busy')).toBe('true');
    expect((field as HTMLTextAreaElement).value).toBe('');
    await answer(ok(sent));
    expect(screen.queryByTestId('message-sending')).toBeNull();
    expect(screen.getAllByText('Silav')).toHaveLength(1);
  });

  it('is taken out again when the server refuses it, with the words back in the field and the reason said', async () => {
    const { answer, field } = await open();
    expect(screen.getByTestId('message-sending')).toBeTruthy();
    await answer(fail({ message: 'You can’t message this person.' }));
    // never left looking sent
    expect(screen.queryByTestId('message-sending')).toBeNull();
    expect(screen.getAllByText('Silav')).toEqual([field]);
    expect((field as HTMLTextAreaElement).value).toBe('Silav');
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('keeps what was typed while it was on its way, after the words that did not go', async () => {
    const { answer, field } = await open();
    fireEvent.change(field, { target: { value: 'Çawa yî?' } });
    await answer(fail({ message: 'refused' }));
    expect((field as HTMLTextAreaElement).value).toBe('Silav\nÇawa yî?');
  });
});
