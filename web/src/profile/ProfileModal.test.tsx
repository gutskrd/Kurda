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

function OpenUser(): React.JSX.Element {
  const { openProfile } = useProfileModal();
  return <button onClick={() => openProfile({ kind: 'user', userId: 'u2' })}>open-user</button>;
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
            // /me returns the streak as an OBJECT, not a number (regression for
            // React error #31 — rendering the object directly used to crash).
            streak: { current: 7, longest: 12, freezes: 1, lastActiveOn: '2026-08-20' },
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
    // renders streak.current (not the object) — no crash, no error state
    expect(screen.getByText('7 days')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders equipped cosmetics, level and favorites for another user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, {
          userId: 'u2',
          username: 'zana',
          displayName: 'Zana K',
          friendStatus: 'friends',
          private: false,
          bio: 'poet',
          avatarUrl: 'https://cdn.test/profile-photo/z.webp',
          background: { sku: 'bg-1', assetKey: 'backgrounds/a.mp4', type: 'video', url: 'https://cdn.test/backgrounds/a.mp4' },
          icon: { sku: 'ic-1', assetKey: 'icons/i.png', url: '/cosmetics/icons/i.png' },
          level: { xp: 250, level: 2, currentLevelXp: 100, nextLevelXp: 400, progress: 0.5 },
          premium: true,
          favoritePoem: { id: 'p1', title: 'The River' },
          favoriteStory: null,
        }),
      ),
    );
    renderApp(<OpenUser />);
    await userEvent.click(screen.getByText('open-user'));

    // name appears in both the plate and the footer label — assert the plate one
    expect((await screen.findByText('@zana')).previousSibling).toHaveTextContent('Zana K');
    expect(screen.getByText('Level 2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('Premium')).toBeInTheDocument();
    expect(screen.getByText('The River')).toBeInTheDocument();
    // the avatar uses the resolved avatarUrl (photo → default avatar server-side)
    const avatar = document.querySelector('.pcard-photo-img') as HTMLImageElement | null;
    expect(avatar?.src).toBe('https://cdn.test/profile-photo/z.webp');
    // a video background renders as a muted, looping <video>
    const bg = document.querySelector('video.pcard-bg-media') as HTMLVideoElement | null;
    expect(bg).not.toBeNull();
    expect(bg?.getAttribute('src')).toBe('https://cdn.test/backgrounds/a.mp4');
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
          user: { id: '1', email: 'a@b.com', username: 'ada', displayName: null, emailVerified: true, bio: null, xp: 0, streak: { current: 0, longest: 0, freezes: 0, lastActiveOn: null }, profileVisibility: 'everyone', profilePhotoUrl: null, createdAt: '2026-01-01T00:00:00.000Z' },
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
