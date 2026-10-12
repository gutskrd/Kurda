import { describe, expect, it } from 'vitest';
import { canJoin, type JoinFacts } from './join-rule.js';

const facts = (over: Partial<JoinFacts> = {}): JoinFacts => ({
  removed: false,
  blocked: false,
  access: 'friends',
  joinerIsKnownAdult: true,
  isHost: false,
  friendsWithHost: false,
  inSharedGroup: false,
  ...over,
});

describe('canJoin', () => {
  it('a friends game: the host’s friends and the members of a group chat it was shared into', () => {
    expect(canJoin(facts())).toBe(false);
    expect(canJoin(facts({ friendsWithHost: true }))).toBe(true);
    expect(canJoin(facts({ inSharedGroup: true }))).toBe(true);
    expect(canJoin(facts({ isHost: true }))).toBe(true);
    // age plays no part in a friends game
    expect(canJoin(facts({ friendsWithHost: true, joinerIsKnownAdult: false }))).toBe(true);
  });

  it('an open game: known adults, and only known adults — even a friend of the host', () => {
    expect(canJoin(facts({ access: 'open' }))).toBe(true);
    expect(canJoin(facts({ access: 'open', joinerIsKnownAdult: false }))).toBe(false);
    expect(canJoin(facts({ access: 'open', joinerIsKnownAdult: false, friendsWithHost: true }))).toBe(false);
  });

  it('never someone the host removed, nor anyone with a block either way against any member', () => {
    expect(canJoin(facts({ friendsWithHost: true, removed: true }))).toBe(false);
    expect(canJoin(facts({ friendsWithHost: true, blocked: true }))).toBe(false);
    expect(canJoin(facts({ access: 'open', blocked: true }))).toBe(false);
    expect(canJoin(facts({ isHost: true, removed: true }))).toBe(false);
  });
});
