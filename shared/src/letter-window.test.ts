import { describe, expect, it } from 'vitest';
import { DEFAULT_PAPER } from './letter-paper.js';
import {
  emptyLook,
  firstLook,
  flightOf,
  landingsOf,
  lookAfterAnswer,
  lookAfterBirdChosen,
  lookAfterCall,
  lookAfterLanded,
  lookAfterOwnGone,
  lookAfterRecall,
  lookAfterSend,
  lookAfterSendOn,
  lookAfterVisitorGone,
  lookInMotion,
  lookWithMoment,
  nextLook,
  untilServerTime,
  type WindowLook,
} from './letter-window.js';
import type { LetterLanding, LetterPerson, LetterVisitor, LettersHome, PenPal } from './letters.js';

const T0 = Date.UTC(2026, 10, 17, 9);
/** A server time, `min` minutes into the morning. */
const at = (min: number): string => new Date(T0 + min * 60_000).toISOString();
const person = (n: number): LetterPerson => ({ id: `p${n}`, name: `Name${n}`, bird: n % 8 });
const landing = (n: number, how: LetterLanding['how'], over: Partial<LetterLanding> = {}): LetterLanding => ({
  letterId: `l${n}`,
  threadId: `t${n}`,
  person: person(n),
  how,
  landed: false,
  read: false,
  deliveredAt: at(n),
  ...over,
});
const visitorOf = (n: number, since = at(n)): LetterVisitor => ({
  person: person(n),
  letter: { id: `v${n}`, mine: false, body: 'Silav!', decor: null, removed: false, sentAt: at(0), readAt: null },
  since,
  leavesAt: new Date(Date.parse(since) + 24 * 3_600_000).toISOString(),
});
const palOf = (n: number): PenPal => ({ threadId: `t${n}`, person: person(n), lastLetterAt: at(n), yourTurn: false, unread: 0 });
const homeOf = (over: Partial<LettersHome> = {}): LettersHome => ({
  refusal: null,
  bird: 2,
  birdChosen: true,
  zer: 0,
  out: null,
  flight: 'home',
  returned: null,
  visitor: null,
  birdsOut: 3,
  sky: [1, 4, 5],
  callsLeft: 5,
  landings: [],
  homecoming: null,
  arrival: null,
  penPals: [],
  roomForMore: true,
  paper: DEFAULT_PAPER,
  now: at(100),
  ...over,
});
const OUT = { since: at(50), visiting: false };

/** Every flight on the sill finished, as the window would finish them, with the letters it posted. */
function flown(look: WindowLook): { look: WindowLook; posted: string[] } {
  const posted: string[] = [];
  for (let i = 0; i < 6 && lookInMotion(look); i++) {
    const { own, visitor } = look.scene;
    if (own.kind === 'leaving') look = lookAfterOwnGone(look);
    if (own.kind === 'arriving') {
      const r = lookAfterLanded(look, 'own');
      posted.push(...r.post);
      look = r.look;
    }
    if (visitor.kind === 'arriving') {
      const r = lookAfterLanded(look, 'sill');
      posted.push(...r.post);
      look = r.look;
    }
    if (visitor.kind === 'leaving') look = lookAfterVisitorGone(look);
  }
  return { look, posted };
}

