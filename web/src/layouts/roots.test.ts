import { describe, expect, it } from 'vitest';
import { LEARN_PATHS } from '../learn/learnView';
import { PROVERBS, RIDDLES } from '../lore/api';
import { STORIES_LIBRARY } from '../stories/api';
import { OWNS } from './navLinks';
import { isPlaceRoot, rootAbove } from './roots';

/** The four places the bar of places leads to, and Learn's other views. */
const ROOTS = ['/app', '/app/learn', '/app/learn/stories', '/app/learn/riddles', '/app/learn/proverbs', '/app/games', '/app/messages', '/app/profile'];

/** Every other page the app's shell draws (App.tsx), each with something in the place of its `:param`. */
const DEEPER = [
  '/app/learn/stories/sev-u-roj',
  '/app/learn/riddles/hespe-spi',
  '/app/learn/riddles/hespe-spi/answer',
  '/app/learn/proverbs/play',
  '/app/learn/proverbs/av-u-agir',
  '/app/learn/course/c1',
  '/app/learn/practice/build-sentence',
  '/app/learn/practice/hear-it',
  '/app/learn/words',
  '/app/learn/words/colours',
  '/app/dictionary',
  '/app/alphabet',
  '/app/library/p1',
  '/app/dimen/d1',
  '/app/saved',
  '/app/games/peyvok',
  '/app/games/rhyme',
  '/app/games/race',
  '/app/games/memory-thief',
  '/app/games/detective',
  '/app/games/stories/play/g1',
  '/app/games/peyvok-battle',
  '/app/games/rhyme-match',
  '/app/games/last-letter',
  '/app/games/impostor',
  '/app/games/who-am-i',
  '/app/rankings',
  '/app/rankings/league',
  '/app/badges',
  '/app/tree',
  '/app/search',
  '/app/friends',
  '/app/letters',
  '/app/letters/t1',
  '/app/shop',
  '/app/profile/edit',
  '/app/users/u1',
  '/app/settings',
  '/app/settings/notifications',
  '/app/settings/reports',
  '/app/settings/standing',
];

describe('which pages are the root of a place', () => {
  it('names the four places and Learn’s other views, and nothing else the shell draws', () => {
    for (const path of ROOTS) expect(isPlaceRoot(path), path).toBe(true);
    for (const path of DEEPER) expect(isPlaceRoot(path), path).toBe(false);
  });

  it('reads an address as the router does, with or without a slash at its end', () => {
    expect(isPlaceRoot('/app/')).toBe(true);
    expect(isPlaceRoot('/app/games/')).toBe(true);
    expect(isPlaceRoot('/app/games/peyvok/')).toBe(false);
  });

  it('agrees with the switches that lead to Learn’s views', () => {
    // each switch replaces the address with one of these, so each has to be somewhere the bar of places stays
    for (const path of [...Object.values(LEARN_PATHS), STORIES_LIBRARY, RIDDLES, PROVERBS]) expect(isPlaceRoot(path), path).toBe(true);
  });

  it('has a place to light under every root', () => {
    for (const path of ROOTS) expect(Object.values(OWNS).filter((owns) => owns(path)), path).toHaveLength(1);
  });

  it('gives every deeper page one place too, but for Search and somebody else’s profile, which belong to none', () => {
    const owners = (path: string): string[] => Object.entries(OWNS).filter(([, owns]) => owns(path)).map(([place]) => place);
    for (const path of DEEPER) expect(owners(path), path).toHaveLength(path === '/app/search' || path === '/app/users/u1' ? 0 : 1);
    // the two that were nobody's: your tree is opened from your profile, letters by bird from Messages
    expect(owners('/app/tree')).toEqual(['profile']);
    expect(owners('/app/letters')).toEqual(['messages']);
    expect(owners('/app/letters/t1')).toEqual(['messages']);
  });

  it('leaves a root a root when something after the ? narrows it', () => {
    expect(isPlaceRoot('/app', '?section=gotin&kind=cirok')).toBe(true);
    expect(isPlaceRoot('/app/learn', '?course=c1')).toBe(true);
    expect(isPlaceRoot('/app/learn/riddles', '?difficulty=hard')).toBe(true);
    // the way back from a group leads here: the list of groups, with no group open
    expect(isPlaceRoot('/app/messages', '?group=')).toBe(true);
  });

  it('counts an open conversation as a page you went into, though its address is the list’s', () => {
    expect(isPlaceRoot('/app/messages', '?to=u1&name=rojda')).toBe(false);
    expect(isPlaceRoot('/app/messages', '?group=g1')).toBe(false);
    expect(isPlaceRoot('/app/messages', '?group=g1&info=requests')).toBe(false);
    expect(isPlaceRoot('/app/messages/', '?to=u1')).toBe(false);
  });
});

describe('the root a deeper page stands under', () => {
  it('is the nearest one its address names', () => {
    expect(rootAbove('/app/learn/stories/sev-u-roj')).toBe('/app/learn/stories');
    expect(rootAbove('/app/learn/riddles/hespe-spi/answer')).toBe('/app/learn/riddles');
    expect(rootAbove('/app/learn/proverbs/play')).toBe('/app/learn/proverbs');
    expect(rootAbove('/app/learn/course/c1')).toBe('/app/learn');
    expect(rootAbove('/app/learn/words/colours')).toBe('/app/learn');
    expect(rootAbove('/app/games/peyvok')).toBe('/app/games');
    expect(rootAbove('/app/profile/edit')).toBe('/app/profile');
    // an open conversation has the list's own address
    expect(rootAbove('/app/messages')).toBe('/app/messages');
  });

  it('is nobody’s where the address does not say: the place that owns the page answers for those', () => {
    const unsaid = ['/app/settings', '/app/alphabet', '/app/rankings', '/app/library/p1', '/app/users/u1', '/app/search'];
    for (const path of unsaid) expect(rootAbove(path), path).toBeNull();
    // a longer word is not a page under a shorter one
    expect(rootAbove('/app/gamesmanship')).toBeNull();
  });
});
