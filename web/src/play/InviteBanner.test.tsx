import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeApi, refused } from '../stories/testing';
import { InviteBanner } from './InviteBanner';
import { useQuietInvites } from './quietInvites';
import { incoming, renderPlay, signedInAndListening, where } from './testing';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const lists = (inv = [incoming()]) => ({ incoming: inv, outgoing: [] });

describe('InviteBanner', () => {
  it('says who asked, to what, and how it is set — as a status, without taking the focus', async () => {
    fakeApi({ 'GET /play/invites': lists() });
    const before = document.activeElement;
    renderPlay(<InviteBanner />);

    const banner = await screen.findByRole('status');
    expect(within(banner).getByText('Rojda invited you to Wordle Battle')).toBeInTheDocument();
    expect(within(banner).getByText('Hard')).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: 'Join' })).toBeInTheDocument();
    expect(document.activeElement).toBe(before);
  });

  it('marks a story’s title with the story’s language', async () => {
    fakeApi({
      'GET /play/invites': lists([
        incoming({ game: 'stories', lobbyId: 's1', summary: { storyTitle: 'چیرۆکی بەفر', dialect: 'sorani', questionCount: 5, mode: 'duo' } }),
      ]),
    });
    renderPlay(<InviteBanner />);

    const title = await screen.findByText('چیرۆکی بەفر');
    expect(title).toHaveAttribute('lang', 'ckb');
    expect(title).toHaveAttribute('dir', 'rtl');
    expect(screen.getByText('5 questions')).toBeInTheDocument();
  });

  it('joins through the invite and goes to the lobby', async () => {
    const { calls } = fakeApi({
      'GET /play/invites': lists(),
      'POST /play/invites/i1/accept': { game: 'wordle-battle', lobbyId: 'b1' },
    });
    renderPlay(<InviteBanner />);

    await userEvent.click(await screen.findByRole('button', { name: 'Join' }));
    await waitFor(() => expect(where()).toBe('/app/games/wordle-battle?id=b1'));
    expect(calls.some((c) => c.method === 'POST' && c.path === '/play/invites/i1/accept')).toBe(true);
  });

  it('turns an invite down with a preset reason, from a small menu the keyboard can use', async () => {
    const { calls } = fakeApi({ 'GET /play/invites': lists(), 'POST /play/invites/i1/decline': { ok: true } });
    renderPlay(<InviteBanner />);

    const notNow = await screen.findByRole('button', { name: 'Not now' });
    await userEvent.click(notNow);
    const menu = screen.getByRole('menu', { name: 'Not now' });
    // the first answer has the focus; arrows move, Escape closes and gives the focus back
    expect(within(menu).getByRole('menuitem', { name: 'Later' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'Not this game' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(notNow).toHaveFocus();

    await userEvent.click(notNow);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Not this game' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === '/play/invites/i1/decline')?.body).toEqual({ reason: 'not_this_game' }),
    );
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('says why a Join did not work, and can then be put away', async () => {
    fakeApi({ 'GET /play/invites': lists(), 'POST /play/invites/i1/accept': refused(409, 'GAME_FULL') });
    renderPlay(<InviteBanner />);

    await userEvent.click(await screen.findByRole('button', { name: 'Join' }));
    expect(await screen.findByText('This game is full.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says a rematch is one', async () => {
    fakeApi({ 'GET /play/invites': lists([incoming({ rematch: true, game: 'rhyme-match', summary: { dialect: 'sorani' } })]) });
    renderPlay(<InviteBanner />);
    expect(await screen.findByText('Rojda wants to play Rhyme Match again')).toBeInTheDocument();
    expect(screen.getByText('Soranî')).toBeInTheDocument();
  });

  it('shows nothing for an invite that ran out or was already answered', async () => {
    fakeApi({
      'GET /play/invites': lists([
        incoming({ id: 'a', expiresAt: new Date(Date.now() - 1000).toISOString() }),
        incoming({ id: 'b', status: 'declined' }),
      ]),
    });
    const { container } = renderPlay(<InviteBanner />);
    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1));
    expect(container.querySelector('.invite-banner')).toBeNull();
  });

  it('shows two at a time, and counts the rest', async () => {
    fakeApi({ 'GET /play/invites': lists([incoming({ id: 'a' }), incoming({ id: 'b' }), incoming({ id: 'c' })]) });
    renderPlay(<InviteBanner />);
    expect(await screen.findAllByRole('status')).toHaveLength(2);
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('shows one at a time on a phone, where two would cover the page, and counts the rest inside it', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    fakeApi({ 'GET /play/invites': lists([incoming({ id: 'a' }), incoming({ id: 'b' }), incoming({ id: 'c' })]) });
    renderPlay(<InviteBanner />);
    const shown = await screen.findAllByRole('status');
    expect(shown).toHaveLength(1);
    expect(within(shown[0]!).getByText('+2 more')).toBeInTheDocument();
  });

  it('is a one-line chip on a phone — who, to what, Join — that opens for the rest', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    fakeApi({ 'GET /play/invites': lists() });
    renderPlay(<InviteBanner />);
    const chip = await screen.findByRole('status');
    expect(within(chip).getByText('Rojda invited you to Wordle Battle')).toBeInTheDocument();
    expect(within(chip).getByRole('button', { name: 'Join' })).toBeInTheDocument();
    // the settings and "Not now" wait behind "Show more", which is not "Not now"
    expect(within(chip).queryByText('Hard')).toBeNull();
    expect(within(chip).queryByRole('button', { name: 'Not now' })).toBeNull();
    const more = within(chip).getByRole('button', { name: 'Show more' });
    expect(more).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(more);
    const banner = screen.getByRole('status');
    expect(within(banner).getByText('Hard')).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: 'Not now' })).toBeInTheDocument();
    await userEvent.click(within(banner).getByRole('button', { name: 'Show less' }));
    expect(screen.queryByText('Hard')).toBeNull();
  });

  it('is a chip while a game is being played, on any screen', async () => {
    fakeApi({ 'GET /play/invites': lists() });
    function Playing(): null {
      useQuietInvites(true);
      return null;
    }
    renderPlay(
      <>
        <Playing />
        <InviteBanner />
      </>,
    );
    const chip = await screen.findByRole('status');
    expect(chip).toHaveClass('is-chip');
    expect(within(chip).getByRole('button', { name: 'Show more' })).toBeInTheDocument();
  });

  it('opens a chip whose Join failed, so the reason can be read', async () => {
    fakeApi({ 'GET /play/invites': lists(), 'POST /play/invites/i1/accept': refused(409, 'GAME_FULL') });
    function Playing(): null {
      useQuietInvites(true);
      return null;
    }
    renderPlay(
      <>
        <Playing />
        <InviteBanner />
      </>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Join' }));
    expect(await screen.findByText('This game is full.')).toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveClass('is-chip');
  });

  it('takes its own room above the page while it waits, and gives it back when answered', async () => {
    fakeApi({ 'GET /play/invites': lists(), 'POST /play/invites/i1/decline': { ok: true } });
    renderPlay(<InviteBanner />);
    await screen.findByRole('status');
    const room = () => document.documentElement.style.getPropertyValue('--invite-banner-h');
    expect(room()).toMatch(/^\d+px$/);

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Later' }));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(room()).toBe('');
  });

  it('appears when an invite arrives, without a reload', async () => {
    let answer = lists([]);
    const { calls } = fakeApi({ 'GET /play/invites': () => answer });
    const { realtime } = renderPlay(<InviteBanner />);
    await signedInAndListening(calls);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    answer = lists();
    realtime.emit({ type: 'play_invite', invite: incoming() });
    expect(await screen.findByText('Rojda invited you to Wordle Battle')).toBeInTheDocument();
  });
});
