import { describe, expect, it } from 'vitest';
import { invitePath } from './game-invites.js';
import { JOIN_LINK_ROUTE, JOIN_LINK_SEGMENTS, buildJoinLink, joinLinkPath, parseJoinLink } from './join-link.js';
import { PLAY_GAMES } from './play.js';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from './stories.js';

const HOST = '0b1e2d3c-4a5f-4c6d-8e7f-9a0b1c2d3e4f';

describe('a join code as a link', () => {
  it('has a word for every game a code can join: the one the game’s own lobby address has', () => {
    expect(Object.values(JOIN_LINK_SEGMENTS).sort()).toEqual([...PLAY_GAMES].sort());
    for (const [segment, game] of Object.entries(JOIN_LINK_SEGMENTS)) {
      expect(invitePath({ type: game, id: 'x' })).toBe(`/app/games/${segment}?id=x`);
    }
  });

  it('carries the game, the code and who shared it', () => {
    expect(joinLinkPath('impostor', 'KVXV5E', HOST)).toBe(`/join/impostor/KVXV5E?from=${HOST}`);
    expect(buildJoinLink('wordle-battle', 'kvx v5e')).toBe('https://hevalo.app/join/peyvok-battle/KVXV5E');
    expect(buildJoinLink('who-am-i', 'KVX-V5E', { from: HOST.toUpperCase(), origin: 'http://localhost:5174' })).toBe(`http://localhost:5174/join/who-am-i/KVXV5E?from=${HOST}`);
  });

  it('makes no link of something that is not a code, and names nobody who is not a user id', () => {
    expect(joinLinkPath('impostor', 'KVX')).toBeNull();
    expect(joinLinkPath('impostor', 'KVXV5O')).toBeNull();
    expect(joinLinkPath('impostor', 'KVXV5E', 'hamo')).toBe('/join/impostor/KVXV5E');
  });

  it('is read back as it was written', () => {
    expect(parseJoinLink('/join/impostor/KVXV5E', `?from=${HOST}`)).toEqual({ game: 'impostor', code: 'KVXV5E', from: HOST });
    expect(parseJoinLink('/join/peyvok-battle/kvxv5e/')).toEqual({ game: 'wordle-battle', code: 'KVXV5E', from: null });
    for (const game of PLAY_GAMES) {
      const url = new URL(buildJoinLink(game, 'ABC234', { from: HOST })!);
      expect(parseJoinLink(url.pathname, url.search)).toEqual({ game, code: 'ABC234', from: HOST });
    }
  });

  it('reads only its own shape: a game it knows, a code that could be one, a sharer that is a user id', () => {
    expect(parseJoinLink('/join/chess/KVXV5E')).toBeNull();
    expect(parseJoinLink('/join/impostor/KVXV5')).toBeNull();
    expect(parseJoinLink('/join/impostor/KVXV5E/more')).toBeNull();
    expect(parseJoinLink('/app/games/impostor', '?id=1')).toBeNull();
    expect(parseJoinLink('/join/constructor/KVXV5E')).toBeNull();
    expect(parseJoinLink('/join/impostor/KVXV5E', '?from=<script>')).toEqual({ game: 'impostor', code: 'KVXV5E', from: null });
  });

  it('takes exactly the codes the server makes', () => {
    const made = [...JOIN_CODE_ALPHABET].slice(0, JOIN_CODE_LENGTH).join('');
    expect(joinLinkPath('stories', made)).toBe(`/join/stories/${made}`);
    for (const ch of JOIN_CODE_ALPHABET) expect(parseJoinLink(`/join/stories/${ch.repeat(JOIN_CODE_LENGTH)}`)).not.toBeNull();
    for (const ch of 'ILO01') expect(parseJoinLink(`/join/stories/${ch.repeat(JOIN_CODE_LENGTH)}`)).toBeNull();
  });

  it('gives a router the same shape', () => {
    expect(JOIN_LINK_ROUTE).toBe('join/:game/:code');
  });
});
