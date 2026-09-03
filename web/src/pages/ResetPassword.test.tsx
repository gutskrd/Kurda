import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetPassword } from './ResetPassword';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('ResetPassword', () => {
  it('sets a new password using the token from the link', async () => {
    const calls: Array<{ body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/auth/reset-password')) {
          calls.push({ body: init?.body ? JSON.parse(init.body as string) : null });
          return jsonResponse(200, { reset: true });
        }
        return jsonResponse(200, {});
      }),
    );

    renderApp(<ResetPassword />, ['/reset-password?token=tok-123']);

    await userEvent.type(await screen.findByLabelText('New password'), 'a-strong-password1');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'a-strong-password1');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ token: 'tok-123', password: 'a-strong-password1' });
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
  });

  it('refuses to submit mismatched passwords', async () => {
    const fetchMock = vi.fn(async (_url: string) => jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    renderApp(<ResetPassword />, ['/reset-password?token=tok-123']);
    await userEvent.type(await screen.findByLabelText('New password'), 'a-strong-password1');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'something-else2');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByText(/don’t match/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/auth/reset-password'))).toBe(false);
  });

  it('explains an expired link instead of failing silently', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/auth/reset-password')
          ? jsonResponse(400, { code: 'INVALID_TOKEN', message: 'reset link is invalid or expired' })
          : jsonResponse(200, {}),
      ),
    );

    renderApp(<ResetPassword />, ['/reset-password?token=stale']);
    await userEvent.type(await screen.findByLabelText('New password'), 'a-strong-password1');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'a-strong-password1');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument();
  });

  it('handles a link with no token at all', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<ResetPassword />, ['/reset-password']);
    expect(await screen.findByText(/missing its reset code/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute('href', '/forgot-password');
  });
});