describe('the first look at the window', () => {
  it('shows your bird at home and nothing else when nothing has come', () => {
    const look = firstLook(homeOf());
    expect(look.scene).toEqual({ own: { kind: 'home', bird: 2 }, visitor: { kind: 'none' }, sky: [1, 4, 5] });
    expect(look.moment).toEqual({ kind: 'rest' });
    expect(look.landing).toBeNull();
    expect(look.waiting).toBe(false);
  });

  it('keeps a bird already at the window on the sill, and still brings your own home beside it with its answer', () => {
    const home = homeOf({ visitor: visitorOf(7), landings: [landing(3, 'home'), landing(4, 'window')] });
    const look = firstLook(home);
    // the visitor has been there all along: no flight
    expect(look.scene.visitor).toEqual({ kind: 'here', bird: 7 });
    expect(look.visitor?.letter.id).toBe('v7');
    expect(look.scene.own).toEqual({ kind: 'arriving', bird: 2 });
    expect(look.landing).toEqual({ item: landing(3, 'home'), spot: 'own' });
    expect(look.moment).toEqual({ kind: 'homecoming', person: person(3), threadId: 't3', letterId: 'l3' });
    // the pen pal’s letter has no spot while the visitor is there, and is said to be waiting
    expect(look.waiting).toBe(true);
  });

  it('brings a pen pal’s letter in on their own bird when the sill is free', () => {
    const look = firstLook(homeOf({ landings: [landing(4, 'window')] }));
    expect(look.scene.visitor).toEqual({ kind: 'arriving', bird: 4 });
    expect(look.scene.own).toEqual({ kind: 'home', bird: 2 });
    expect(look.moment).toEqual({ kind: 'arrival', person: person(4), threadId: 't4', letterId: 'l4' });
  });

  it('shows a letter that landed before already on the sill, with no flight and nothing to post', () => {
    const look = firstLook(homeOf({ landings: [landing(4, 'window', { landed: true, read: false })] }));
    expect(look.scene.visitor).toEqual({ kind: 'here', bird: 4 });
    expect(lookInMotion(look)).toBe(false);
    expect(look.moment.kind).toBe('arrival');
    expect(lookAfterLanded(look, 'sill')).toEqual({ look, post: [], landed: false });
  });

  it('brings an answer home on its writer’s bird when your own bird is out again, instead of hiding it until yours is back', () => {
    const look = firstLook(homeOf({ out: OUT, flight: 'sky', landings: [landing(3, 'home')] }));
    expect(look.scene.own).toEqual({ kind: 'away' });
    expect(look.scene.visitor).toEqual({ kind: 'arriving', bird: 3 });
    expect(look.landing?.spot).toBe('sill');
    expect(look.moment.kind).toBe('arrival');
  });

  it('lands letters in turn: not landed before first, then answers home, then the oldest', () => {
    const older = landing(1, 'window', { landed: true });
    const answer = landing(5, 'home');
    const pal = landing(3, 'window');
    const look = firstLook(homeOf({ landings: [older, pal, answer] }));
    expect(look.landing?.item.letterId).toBe('l5');
    const pals = firstLook(homeOf({ out: OUT, landings: [older, landing(6, 'window'), pal] }));
    expect(pals.landing?.item.letterId).toBe('l3');
    expect(firstLook(homeOf({ landings: [older] })).landing?.item.letterId).toBe('l1');
  });

  it('flies your bird home when it came back by itself, and says why', () => {
    const home = homeOf({ returned: { letterId: 'r1', since: at(90), why: 'unanswered' }, flight: 'homeward' });
    const look = firstLook(home);
    expect(look.scene.own).toEqual({ kind: 'arriving', bird: 2 });
    expect(look.moment).toEqual({ kind: 'returned', letterId: 'r1', why: 'unanswered' });
    const done = lookAfterLanded(look, 'own');
    expect(done.post).toEqual(['r1']);
    expect(done.look.scene.own).toEqual({ kind: 'here', bird: 2 });
    // the server no longer lists it once it has landed, and the window still says it until the bird flies out again
    const after = nextLook(done.look, homeOf());
    expect(after.moment).toEqual({ kind: 'returned', letterId: 'r1', why: 'unanswered' });
    expect(after.scene.own.kind).toBe('here');
  });

  it('reads a server from before landings by its two old fields, and posts nothing for them', () => {
    const old = homeOf({ landings: undefined, now: undefined, homecoming: { threadId: 't3', person: person(3) }, arrival: { threadId: 't4', person: person(4) } });
    expect(landingsOf(old).map((l) => [l.how, l.threadId, l.letterId])).toEqual([
      ['home', 't3', ''],
      ['window', 't4', ''],
    ]);
    const look = firstLook(old);
    expect(look.landing?.item.threadId).toBe('t3');
    expect(look.waiting).toBe(true);
    expect(lookAfterLanded(look, 'own').post).toEqual([]);
  });
});

describe('holding still', () => {
  it('changes nothing but the sky while held, and lands the letter as soon as the hold ends', () => {
    const quiet = firstLook(homeOf());
    const came = homeOf({ sky: [6], landings: [landing(4, 'window')] });
    const held = nextLook(quiet, came, { held: true });
    expect(held.scene.sky).toEqual([6]);
    expect(held.scene.visitor).toEqual({ kind: 'none' });
    expect(held.landing).toBeNull();
    // the quiet line: a letter is there, waiting its turn
    expect(held.waiting).toBe(true);
    const free = nextLook(held, came, { held: false });
    expect(free.scene.visitor).toEqual({ kind: 'arriving', bird: 4 });
    expect(free.waiting).toBe(false);
  });

  it('holds by itself while a letter is being written, and lands the bird once writing is put away', () => {
    const writing = lookWithMoment(firstLook(homeOf()), { kind: 'writing' });
    const came = homeOf({ landings: [landing(4, 'window')] });
    expect(nextLook(writing, came).landing).toBeNull();
    const back = nextLook(lookWithMoment(nextLook(writing, came), { kind: 'rest' }), came);
    expect(back.landing?.item.letterId).toBe('l4');
  });

  it('lets a bird finish its flight before anything else comes in, then lands the next', () => {
    const first = firstLook(homeOf({ landings: [landing(3, 'home')] }));
    const more = homeOf({ landings: [landing(3, 'home'), landing(4, 'window')] });
    const during = nextLook(first, more);
    expect(during.scene.visitor).toEqual({ kind: 'none' });
    const { look, posted } = flown(during);
    expect(posted).toEqual(['l3']);
    // one letter at a time: the answer home is read before the pen pal’s comes in
    expect(nextLook(look, more).scene.visitor).toEqual({ kind: 'none' });
    expect(nextLook(look, more).waiting).toBe(true);
    const read = nextLook(look, homeOf({ landings: [landing(4, 'window')] }));
    expect(read.scene.own).toEqual({ kind: 'home', bird: 2 });
    expect(read.scene.visitor).toEqual({ kind: 'arriving', bird: 4 });
  });

  it('is the very same look when a read brings nothing new, so a page that reads again does not draw again', () => {
    const home = homeOf({ visitor: visitorOf(7) });
    const look = firstLook(home);
    expect(nextLook(look, home)).toBe(look);
    expect(nextLook(look, home, { held: true })).toBe(look);
  });
});

