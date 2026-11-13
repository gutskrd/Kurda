import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LAST_LETTER_LEARN_ENTRY } from '@kurda/shared';
import { Games } from '../pages/Games';
import { forgetLastLetterAvailability } from '../lastletter/availability';
import { jsonResponse, renderApp } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** A signed-in learner, and what the server says can be played in Kurmancî: `games` by id, and Tîpa Dawî's own answer. */
function server(games: Record<string, boolean>, chain = false): void {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'ada@example.com', emailVerified: true } });
      if (url.includes('/games/availability'))
        return jsonResponse(200, {
          dialect: 'kmr',
          games: Object.entries(games).map(([id, available]) => ({ id, available, difficulties: available ? ['beginner'] : [], levels: {}, levelled: true, minimum: 6 })),
        });
      if (url.includes('/mp/last-letter/availability')) return jsonResponse(200, { dialects: [{ dialect: 'kmr', group: chain, solo: false }] });
      return jsonResponse(200, {});
    }),
  );
}

describe('Learn’s games list', () => {
  it('adds a learning game in the same kind of box once it can be played', async () => {
    server({ 'memory-thief': true });
    renderApp(<Games />, ['/app/games']);
    const card = (await screen.findByRole('heading', { name: 'Dizê Bîrê' })).closest('article')!;
    expect(card).toHaveClass('gp-card');
    expect(within(card).getByRole('link', { name: 'Play' })).toHaveAttribute('href', '/app/games/memory-thief');
    // the games that were there are all still there
    expect(screen.getByRole('heading', { name: 'Peyvok' })).toBeInTheDocument();
  });

  it('names it under the shelf as coming soon, with no way in, while there is not enough approved content in the learner’s Kurdish', async () => {
    server({ 'memory-thief': false });
    renderApp(<Games />, ['/app/games']);
    expect(await screen.findByRole('heading', { name: 'Peyvok' })).toBeInTheDocument();
    // once the count has come back, and said no
    const soon = await screen.findByRole('region', { name: 'Coming soon' });
    const card = within(soon).getByRole('heading', { name: 'Dizê Bîrê' }).closest('article')!;
    expect(card).toHaveClass('is-soon');
    expect(within(soon).queryByRole('link')).toBeNull();
    // and it is not a card on the shelf
    expect(card).not.toHaveClass('gp-card');
  });

  it('lists Tîpa Dawî where its dictionary can check words in the learner’s Kurdish, and only there', async () => {
    forgetLastLetterAvailability();
    server({ 'memory-thief': true }, true);
    renderApp(<Games />, ['/app/games']);
    const card = (await screen.findByRole('heading', { name: 'Tîpa Dawî' })).closest('article')!;
    expect(within(card).getByRole('link', { name: 'Play' })).toHaveAttribute('href', LAST_LETTER_LEARN_ENTRY.path);
    cleanup();
    forgetLastLetterAvailability();
    server({ 'memory-thief': true }, false);
    renderApp(<Games />, ['/app/games']);
    expect(await screen.findByRole('heading', { name: 'Dizê Bîrê' })).toBeInTheDocument();
    // still named, as coming soon, after the games that can be played
    const soon = screen.getByRole('region', { name: 'Coming soon' });
    expect(within(soon).getByRole('heading', { name: 'Tîpa Dawî' })).toBeInTheDocument();
    expect(within(soon).queryByRole('link')).toBeNull();
  });

  /*
   * Build a Sentence and Hear It, Find It are exercises of the
   * lessons' practice now. The server still says whether they can be done
   * (they are rounds of the same kit), and the games list ignores it.
   */
  it('never lists the lessons’ two exercises among the games, even when they can be done', async () => {
    server({ 'memory-thief': true, 'build-sentence': true, 'hear-it': true });
    renderApp(<Games />, ['/app/games']);
    expect(await screen.findByRole('heading', { name: 'Dizê Bîrê' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Build a Sentence' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Hear It, Find It' })).toBeNull();
  });

  /*
   * Ez kî me? is never played alone: on one phone passed round a room, or
   * with friends online. Its own page asks which, so its card has the one way
   * in, as Xapînok's has, and it is a game for friends.
   */
  it('lists Ez kî me? as a game for friends with one way in, as Xapînok is', async () => {
    server({ 'memory-thief': true, impostor: true, 'who-am-i': true });
    renderApp(<Games />, ['/app/games']);
    for (const [name, href] of [
      ['Ez kî me?', '/app/games/who-am-i'],
      ['Xapînok', '/app/games/impostor'],
    ] as const) {
      const card = (await screen.findByRole('heading', { name })).closest('article')!;
      expect((await within(card).findAllByRole('link')).map((a) => a.getAttribute('href'))).toEqual([href]);
      expect(within(card).getByRole('link', { name: 'Play' })).toBeInTheDocument();
      expect(within(card).getByText('With friends')).toBeInTheDocument();
      expect(within(card).queryByText('On your own')).toBeNull();
    }
    // and so it is not among the games to play on your own
    await userEvent.click(screen.getByRole('button', { name: 'On your own' }));
    expect(screen.queryByRole('heading', { name: 'Ez kî me?' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Dizê Bîrê' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'With friends' }));
    expect(screen.getByRole('heading', { name: 'Ez kî me?' })).toBeInTheDocument();
  });

  // an old answer, or a server a version behind, may still name the games that are gone
  it('draws no card for a game that is no longer part of Hevalo, whatever the server says', async () => {
    server({ 'memory-thief': true, 'dont-say': true, bluff: true, kingdom: true, 'what-would-you-say': true });
    renderApp(<Games />, ['/app/games']);
    expect(await screen.findByRole('heading', { name: 'Dizê Bîrê' })).toBeInTheDocument();
    for (const gone of [/Don’t Say/, /Bluff/, /Village/, /Would You Say/]) expect(screen.queryByRole('heading', { name: gone })).toBeNull();
    expect(document.querySelector('a[href="/app/games/what-would-you-say"]')).toBeNull();
  });
});
