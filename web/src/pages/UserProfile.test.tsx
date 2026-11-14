import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { UserProfile } from './UserProfile';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

function routed(user: unknown, calls: Array<{ url: string; body: unknown; method?: string }> = []) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    // everything that changes something is written down: a request sent or taken back, a friendship ended
    if (url.includes('/friends/requests') || (init?.method ?? 'GET') !== 'GET') {
      calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : null, method: init?.method ?? 'GET' });
      return jsonResponse(200, { ok: true });
    }
    if (url.includes('/users/')) return jsonResponse(200, user);
    return jsonResponse(200, {});
  });
}

function render(user: unknown, calls?: Array<{ url: string; body: unknown; method?: string }>) {
  vi.stubGlobal('fetch', routed(user, calls));
  renderApp(<Routes><Route path="/app/users/:id" element={<UserProfile />} /></Routes>, ['/app/users/u2']);
}

describe('UserProfile (other user, full page)', () => {
  it('renders another user’s public profile with a friend action', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    render(
      {
        userId: 'u2',
        username: 'zana',
        displayName: 'Zana K',
        friendStatus: 'none',
        private: false,
        bio: 'poet',
        avatarUrl: 'https://cdn.test/z.png',
        background: { sku: 'bg', assetKey: 'backgrounds/a.webp', type: 'image', url: '/cosmetics/backgrounds/a.webp' },
        level: { xp: 500, level: 5, currentLevelXp: 400, nextLevelXp: 900, progress: 0.2 },
        premium: true,
        favoritePoem: { id: 'p1', title: 'River Song' },
        tier: 'silver',
        country: 'DE',
      },
      calls,
    );

    expect(await screen.findByText('Zana K')).toBeInTheDocument();
    // country: real flag image + name under the username
    expect(screen.getByText('Germany')).toBeInTheDocument();
    expect((document.querySelector('.mkp-country .flag') as HTMLImageElement | null)?.src).toContain('flagcdn.com/w40/de.png');
    expect(document.querySelector('.pcard-level-badge')?.textContent).toBe('Level 5');
    expect((document.querySelector('.pc-banner .pcard-bg-media') as HTMLImageElement | null)?.src).toContain('/cosmetics/backgrounds/a.webp');
    expect(screen.getByText('River Song')).toBeInTheDocument();
    // no self-only Edit Profile button; a friend action instead
    expect(screen.queryByRole('link', { name: /edit profile/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /add friend/i }));
    expect(calls.some((c) => c.url.includes('/friends/requests'))).toBe(true);
  });

  /**
   * Somebody's numbers are part of who they are, so they are in the card with
   * their name: once they were a second card that a phone showed under every
   * post the person had written.
   */
  it('shows their numbers with their name, as numbers and not as ways into your own pages', async () => {
    render({ userId: 'u2', username: 'zana', displayName: 'Zana K', friendStatus: 'friends', private: false, bio: null, xp: 410, streak: 3, achievements: 5, online: true });
    expect(await screen.findByRole('heading', { level: 1, name: 'Zana K' })).toBeInTheDocument();

    const card = document.querySelector<HTMLElement>('.pc')!;
    const figure = (label: string) => within(card).getByText(label, { selector: '.mkp-fact-label' }).parentElement?.querySelector('.mkp-fact-value')?.textContent;
    expect(figure('Streak')).toBe('3');
    expect(figure('XP')).toBe('410');
    expect(figure('Badges')).toBe('5');
    // how many friends they have was not sent, so it is not guessed at
    expect(within(card).queryByText('Friends', { selector: '.mkp-fact-label' })).toBeNull();
    expect(within(card).getByRole('list').querySelectorAll('a')).toHaveLength(0);

    // here now is said once, by their name; an empty bio is not announced on somebody else's profile
    expect(within(card).getAllByText('Online')).toHaveLength(1);
    expect(screen.queryByText(/no bio/i)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Add a few words about yourself' })).toBeNull();
    expect(document.querySelector('aside')).toBeNull();
  });

  it('offers a friend a game, and only a friend', async () => {
    render({ userId: 'u2', username: 'zana', displayName: 'Zana K', friendStatus: 'friends', private: false });
    await userEvent.click(await screen.findByRole('button', { name: 'Play' }));
    expect(await screen.findByRole('dialog', { name: 'Play with Zana K' })).toBeInTheDocument();
  });

  /**
   * The menu about somebody is in the far corner of their banner. Sending
   * their profile on leads it; reporting them and blocking them are two
   * separate, plainly named items, each one press from the menu; and where the
   * two of you are friends, so is ending that.
   */
  it('keeps what can be done about them in the corner menu: share, and report and block apart', async () => {
    render({ userId: 'u2', username: 'zana', displayName: 'Zana K', friendStatus: 'none', private: false });
    const more = await screen.findByRole('button', { name: 'More about Zana K' });
    expect(document.querySelector('.pc-corner')).toContainElement(more);
    await userEvent.click(more);
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent?.trim())).toEqual(['Share profile', 'Report', 'Block']);
    // none of it is among the buttons under their words
    expect(within(document.querySelector<HTMLElement>('.pc-acts')!).queryByRole('button', { name: /block|report/i })).toBeNull();
  });

  it('lets you stop being friends from the menu, asked twice, and offers them again as somebody to add', async () => {
    const calls: Array<{ url: string; body: unknown; method?: string }> = [];
    render({ userId: 'u2', username: 'zana', displayName: 'Zana K', friendStatus: 'friends', private: false }, calls);
    await userEvent.click(await screen.findByRole('button', { name: 'More about Zana K' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent?.trim())).toEqual(['Share profile', 'Remove friend', 'Report', 'Block']);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove Zana K as a friend' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await userEvent.click(screen.getByRole('menuitem', { name: /press again to confirm/i }));
    expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/friends/u2'))).toBe(true);
    expect(await screen.findByRole('button', { name: 'Add friend' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Message' })).toBeNull();
  });

  it('copies their profile’s address where the device has no share sheet, and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    render({ userId: 'u2', username: 'zana', displayName: 'Zana K', friendStatus: 'none', private: false });
    await userEvent.click(await screen.findByRole('button', { name: 'More about Zana K' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Share profile' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/app\/users\/u2$/));
    expect(await screen.findByRole('menuitem', { name: 'Copied' })).toBeInTheDocument();
  });

  it('has no Play for someone who is not a friend', async () => {
    render({ userId: 'u4', username: 'baran', displayName: 'Baran', friendStatus: 'none', private: false });
    expect(await screen.findByRole('button', { name: /add friend/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
  });

  it('shows a private notice for a private profile', async () => {
    render({ userId: 'u3', username: 'ghost', displayName: 'Ghost', friendStatus: 'none', private: true });
    expect(await screen.findByText('Ghost')).toBeInTheDocument();
    expect(screen.getByText(/private/i)).toBeInTheDocument();
    // full showcase is not rendered
    expect(document.querySelector('.mkp-showcase')).toBeNull();
  });

  it('hands over a ticket for a friend request, and takes it back from Requested', async () => {
    const calls: Array<{ url: string; body: unknown; method?: string }> = [];
    render({ userId: 'u2', username: 'zana', displayName: 'Zana K', friendStatus: 'none', private: false }, calls);

    await userEvent.click(await screen.findByRole('button', { name: 'Add friend' }));
    expect(calls).toContainEqual(expect.objectContaining({ method: 'POST', body: { userId: 'u2' } }));
    const requested = await screen.findByRole('button', { name: 'Cancel your request to Zana K' });
    expect(requested).toHaveTextContent('Requested');
    expect(screen.getByRole('status')).toHaveTextContent('Request sent');
    // the ticket on its way to them
    expect(document.querySelector('.friend-ask-ticket.is-away')).not.toBeNull();

    await userEvent.click(requested);
    await userEvent.click(screen.getByRole('button', { name: /press again to confirm/i }));
    expect(await screen.findByRole('button', { name: 'Add friend' })).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/friends/requests/u2'))).toBe(true);
    // and back it comes
    expect(document.querySelector('.friend-ask-ticket.is-back')).not.toBeNull();
  });

  it('sends no ticket flying under Reduce Motion: the button simply says Requested', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    render({ userId: 'u2', username: 'zana', displayName: 'Zana K', friendStatus: 'none', private: false });
    await userEvent.click(await screen.findByRole('button', { name: 'Add friend' }));
    expect(await screen.findByRole('button', { name: 'Cancel your request to Zana K' })).toHaveTextContent('Requested');
    expect(document.querySelector('.friend-ask-ticket')).toBeNull();
  });
});