describe('the server’s birds', () => {
  it('shows a bird called on another device on the sill, and a pen pal’s letter there makes way for it, still to land', () => {
    const { look } = flown(firstLook(homeOf({ landings: [landing(4, 'window')] })));
    const called = nextLook(look, homeOf({ visitor: visitorOf(7), landings: [landing(4, 'window', { landed: true })] }));
    expect(called.scene.visitor).toEqual({ kind: 'here', bird: 7 });
    expect(called.landing).toBeNull();
    expect(called.moment).toEqual({ kind: 'rest' });
    expect(called.waiting).toBe(true);
  });

  it('sends your bird away when it went out from another device, and its answer on the sill goes to the visitor’s spot', () => {
    const { look } = flown(firstLook(homeOf({ landings: [landing(3, 'home')] })));
    const out = nextLook(look, homeOf({ out: OUT, landings: [landing(3, 'home', { landed: true })] }));
    expect(out.scene.own).toEqual({ kind: 'away' });
    expect(out.scene.visitor).toEqual({ kind: 'here', bird: 3 });
    expect(out.landing?.spot).toBe('sill');
  });

  it('flies your bird home with its answer when it was answered while the window was open', () => {
    const away = firstLook(homeOf({ out: { since: at(50), visiting: true } }));
    const back = nextLook(away, homeOf({ landings: [landing(3, 'home')], flight: 'homeward' }));
    expect(back.scene.own).toEqual({ kind: 'arriving', bird: 2 });
    expect(back.moment.kind).toBe('homecoming');
    expect(flown(back).posted).toEqual(['l3']);
  });

  it('flies your bird home even when it brings nothing to land (called back on another device), rather than making it appear', () => {
    const away = firstLook(homeOf({ out: OUT }));
    const back = nextLook(away, homeOf());
    expect(back.scene.own).toEqual({ kind: 'arriving', bird: 2 });
    expect(back.moment).toEqual({ kind: 'rest' });
    expect(flown(back)).toEqual({ look: expect.objectContaining({ scene: expect.objectContaining({ own: { kind: 'here', bird: 2 } }) }), posted: [] });
  });

  it('flies a visitor off when the server has it no more: home with an answer written elsewhere, or on by itself', () => {
    const here = firstLook(homeOf({ visitor: visitorOf(7) }));
    const answered = nextLook(here, homeOf({ penPals: [palOf(7)] }));
    expect(answered.scene.visitor).toEqual({ kind: 'leaving', bird: 7, how: 'answered' });
    expect(answered.moment).toEqual({ kind: 'answered', person: person(7), threadId: 't7' });
    expect(answered.scene.song).toBe(1);
    const flewOn = nextLook(here, homeOf());
    expect(flewOn.scene.visitor).toEqual({ kind: 'leaving', bird: 7, how: 'sent-on' });
    expect(flewOn.moment).toEqual({ kind: 'flownOn', name: 'Name7' });
    const gone = lookAfterVisitorGone(flewOn);
    expect(gone.visitor).toBeNull();
    expect(gone.moment).toEqual({ kind: 'rest' });
  });

  it('takes a new bird’s colours from the server', () => {
    expect(nextLook(firstLook(homeOf()), homeOf({ bird: 5 })).scene.own).toEqual({ kind: 'home', bird: 5 });
  });

  it('lets a letter read and landed on another device leave the sill, and brings in the next', () => {
    const { look } = flown(firstLook(homeOf({ landings: [landing(4, 'window'), landing(6, 'window')] })));
    expect(look.scene.visitor).toEqual({ kind: 'here', bird: 4 });
    const next = nextLook(look, homeOf({ landings: [landing(6, 'window')] }));
    expect(next.landing?.item.letterId).toBe('l6');
    expect(next.scene.visitor).toEqual({ kind: 'arriving', bird: 6 });
    const none = nextLook(flown(next).look, homeOf());
    expect(none.scene.visitor).toEqual({ kind: 'none' });
    expect(none.moment).toEqual({ kind: 'rest' });
  });
});

describe('a letter read in its correspondence first', () => {
  it('lands, and stays on the sill for the rest of the visit once the server has it read and landed', () => {
    const read = landing(4, 'window', { read: true });
    const { look, posted } = flown(firstLook(homeOf({ landings: [read], penPals: [palOf(4)] })));
    expect(posted).toEqual(['l4']);
    expect(look.scene.visitor).toEqual({ kind: 'here', bird: 4 });
    // the read after the landing was said: nothing left to land, so it stays where it came down
    const after = nextLook(look, homeOf({ landings: [], penPals: [palOf(4)], now: at(101) }));
    expect(after.scene.visitor).toEqual({ kind: 'here', bird: 4 });
    expect(after.moment.kind).toBe('arrival');
    // another letter needs the window: it makes way, and that one comes in
    const next = nextLook(after, homeOf({ landings: [landing(6, 'window')], penPals: [palOf(4), palOf(6)], now: at(102) }));
    expect(next.landing?.item.letterId).toBe('l6');
    // and its correspondence ended meanwhile: it leaves the sill
    expect(nextLook(after, homeOf({ landings: [], penPals: [], now: at(103) })).scene.visitor).toEqual({ kind: 'none' });
  });
});

