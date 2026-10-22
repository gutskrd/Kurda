import { describe, expect, it } from 'vitest';
import { buildInviteUrl, inviteLinkPattern, invitePath, inviteRoutePath, parseInvite } from './game-invites.js';

/**
 * The contract these tests exist for: a link made in one app opens in the other.
 *
 * That is the failure this module was written to prevent — the phone's first
 * draft built `?battle=<id>` while the browser has always read `?id=<id>`, which
 * typechecks, ships, and breaks only for the person who receives the invite.
 * Nothing in either app can catch that; only agreeing on one implementation and
 * pinning its output can.
 */
describe('game invites', () => {
  it('builds the path the browser actually routes', () => {
    // these two literals are the web's <Route path> values — change one and the
    // link stops resolving, so they are asserted rather than derived
    expect(invitePath({ type: 'wordle-battle', id: 'abc123' })).toBe('/app/games/peyvok-battle?id=abc123');
    expect(invitePath({ type: 'rhyme-match', id: 'abc123' })).toBe('/app/games/rhyme-match?id=abc123');
    expect(invitePath({ type: 'stories', id: 'abc123' })).toBe('/app/games/stories?id=abc123');
  });

  it('round-trips every game type through a shareable URL', () => {
    for (const type of ['wordle-battle', 'rhyme-match', 'stories'] as const) {
      const url = buildInviteUrl(type, 'b7f2c1a4-9e3d-4a11-8c55-0f6d2e9a7b31');
      expect(parseInvite(url)).toEqual({ type, id: 'b7f2c1a4-9e3d-4a11-8c55-0f6d2e9a7b31' });
    }
  });

  it('defaults to the production origin and honours a deploy that passes its own', () => {
    expect(buildInviteUrl('wordle-battle', 'abc123')).toBe('https://hevalo.app/app/games/peyvok-battle?id=abc123');
    expect(buildInviteUrl('wordle-battle', 'abc123', 'http://localhost:5173')).toBe(
      'http://localhost:5173/app/games/peyvok-battle?id=abc123',
    );
  });

  it('finds a link inside an ordinary message', () => {
    const body = 'beat this if you can https://hevalo.app/app/games/peyvok-battle?id=match-42 😄';
    expect(parseInvite(body)).toEqual({ type: 'wordle-battle', id: 'match-42' });
  });

  // a link already sent in a chat or an email before the game was renamed
  it('still reads a Peyvok Battle link at its old address', () => {
    const body = 'werin https://hevalo.app/app/games/wordle-battle?id=match-42';
    expect(parseInvite(body)).toEqual({ type: 'wordle-battle', id: 'match-42' });
    expect(body.replace(inviteLinkPattern(), '').trim()).toBe('werin');
  });

  it('ignores anything that is not one of our lobbies', () => {
    expect(parseInvite('https://hevalo.app/app/games/chess?id=abc123')).toBeNull();
    expect(parseInvite('https://evil.example/app/games/peyvok-battle')).toBeNull();
    // too short to be an id — a bare "?id=x" is not an invite
    expect(parseInvite('/app/games/peyvok-battle?id=x')).toBeNull();
  });

  it('strips every link from a body, however many there are', () => {
    const body =
      'one https://hevalo.app/app/games/peyvok-battle?id=aaa111 two https://hevalo.app/app/games/rhyme-match?id=bbb222 three';
    expect(body.replace(inviteLinkPattern(), '').replace(/\s+/g, ' ').trim()).toBe('one two three');
  });

  it('hands back a fresh pattern each call, so a global regex cannot carry lastIndex', () => {
    const body = 'https://hevalo.app/app/games/peyvok-battle?id=aaa111';
    expect(body.replace(inviteLinkPattern(), '')).toBe('');
    expect(body.replace(inviteLinkPattern(), '')).toBe('');
  });

  /**
   * The phone's linking config is built from this, so a drift here is a link
   * the app itself sent and then failed to recognise.
   */
  it('gives the phone a route pattern that is the same path it builds', () => {
    expect(inviteRoutePath('wordle-battle')).toBe('app/games/peyvok-battle');
    expect(inviteRoutePath('rhyme-match')).toBe('app/games/rhyme-match');
    for (const type of ['wordle-battle', 'rhyme-match', 'stories'] as const) {
      expect(invitePath({ type, id: 'abc123' })).toBe(`/${inviteRoutePath(type)}?id=abc123`);
    }
  });

  it('escapes an id so it cannot break out of the query string', () => {
    expect(invitePath({ type: 'wordle-battle', id: 'a b&c=d' })).toBe('/app/games/peyvok-battle?id=a%20b%26c%3Dd');
  });
});
