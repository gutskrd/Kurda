import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { RequireAccount } from './RequireAccount';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const guest = () => vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));

function member(emailVerified = true): void {
  localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.includes('/me')
        ? jsonResponse(200, { user: { id: 'me', username: 'ada', emailVerified } })
        : jsonResponse(200, {}),
    ),
  );
}

const inside = <p>the protected thing</p>;

describe('RequireAccount', () => {
  it('lets a member through', async () => {
    member();
    renderApp(<RequireAccount what="send messages">{inside}</RequireAccount>, ['/app/messages']);
    expect(await screen.findByText('the protected thing')).toBeInTheDocument();
  });

  it('asks a visitor rather than bouncing them to a login form', async () => {
    guest();
    renderApp(<RequireAccount what="send messages">{inside}</RequireAccount>, ['/app/messages']);

    // being redirected with no explanation and no way back is how you lose
    // someone who was only curious
    expect(await screen.findByText(/You need an account for this/)).toBeInTheDocument();
    expect(screen.queryByText('the protected thing')).not.toBeInTheDocument();
  });

  it('says what the page is for, so the ask makes sense', async () => {
    guest();
    renderApp(<RequireAccount what="play against other people">{inside}</RequireAccount>, ['/app/games/quiz']);
    expect(await screen.findByText(/to play against other people you have to sign in/i)).toBeInTheDocument();
  });

  it('offers both doors and a way back to what is open', async () => {
    guest();
    renderApp(<RequireAccount what="keep posts">{inside}</RequireAccount>, ['/app/saved']);

    expect(await screen.findByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Back to Civak' })).toHaveAttribute('href', '/app/civak');
  });

  it('still holds an unverified account away from the page', async () => {
    member(false);
    const { container } = renderApp(<RequireAccount what="send messages">{inside}</RequireAccount>, ['/app/messages']);

    // opening the app to guests must not become a way around email
    // verification. This test mounts the component alone, so the redirect has
    // nowhere to land — what it can show is that neither the page nor the
    // sign-in prompt is rendered, which is what navigating away looks like.
    await waitFor(() => expect(container.querySelector('.gate')).toBeNull());
    expect(screen.queryByText('the protected thing')).not.toBeInTheDocument();
    expect(screen.queryByText(/You need an account/)).not.toBeInTheDocument();
  });
});