describe('a correspondence named on arriving', () => {
  const two = homeOf({ landings: [landing(3, 'home'), landing(4, 'window')] });

  it('lands its bird first, before any other', () => {
    const look = firstLook(two, 't4');
    expect(look.landing?.item.threadId).toBe('t4');
    expect(look.hint).toEqual({ threadId: 't4', outcome: 'land' });
  });

  it('opens the correspondence instead when it has nothing to land, its spot is taken, or the window is busy', () => {
    expect(firstLook(homeOf(), 't4').hint).toEqual({ threadId: 't4', outcome: 'open-thread' });
    expect(firstLook(homeOf({ visitor: visitorOf(7), landings: [landing(4, 'window')] }), 't4').hint?.outcome).toBe('open-thread');
    const writing = lookWithMoment(firstLook(homeOf()), { kind: 'writing' });
    expect(nextLook(writing, two, { hint: 't4' }).hint?.outcome).toBe('open-thread');
    const busy = firstLook(two);
    expect(nextLook(busy, two, { held: true, hint: 't4' }).hint?.outcome).toBe('open-thread');
  });

  it('counts a bird already flying in for that correspondence as landing here, and opens any other', () => {
    const flying = firstLook(two);
    expect(flying.landing?.item.threadId).toBe('t3');
    expect(nextLook(flying, two, { hint: 't3' }).hint).toEqual({ threadId: 't3', outcome: 'land' });
    expect(nextLook(flying, two, { hint: 't4' }).hint).toEqual({ threadId: 't4', outcome: 'open-thread' });
  });

  it('works the hint out once, and lets it go when the page lets it go', () => {
    const look = firstLook(two, 't4');
    const again = nextLook(look, homeOf({ landings: [landing(3, 'home'), landing(4, 'window')] }), { hint: 't4' });
    expect(again.hint).toBe(look.hint);
    expect(nextLook(again, two, { hint: null }).hint).toBeNull();
  });

  it('lands the bird later all the same when the correspondence was opened instead', () => {
    const blocked = firstLook(homeOf({ visitor: visitorOf(7), landings: [landing(4, 'window')] }), 't4');
    const sent = lookAfterSendOn(blocked);
    const gone = lookAfterVisitorGone(flown(sent).look);
    const back = nextLook(gone, homeOf({ landings: [landing(4, 'window', { read: true })] }));
    expect(back.scene.visitor).toEqual({ kind: 'arriving', bird: 4 });
  });
});

describe('a bird landing', () => {
  it('posts its letter once, and never for a bird only called to the window', () => {
    const look = firstLook(homeOf({ landings: [landing(4, 'window')] }));
    const done = lookAfterLanded(look, 'sill');
    expect(done.post).toEqual(['l4']);
    expect(done.landed).toBe(true);
    expect(done.look.landing?.item.landed).toBe(true);
    expect(lookAfterLanded(done.look, 'sill').landed).toBe(false);
    const called = lookAfterCall(firstLook(homeOf()), visitorOf(7, at(101)));
    expect(lookAfterLanded(called, 'sill')).toMatchObject({ post: [], landed: true });
  });

  it('keeps a letter counted as landed when a read from before the post still says it is not', () => {
    const { look } = flown(firstLook(homeOf({ landings: [landing(4, 'window')] })));
    const again = nextLook(look, homeOf({ landings: [landing(4, 'window')] }));
    expect(again.landing?.item.landed).toBe(true);
    expect(again.scene.visitor).toEqual({ kind: 'here', bird: 4 });
  });
});

