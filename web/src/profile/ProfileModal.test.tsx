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
    // Saved is a section of the full profile, not a button on the card — this
    // is a glance at who you are, not a place to keep every link
    expect(screen.queryByRole('button', { name: 'Saved' })).not.toBeInTheDocument();
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
          online: true,
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
    expect(screen.getByText('Online')).toBeInTheDocument();
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

  /**
   * Blocking from the card is what makes a blocklist reachable at all. Before
   * it, the only Block button in the app was on your own friends list — so a
   * stranger in your replies could not be blocked, only someone you had already
   * chosen to add.
   */
  describe('blocking someone from their card', () => {
    const stub = (): ReturnType<typeof vi.fn> => {
      const fetchMock = vi.fn(async (url: string) => {
        if (String(url).includes('/friends/u2/block')) return jsonResponse(200, { ok: true });
        return jsonResponse(200, {
          userId: 'u2',
          username: 'zana',
          displayName: 'Zana K',
          friendStatus: 'none',
          private: false,
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    };

    /**
     * Block is no longer a button in the open. It was one thumb-width from
     * "Message" and it is the only action on this card that cannot be walked
     * back from it, so it sits behind a ⋯ with Report.
     */
    it('is not offered in the open — it lives behind the menu', async () => {
      stub();
      renderApp(<OpenUser />);
      const user = userEvent.setup();
      await user.click(screen.getByText('open-user'));

      await screen.findByText('@zana');
      expect(screen.queryByRole('button', { name: /^block$/i })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /more about zana/i }));
      expect(screen.getByRole('menuitem', { name: /block/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /report/i })).toBeInTheDocument();
    });

    /**
     * The ⋯ menu is where a person reports harassment. It is the last place in
     * the app that should still be in English for someone who chose Kurmancî —
     * they have to understand what they are about to do, and to whom.
     */
    it('speaks the language the reader chose', async () => {
      localStorage.setItem('mykurda_locale', 'ku');
      stub();
      renderApp(<OpenUser />);
      const user = userEvent.setup();
      await user.click(screen.getByText('open-user'));

      await user.click(await screen.findByRole('button', { name: 'Bêtir derbarê Zana K de' }));
      expect(screen.getByRole('menuitem', { name: /ragihîne/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /asteng bike/i })).toBeInTheDocument();
    });

    it('asks before it blocks, then says where to undo it', async () => {
      const fetchMock = stub();
      renderApp(<OpenUser />);
      const user = userEvent.setup();
      await user.click(screen.getByText('open-user'));

      await user.click(await screen.findByRole('button', { name: /more about zana/i }));
      await user.click(screen.getByRole('menuitem', { name: /block/i }));

      // opening the confirmation is not blocking anybody yet
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/friends/u2/block'))).toBe(false);

      await user.click(screen.getByRole('button', { name: /^block$/i }));

      expect(await screen.findByText(/they are not told/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /undo this in settings/i })).toBeInTheDocument();
      // the friend actions are gone: nothing left here that pretends to work
      expect(screen.queryByRole('button', { name: /^add friend$/i })).not.toBeInTheDocument();
    });

    /**
     * A report about a person carries no post for a moderator to look at, so
     * what the reporter writes is the whole case — the server rejects a short
     * one, and the form should not let it get that far.
     */
    it('will not send a report without a reason', async () => {
      const fetchMock = stub();
      renderApp(<OpenUser />);
      const user = userEvent.setup();
      await user.click(screen.getByText('open-user'));

      await user.click(await screen.findByRole('button', { name: /more about zana/i }));
      await user.click(screen.getByRole('menuitem', { name: /report/i }));

      expect(screen.getByRole('button', { name: /send report/i })).toBeDisabled();
      await user.type(screen.getByLabelText(/what should a moderator know/i), 'too short');
      expect(screen.getByRole('button', { name: /send report/i })).toBeDisabled();

      await user.type(screen.getByLabelText(/what should a moderator know/i), ' — and this is the rest of it');
      const send = screen.getByRole('button', { name: /send report/i });
      expect(send).toBeEnabled();

      await user.click(send);
      const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/users/u2/report'));
      expect(call).toBeTruthy();
      expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({ category: 'harassment' });
      // it never promises an outcome, only that somebody will look
      expect(await screen.findByText(/a moderator will look at this/i)).toBeInTheDocument();
    });

    it('offers neither on your own profile', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          jsonResponse(200, { userId: 'u2', username: 'ada', displayName: null, friendStatus: 'self', private: false }),
        ),
      );
      renderApp(<OpenUser />);
      await userEvent.click(screen.getByText('open-user'));

      await screen.findByText('@ada');
      expect(screen.queryByRole('button', { name: /more about/i })).not.toBeInTheDocument();
    });
  });
});
