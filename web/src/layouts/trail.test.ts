import { afterEach, describe, expect, it } from 'vitest';
import { forgetTrail, notePage, pageNumber, stepsBack } from './trail';

afterEach(() => {
  forgetTrail();
  window.history.replaceState(null, '', '/');
});

/** A visit page by page, each noted under its router index as a shell would. */
function walk(...pages: string[]): void {
  pages.forEach((address, idx) => {
    window.history.replaceState({ idx, key: `k${idx}` }, '', address);
    notePage(address);
  });
}

/** The page on screen is number `idx`, with nothing noted for it or for what is behind it. */
const arriveAt = (idx: number, address: string): void => window.history.replaceState({ idx, key: `k${idx}` }, '', address);

describe('what is behind the page on screen', () => {
  it('reads the router’s own number for the page, and none where there is none', () => {
    expect(pageNumber()).toBeNull();
    arriveAt(0, '/app/alphabet');
    expect(pageNumber()).toBe(0);
    arriveAt(3, '/app/alphabet');
    expect(pageNumber()).toBe(3);
    // somebody else's state is not a number of ours
    window.history.replaceState({ idx: '3' }, '', '/app/alphabet');
    expect(pageNumber()).toBeNull();
  });

  it('is nothing of ours for a page opened cold', () => {
    expect(stepsBack('/app/alphabet')).toBeNull();
    walk('/app/alphabet');
    expect(stepsBack('/app/alphabet')).toBeNull();
  });

  it('is one step back for a page reached from another', () => {
    walk('/app/learn', '/app/alphabet');
    expect(stepsBack('/app/alphabet')).toBe(-1);
    walk('/app/profile', '/app/settings', '/app/settings/notifications');
    expect(stepsBack('/app/settings/notifications')).toBe(-1);
  });

  it('counts the list of conversations as another page than the conversation, though the path is the same', () => {
    walk('/app/messages', '/app/messages?to=u1&name=rojda');
    expect(stepsBack('/app/messages?to=u1&name=rojda')).toBe(-1);
  });

  it('passes over a lesson, and over the page it came back to, so the way back is not a way into the lesson again', () => {
    // a course's page, a lesson opened from it, and the same page again when the lesson ended
    walk('/app/learn', '/app/learn/course/c1', '/app/learn/lesson/l1?course=c1', '/app/learn/course/c1');
    expect(stepsBack('/app/learn/course/c1')).toBe(-3);
  });

  it('passes over a review as it does a lesson', () => {
    walk('/app/games', '/app/rankings', '/app/learn/review/s1', '/app/rankings');
    expect(stepsBack('/app/rankings')).toBe(-3);
  });

  it('has nowhere to step when there is nothing behind but lessons and the page itself', () => {
    walk('/app/learn/course/c1', '/app/learn/lesson/l1?course=c1', '/app/learn/course/c1');
    expect(stepsBack('/app/learn/course/c1')).toBeNull();
  });

  it('steps back to a page it was not told of: a public page, or one from before the tab was loaded again', () => {
    // loaded again on the third page of a visit: nothing is noted yet
    arriveAt(2, '/app/alphabet');
    expect(stepsBack('/app/alphabet')).toBe(-1);
    // the front page, then into the app, a lesson and back
    forgetTrail();
    arriveAt(1, '/app/learn/course/c1');
    notePage('/app/learn/course/c1');
    arriveAt(2, '/app/learn/lesson/l1');
    notePage('/app/learn/lesson/l1');
    arriveAt(3, '/app/learn/course/c1');
    notePage('/app/learn/course/c1');
    expect(stepsBack('/app/learn/course/c1')).toBe(-3);
  });

  it('leaves a game in one step, whichever of its lobbies and ways to play it went through', () => {
    // the game's start, then a lobby: one address with a different `?`, an entry each
    walk('/app/games', '/app/games/peyvok-battle', '/app/games/peyvok-battle?id=b1');
    expect(stepsBack('/app/games/peyvok-battle?id=b1')).toBe(-2);
    walk('/app/games', '/app/games/who-am-i', '/app/games/who-am-i?couch=1', '/app/games/who-am-i?id=w1');
    expect(stepsBack('/app/games/who-am-i?id=w1')).toBe(-3);
    // another game is another page
    walk('/app/games', '/app/games/peyvok', '/app/games/rhyme');
    expect(stepsBack('/app/games/rhyme')).toBe(-1);
  });

  it('goes back to where a game was opened from, when that was not the games', () => {
    walk('/app/messages', '/app/messages?to=u1', '/app/games/peyvok-battle?id=b1');
    expect(stepsBack('/app/games/peyvok-battle?id=b1')).toBe(-1);
    // and a lobby opened cold has nothing behind it
    forgetTrail();
    walk('/app/games/peyvok-battle?id=b1');
    expect(stepsBack('/app/games/peyvok-battle?id=b1')).toBeNull();
  });

  it('still undoes a step a page added on purpose: a word opened in Search goes back to the results', () => {
    walk('/app', '/app/search?q=av', '/app/search?q=av&type=words&entry=e1');
    expect(stepsBack('/app/search?q=av&type=words&entry=e1')).toBe(-1);
  });

  it('goes by what the page at a number is now, not what was there before it was replaced', () => {
    walk('/app/learn', '/app/learn/lesson/l1');
    // the lesson's entry is taken by another page, and something is opened from that
    arriveAt(1, '/app/alphabet');
    notePage('/app/alphabet');
    arriveAt(2, '/app/learn/words');
    notePage('/app/learn/words');
    expect(stepsBack('/app/learn/words')).toBe(-1);
  });
});