describe('what is done at the window', () => {
  it('sends your bird out, and an answer it had brought home stays to be shown on the sill', () => {
    const { look } = flown(firstLook(homeOf({ landings: [landing(3, 'home')] })));
    const sent = lookAfterSend(look, 2, { kind: 'waiting', since: at(101) });
    expect(sent.scene.own).toEqual({ kind: 'leaving', bird: 2 });
    expect(sent.landing).toBeNull();
    expect(sent.moment).toEqual({ kind: 'sent' });
    const gone = lookAfterOwnGone(sent);
    expect(gone.moment).toEqual({ kind: 'waiting' });
    const read = nextLook(gone, homeOf({ out: { since: at(101), visiting: false }, now: at(102), landings: [landing(3, 'home', { landed: true })] }));
    expect(read.moment).toEqual({ kind: 'arrival', person: person(3), threadId: 't3', letterId: 'l3' });
    expect(read.scene.visitor).toEqual({ kind: 'here', bird: 3 });
  });

  it('calls a bird down, the first of the sky, and a pen pal’s letter in its spot makes way', () => {
    const { look } = flown(firstLook(homeOf({ landings: [landing(4, 'window')] })));
    const called = lookAfterCall(look, visitorOf(1, at(101)));
    expect(called.scene.visitor).toEqual({ kind: 'arriving', bird: 1 });
    expect(called.scene.sky).toEqual([4, 5]);
    expect(called.landing).toBeNull();
    expect(called.waiting).toBe(true);
  });

  it('answers a visitor: it takes the letter home, the birds sing, and the pen pals are said', () => {
    const here = firstLook(homeOf({ visitor: visitorOf(7) }));
    const answer = { threadId: 't7', person: person(7), letter: { ...visitorOf(7).letter, id: 'a1', mine: true, sentAt: at(101) } };
    const answered = lookAfterAnswer(here, answer);
    expect(answered.scene.visitor).toEqual({ kind: 'leaving', bird: 7, how: 'answered' });
    expect(answered.scene.song).toBe(1);
    expect(answered.moment).toEqual({ kind: 'answered', person: person(7), threadId: 't7' });
    const gone = lookAfterVisitorGone(answered);
    expect(gone.moment.kind).toBe('answered');
    expect(gone.scene.visitor).toEqual({ kind: 'none' });
  });

  it('says the answer your bird brought home once the bird beside it has been sent on', () => {
    const both = flown(firstLook(homeOf({ visitor: visitorOf(7), landings: [landing(3, 'home')] }))).look;
    const sent = lookAfterSendOn(both);
    expect(sent.moment).toEqual({ kind: 'sentOn', name: 'Name7' });
    const gone = lookAfterVisitorGone(flown(sent).look);
    expect(gone.moment).toEqual({ kind: 'homecoming', person: person(3), threadId: 't3', letterId: 'l3' });
  });

  it('says the answer your bird brought home once the bird beside it has taken your answer home, and on the next read too', () => {
    const both = flown(firstLook(homeOf({ visitor: visitorOf(7), landings: [landing(3, 'home')] }))).look;
    expect(both.moment).toEqual({ kind: 'homecoming', person: person(3), threadId: 't3', letterId: 'l3' });
    const answer = { threadId: 't7', person: person(7), letter: { ...visitorOf(7).letter, id: 'a1', mine: true, sentAt: at(101) } };
    const answered = lookAfterAnswer(both, answer);
    expect(answered.moment.kind).toBe('answered');
    const gone = flown(answered).look;
    expect(gone.moment).toEqual({ kind: 'homecoming', person: person(3), threadId: 't3', letterId: 'l3' });
    expect(gone.scene.own).toEqual({ kind: 'here', bird: 2 });
    // the read after the answer still lists the answer home, landed now: it stays said, with no second flight
    const after = nextLook(gone, homeOf({ landings: [landing(3, 'home', { landed: true })], penPals: [palOf(7), palOf(3)], now: at(102) }));
    expect(after.moment).toEqual(gone.moment);
    expect(after.scene.own).toEqual({ kind: 'here', bird: 2 });
  });

  it('calls your bird back home with its letter', () => {
    const away = firstLook(homeOf({ out: OUT }));
    const back = lookAfterRecall(away, 2);
    expect(back.scene.own).toEqual({ kind: 'arriving', bird: 2 });
    const landed = lookAfterLanded(back, 'own');
    expect(landed.post).toEqual([]);
    expect(landed.look.scene.own).toEqual({ kind: 'here', bird: 2 });
  });

  it('gives your bird a new bird’s colours', () => {
    expect(lookAfterBirdChosen(firstLook(homeOf()), 6).scene.own).toEqual({ kind: 'home', bird: 6 });
    expect(lookAfterBirdChosen(firstLook(homeOf({ out: OUT })), 6).scene.own).toEqual({ kind: 'away' });
  });

  it('says the sill again when writing is put away', () => {
    const { look } = flown(firstLook(homeOf({ landings: [landing(4, 'window')] })));
    const writing = lookWithMoment(look, { kind: 'writing' });
    expect(writing.moment).toEqual({ kind: 'writing' });
    expect(lookWithMoment(writing, { kind: 'rest' }).moment.kind).toBe('arrival');
  });
});

describe('reads that come while a bird is flying', () => {
  it('takes in a read that came while the visitor flew off: your own bird, answered at the same moment, comes home with its answer', () => {
    // your bird is out at their window while theirs is at yours: you answer theirs, and they answer yours
    const both = flown(firstLook(homeOf({ out: { since: at(50), visiting: true }, visitor: visitorOf(7) }))).look;
    const answer = { threadId: 't7', person: person(7), letter: { ...visitorOf(7).letter, id: 'a1', mine: true, sentAt: at(101) } };
    const answered = lookAfterAnswer(both, answer);
    // the read asked after the answer comes while their bird is still flying off: your bird is home, with their answer
    const read = homeOf({ now: at(102), landings: [landing(7, 'home', { threadId: 't7' })], penPals: [palOf(7)] });
    const during = nextLook(answered, read);
    expect(during.scene.visitor.kind).toBe('leaving');
    expect(during.scene.own).toEqual({ kind: 'away' });
    // the flight ends, and the window looks again at the same read: it is news, and your bird flies home with the answer
    const gone = lookAfterVisitorGone(during);
    const after = nextLook(gone, read);
    expect(after.scene.own).toEqual({ kind: 'arriving', bird: 2 });
    expect(after.landing?.spot).toBe('own');
    expect(after.moment).toEqual({ kind: 'homecoming', person: person(7), threadId: 't7', letterId: 'l7' });
    expect(after.scene.visitor).toEqual({ kind: 'none' });
  });
});

