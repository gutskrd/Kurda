import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useProfileModal } from './ProfileModal';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

function Opener(): React.JSX.Element {
  const { openProfile } = useProfileModal();
  return (
    <button onClick={() => openProfile({ kind: 'me' })}>open-me</button>
  );
}

describe('ProfileModal', () => {
  it('opens as a dialog and shows the signed-in user from /me', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, {
          user: {
            id: '1',
            email: 'ada@example.com',
            username: 'ada',
            displayName: 'Ada Lovelace',
            emailVerified: true,
            bio: null,
            xp: 1234,
            streak: 7,
            profileVisibility: 'everyone',
            profilePhotoUrl: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      ),
    );
    renderApp(<Opener />);
    await userEvent.click(screen.getByText('open-me'));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('@ada')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument(); // XP
  });

  it('shows the loading state while /me is in flight', async () => {
    // a fetch that never resolves keeps the request pending
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    renderApp(<Opener />);
    await userEvent.click(screen.getByText('open-me'));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/loading profile/i)).toBeInTheDocument();
  });

  it('shows a visible error (never a blank card) when /me fails, with retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(500, { code: 'SERVER_ERROR', message: 'boom' })),
    );
    renderApp(<Opener />);
    await userEvent.click(screen.getByText('open-me'));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    // it must NOT silently render an empty profile card
    expect(screen.queryByText('@ada')).not.toBeInTheDocument();
  });

  it('treats a 200 with no usable user as an error, not a blank card', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { user: {} })),
    );
    renderApp(<Opener />);
    await userEvent.click(screen.getByText('open-me'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('closes on the close button', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, {
          user: { id: '1', email: 'a@b.com', username: 'ada', displayName: null, emailVerified: true, bio: null, xp: 0, streak: 0, profileVisibility: 'everyone', profilePhotoUrl: null, createdAt: '2026-01-01T00:00:00.000Z' },
        }),
      ),
    );
    renderApp(<Opener />);
    await userEvent.click(screen.getByText('open-me'));
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