describe('reads that are no longer news', () => {
  it('never takes back a bird just called on the strength of the read the call was made on', () => {
    const home = homeOf();
    const called = flown(lookAfterCall(firstLook(home), visitorOf(1, at(101)))).look;
    expect(nextLook(called, home).scene.visitor).toEqual({ kind: 'here', bird: 1 });
    expect(nextLook(called, home).scene.sky).toEqual([4, 5]);
  });

  it('never brings your bird straight back in after it flew out, whatever the read it flew on says', () => {
    const home = homeOf();
    const gone = lookAfterOwnGone(lookAfterSend(firstLook(home), 2, { kind: 'waiting', since: at(101) }));
    expect(nextLook(gone, home).scene.own).toEqual({ kind: 'away' });
    expect(nextLook(gone, home).moment).toEqual({ kind: 'waiting' });
  });

  it('passes over a read the server made before a call, however late it comes in', () => {
    const called = flown(lookAfterCall(firstLook(homeOf()), visitorOf(1, at(101)))).look;
    const slow = homeOf({ now: at(100.5), landings: [landing(4, 'window')] });
    const after = nextLook(called, slow);
    expect(after.scene.visitor).toEqual({ kind: 'here', bird: 1 });
    expect(after.visitor?.letter.id).toBe('v1');
    // a read from after the call is news again
    const fresh = nextLook(called, homeOf({ now: at(102) }));
    expect(fresh.scene.visitor.kind).toBe('leaving');
  });

  it('never brings back a bird sent on, even from a read made before it was', () => {
    const before = homeOf({ visitor: visitorOf(7) });
    const gone = lookAfterVisitorGone(flown(lookAfterSendOn(firstLook(before))).look);
    const stale = homeOf({ visitor: visitorOf(7), now: at(101) });
    expect(nextLook(gone, stale).scene.visitor).toEqual({ kind: 'none' });
    expect(nextLook(gone, stale).visitor).toBeNull();
  });

  it('still places a letter from the read the window acted on, once its flight is through', () => {
    const home = homeOf({ visitor: visitorOf(7), landings: [landing(4, 'window')] });
    const gone = lookAfterVisitorGone(flown(lookAfterSendOn(firstLook(home))).look);
    expect(nextLook(gone, home).scene.visitor).toEqual({ kind: 'arriving', bird: 4 });
  });
});

describe('the ways a bird used to go missing', () => {
  it('lands a pen pal’s letter that came behind a visitor once the visitor has gone, answered or sent on', () => {
    const due = homeOf({ visitor: visitorOf(7), landings: [landing(4, 'window')] });
    const here = firstLook(due);
    for (const leave of [lookAfterSendOn, (l: WindowLook) => lookAfterAnswer(l, { threadId: 't7', person: person(7), letter: visitorOf(7).letter })]) {
      const gone = lookAfterVisitorGone(flown(leave(here)).look);
      const reread = nextLook(gone, homeOf({ penPals: [palOf(7)], landings: [landing(4, 'window')], now: at(102) }));
      expect(reread.scene.visitor).toEqual({ kind: 'arriving', bird: 4 });
      expect(reread.moment.kind).toBe('arrival');
    }
  });

  it('shows the bird the server says is at the window after a call is refused because one is there already', () => {
    const look = firstLook(homeOf());
    const reread = nextLook(look, homeOf({ visitor: visitorOf(7), now: at(101) }));
    expect(reread.scene.visitor).toEqual({ kind: 'here', bird: 7 });
    expect(reread.visitor?.letter.id).toBe('v7');
  });

  it('shows your bird out after a letter is refused because it is out already', () => {
    const writing = lookWithMoment(firstLook(homeOf()), { kind: 'writing' });
    const out = homeOf({ out: OUT, now: at(101) });
    const put = nextLook(lookWithMoment(nextLook(writing, out), { kind: 'rest' }), out);
    expect(put.scene.own).toEqual({ kind: 'away' });
  });

  it('lands the answer when calling your bird back finds it already answered', () => {
    const away = firstLook(homeOf({ out: { since: at(50), visiting: true } }));
    const reread = nextLook(away, homeOf({ landings: [landing(3, 'home')], now: at(101) }));
    expect(reread.scene.own).toEqual({ kind: 'arriving', bird: 2 });
    expect(reread.moment.kind).toBe('homecoming');
  });

  it('lands every letter in turn when two pen pals write at once', () => {
    const home = homeOf({ landings: [landing(4, 'window'), landing(6, 'window')] });
    const first = flown(firstLook(home));
    expect(first.posted).toEqual(['l4']);
    expect(first.look.waiting).toBe(true);
    const second = flown(nextLook(first.look, homeOf({ landings: [landing(6, 'window')] })));
    expect(second.posted).toEqual(['l6']);
    expect(second.look.waiting).toBe(false);
  });

  it('lands a letter that was opened in the correspondence first, from a notification', () => {
    const look = firstLook(homeOf({ landings: [landing(4, 'window', { read: true })] }));
    expect(look.scene.visitor).toEqual({ kind: 'arriving', bird: 4 });
    expect(flown(look).posted).toEqual(['l4']);
  });
});

describe('telling the time by the server', () => {
  it('times a visitor’s leaving by the server’s clock, wherever this device’s clock is set', () => {
    const home = homeOf({ now: at(0) });
    const readAt = Date.UTC(2020, 0, 1);
    expect(untilServerTime(at(60), home, readAt, readAt)).toBe(3_600_000);
    expect(untilServerTime(at(60), home, readAt, readAt + 600_000)).toBe(3_000_000);
    expect(untilServerTime(at(60), homeOf({ now: undefined }), T0, T0)).toBe(3_600_000);
  });

  it('says where your bird is, from what a server without `flight` sends too', () => {
    expect(flightOf(homeOf({ flight: 'window' }))).toBe('window');
    const old = { flight: undefined };
    expect(flightOf(homeOf({ ...old, out: OUT }))).toBe('sky');
    expect(flightOf(homeOf({ ...old, out: { since: at(1), visiting: true } }))).toBe('window');
    expect(flightOf(homeOf({ ...old, landings: [landing(3, 'home')] }))).toBe('homeward');
    expect(flightOf(homeOf({ ...old, landings: [landing(3, 'home', { landed: true })] }))).toBe('home');
  });
});

/** A small seeded random source, so every run of these walks is the same walk. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe('no letter waits while its spot is free', () => {
  it('places a letter wherever its bird fits, and says one is waiting exactly when one is left over', () => {
    const rnd = seeded(17);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
    for (let run = 0; run < 2000; run++) {
      const landings: LetterLanding[] = [];
      const count = Math.floor(rnd() * 4);
      for (let i = 0; i < count; i++) landings.push(landing(10 + run * 10 + i, pick(['home', 'window'] as const), { landed: rnd() < 0.3, read: rnd() < 0.3 }));
      const home = homeOf({
        out: rnd() < 0.4 ? { since: at(1), visiting: rnd() < 0.5 } : null,
        visitor: rnd() < 0.3 ? visitorOf(7) : null,
        returned: rnd() < 0.15 ? { letterId: `r${run}`, since: at(2), why: 'unanswered' } : null,
        landings,
      });
      // the window as an earlier read left it, then this read, with nothing holding it
      const before = homeOf({ out: rnd() < 0.5 ? OUT : null, visitor: rnd() < 0.2 ? visitorOf(8) : null });
      const start = flown(firstLook(before)).look;
      const look = nextLook(start, home);
      const shown = look.landing?.item.letterId ?? null;
      const left = landings.filter((l) => l.letterId !== shown);
      expect(look.waiting, `run ${run}`).toBe(left.length > 0);
      if (look.landing || lookInMotion(look)) continue;
      const ownFree = look.scene.own.kind === 'home' || (look.scene.own.kind === 'here' && !look.returned);
      const sillFree = look.scene.visitor.kind === 'none' && !look.visitor;
      for (const l of left) expect((l.how === 'home' && ownFree) || sillFree, `run ${run}: ${l.letterId} left with a free spot`).toBe(false);
    }
  });
});

/**
 * A pretend server and a window, played against each other: letters come,
 * birds are called and answered, letters are read elsewhere, the window is
 * read again, acted at, held, and left and come back to. However it goes,
 * every letter that came lands at the window, and lands once.
 */
describe('every letter lands, once', () => {
  interface World {
    t: number;
    n: number;
    landings: LetterLanding[];
    visitor: LetterVisitor | null;
    out: { since: string; visiting: boolean } | null;
    returned: LettersHome['returned'];
    pals: PenPal[];
    posted: Map<string, number>;
    came: string[];
  }
  const read = (w: World): LettersHome => {
    w.t += 1;
    return homeOf({
      now: at(w.t),
      out: w.out ? { ...w.out } : null,
      visitor: w.visitor,
      returned: w.out ? null : w.returned,
      landings: w.landings.map((l) => ({ ...l })),
      penPals: [...w.pals],
    });
  };
  const deliver = (w: World, how: LetterLanding['how'], who: number): void => {
    w.n += 1;
    w.t += 1;
    const l = landing(who, how, { letterId: `x${w.n}`, deliveredAt: at(w.t) });
    w.landings.push(l);
    w.came.push(l.letterId);
  };

  it('holds over many seeded walks, on a page that stays open and on one that is left and come back to', () => {
    for (let run = 0; run < 600; run++) {
      const rnd = seeded(1000 + run);
      const remount = run % 2 === 0;
      const w: World = { t: 200, n: 0, landings: [], visitor: null, out: null, returned: null, pals: [palOf(1), palOf(2), palOf(3)], posted: new Map(), came: [] };
      let look = firstLook(read(w));
      let data = read(w);
      const post = (ids: string[]): void => {
        for (const id of ids) {
          w.posted.set(id, (w.posted.get(id) ?? 0) + 1);
          const l = w.landings.find((x) => x.letterId === id);
          if (l) l.landed = true;
          if (w.returned?.letterId === id) w.returned = null;
          w.landings = w.landings.filter((x) => !(x.read && x.landed));
        }
      };
      const finishFlights = (): void => {
        const { own, visitor } = look.scene;
        if (own.kind === 'leaving') look = lookAfterOwnGone(look);
        if (own.kind === 'arriving') {
          const r = lookAfterLanded(look, 'own');
          post(r.post);
          look = r.look;
        }
        if (visitor.kind === 'arriving') {
          const r = lookAfterLanded(look, 'sill');
          post(r.post);
          look = r.look;
        }
        if (visitor.kind === 'leaving') look = lookAfterVisitorGone(look);
      };
      let held = false;
      // a read answered late, after one asked for later: the apps drop these, and the window must come to no harm if one slips through
      let older: LettersHome | null = null;
      for (let step = 0; step < 80; step++) {
        const r = rnd();
        if (r < 0.12) {
          // a pen pal with nothing still to land in their correspondence writes again
          const pal = [1, 2, 3].find((p) => !w.landings.some((l) => l.threadId === `t${p}`) && rnd() < 0.6);
          if (pal) deliver(w, 'window', pal);
        } else if (r < 0.18 && w.out) {
          // somebody calls your bird and answers it: it comes home with their answer, and they are a pen pal now
          const who = 10 + step;
          w.out = null;
          w.pals.push(palOf(who));
          deliver(w, 'home', who);
        } else if (r < 0.21 && w.out && !w.out.visiting) {
          w.out = null;
          w.returned = { letterId: `back${step}`, since: at(w.t), why: 'unanswered' };
        } else if (r < 0.24 && w.out) w.out = { ...w.out, visiting: true };
        else if (r < 0.3 && w.landings.length > 0) {
          // opened in the correspondence first, from a notification or on another device
          const l = w.landings[Math.floor(rnd() * w.landings.length)]!;
          l.read = true;
          w.landings = w.landings.filter((x) => !(x.read && x.landed));
        } else if (r < 0.34 && !w.visitor) w.visitor = visitorOf(40 + step, at(w.t));
        else if (r < 0.37 && w.visitor) w.visitor = null;
        else if (r < 0.45) {
          older = data;
          data = read(w);
        } else if (r < 0.47 && older) data = older;
        else if (r < 0.55) finishFlights();
        else if (r < 0.6) held = !held;
        else if (r < 0.68 && look.landing && !lookInMotion(look)) {
          // Read: the correspondence opens, and the window is come back to
          const l = w.landings.find((x) => x.letterId === look.landing!.item.letterId);
          if (l) l.read = true;
          w.landings = w.landings.filter((x) => !(x.read && x.landed));
          data = read(w);
          // a page come back to is a new page, which never hears of the reads the old one asked for
          if (remount) {
            look = firstLook(data);
            older = null;
          }
        } else if (r < 0.74 && look.visitor && look.scene.visitor.kind === 'here' && w.visitor?.letter.id === look.visitor.letter.id) {
          w.visitor = null;
          w.t += 1;
          if (rnd() < 0.5) look = lookAfterSendOn(look);
          else {
            const who = Number(look.visitor.person.id.slice(1));
            w.pals.push(palOf(who));
            look = lookAfterAnswer(look, { threadId: `t${who}`, person: person(who), letter: { ...look.visitor.letter, sentAt: at(w.t) } });
          }
        } else if (r < 0.8 && !w.out && !w.visitor && !look.visitor && (look.scene.own.kind === 'home' || look.scene.own.kind === 'here') && !held) {
          w.t += 1;
          w.out = { since: at(w.t), visiting: false };
          w.returned = null;
          look = lookAfterSend(look, 2, { kind: 'waiting', since: at(w.t) });
        } else if (r < 0.84 && !w.visitor && !look.visitor && look.scene.visitor.kind === 'none' && !held) {
          w.t += 1;
          w.visitor = visitorOf(60 + step, at(w.t));
          look = lookAfterCall(look, w.visitor);
        } else if (r < 0.87 && w.out && !w.out.visiting && look.scene.own.kind === 'away') {
          w.out = null;
          look = lookAfterRecall(look, 2);
        }
        look = nextLook(look, data, { held });
      }

      // then the window is left alone to catch up, and each letter shown is read in turn
      held = false;
      for (let i = 0; i < 60 && (w.landings.length > 0 || lookInMotion(look)); i++) {
        finishFlights();
        data = read(w);
        look = nextLook(look, data, { held });
        if (look.landing && !lookInMotion(look)) {
          const l = w.landings.find((x) => x.letterId === look.landing!.item.letterId);
          if (l) l.read = true;
          w.landings = w.landings.filter((x) => !(x.read && x.landed));
        } else if (!look.landing && look.visitor && look.scene.visitor.kind === 'here') {
          w.visitor = null;
          look = lookAfterSendOn(look);
        }
      }
      expect(w.landings, `run ${run}: letters never landed`).toEqual([]);
      for (const id of w.came) expect(w.posted.get(id) ?? 0, `run ${run}: ${id} landed once`).toBe(1);
    }
  });
});

describe('the look before anything is read', () => {
  it('is your bird at home or away and an empty sill', () => {
    expect(emptyLook(homeOf()).scene.own).toEqual({ kind: 'home', bird: 2 });
    expect(emptyLook(homeOf({ out: OUT })).scene.own).toEqual({ kind: 'away' });
  });
});
