/**
 * The letters window for both apps, as a pure function of its current look and the last read of `GET /letters`, so a test
 * can hold it to the rule that matters most: no letter still to land waits while its bird has a free spot on the sill.
 *
 * The sill has two spots: `own` for your bird (home, out with a letter, back with an answer as a `home` landing, or
 * `returned`), and `sill` for a visitor (a bird you called, or a pen pal's bird with a `window` landing); an answer whose
 * bird is out again comes to `sill` on its writer's bird. Every letter lands once, is reported (`lookAfterLanded` gives
 * the ids for /letters/landed) and waits on the sill until read; one is acted out at a time and `waiting` says another is
 * queued.
 *
 * The apps keep a `WindowLook`, start it with `firstLook`, pass each read through `nextLook` with `held` (a sheet open, a
 * request in flight; while held or while a bird flies only the sky changes), and each action and finished flight through
 * its `lookAfter…` function. A read in hand when acting is no longer news (`actedOn`), and reads older than the latest
 * action (`asOf`) or birds that left (`left`) are passed over too, so a stale read never undoes an action; the apps also
 * drop replies to reads requested before their last action.
 */
import type { BirdOutResult, LetterFlight, LetterLanding, LetterPerson, LetterReturnReason, LetterVisitor, LettersHome, VisitorAnswer } from './letters.js';

/** What the window acts out: your own bird, the bird in the visitor's spot, and the birds out over the country. */
export interface LetterWindowScene {
  /** your bird: at home on the sill, flying out, out there, flying in, or settled back with the letter it brought (`here`) */
  own: { kind: 'home'; bird: number } | { kind: 'leaving'; bird: number } | { kind: 'away' } | { kind: 'arriving'; bird: number } | { kind: 'here'; bird: number };
  /** a called bird or a pen pal's bird with a letter: coming down, settled, or leaving answered or sent on */
  visitor: { kind: 'none' } | { kind: 'arriving'; bird: number } | { kind: 'here'; bird: number } | { kind: 'leaving'; bird: number; how: 'answered' | 'sent-on' };
  /** the birds out there, by colour, the next to come first */
  sky: readonly number[];
  /** changes each time two people have just become pen pals, which plays the song once */
  song?: number;
}

type Own = LetterWindowScene['own'];
type Sill = LetterWindowScene['visitor'];

/** The two spots on the sill: your own bird's, and the visitor's. */
export type WindowSpot = 'own' | 'sill';

/** What is said under the window just now. */
export type WindowMoment =
  | { kind: 'rest' }
  | { kind: 'writing' }
  | { kind: 'sent' }
  /** your bird has flown and waits out there; said at once, before the page is read again */
  | { kind: 'waiting' }
  | { kind: 'answered'; person: LetterPerson; threadId: string }
  | { kind: 'sentOn'; name: string }
  /** the bird at the window flew on by itself: its day was up, or it was sent on elsewhere */
  | { kind: 'flownOn'; name: string }
  /** your own bird home with an answer, in its own spot */
  | { kind: 'homecoming'; person: LetterPerson; threadId: string; letterId: string }
  /** a letter brought to the visitor's spot by its writer's bird */
  | { kind: 'arrival'; person: LetterPerson; threadId: string; letterId: string }
  /** your own bird home by itself with its letter, nobody having answered it */
  | { kind: 'returned'; letterId: string; why: LetterReturnReason };

/** Your bird home by itself with its letter, as the window shows it until the bird flies out again. */
export interface WindowReturn {
  letterId: string;
  since: string;
  why: LetterReturnReason;
  /** its landing has been reported to the server */
  landed: boolean;
}

/** Everything the window shows, and what it keeps to work out the next look. */
export interface WindowLook {
  scene: LetterWindowScene;
  moment: WindowMoment;
  /** the called bird, as the call brought it or the server says; kept while it flies off, for its name */
  visitor: LetterVisitor | null;
  /** the letter being acted out now, and in which spot */
  landing: { item: LetterLanding; spot: WindowSpot } | null;
  /** your bird home by itself, while the window shows it so */
  returned: WindowReturn | null;
  /** what came of the correspondence named on arrival (a notification's `?bird=`): its bird lands here, or the correspondence opens */
  hint: { threadId: string; outcome: 'land' | 'open-thread' } | null;
  /** another letter is waiting its turn */
  waiting: boolean;
  /** the last read of the page the window was given */
  seen: LettersHome | null;
  /** the read in hand when something was last done here: no longer news, so used only to place letters */
  actedOn: LettersHome | null;
  /** the server time of the latest action here that returned one; a read made before it is out of date */
  asOf: string | null;
  /** letters of the birds that left this window, which an out-of-date read must not bring back */
  left: readonly string[];
  /** letters this window reported landed, which an earlier read must not land again */
  landed: readonly string[];
}

/** What a finished flight onto the sill comes to: the next look, the ids to post to /letters/landed, and whether a bird landed. */
export interface WindowLanded {
  look: WindowLook;
  post: string[];
  landed: boolean;
}

/** How many departed birds and landed letters the window remembers: more than ever pass while one page is open. */
const KEPT = 16;
/** The moments a letter may take over: nothing else is being said, or only something that has had its moment. */
const PICKABLE: ReadonlySet<WindowMoment['kind']> = new Set(['rest', 'waiting', 'answered', 'returned', 'homecoming', 'arrival']);
/** The moments derived from what is on the sill, recomputed whenever it changes. */
const DERIVED: ReadonlySet<WindowMoment['kind']> = new Set(['rest', 'returned', 'homecoming', 'arrival']);

/**
 * Every letter still to land or landed and unread, oldest first. An older server sent only its newest answer home and
 * newest pen pal's letter; those become landings never counted as landed and without ids, so nothing is posted for them
 * and they land on each visit until read.
 */
export function landingsOf(home: LettersHome): readonly LetterLanding[] {
  if (home.landings) return home.landings;
  const legacy: LetterLanding[] = [];
  const add = (l: LettersHome['homecoming'], how: LetterLanding['how']): void => {
    if (l) legacy.push({ letterId: l.letterId ?? '', threadId: l.threadId, person: l.person, how, landed: false, read: false, deliveredAt: '' });
  };
  add(home.homecoming, 'home');
  add(home.arrival, 'window');
  return legacy;
}

/** Where your own bird is, for the line under the window; an older server without `flight` said only whether it was out. */
export function flightOf(home: LettersHome): LetterFlight {
  if (home.flight) return home.flight;
  if (home.out) return home.out.visiting ? 'window' : 'sky';
  return home.returned || landingsOf(home).some((l) => l.how === 'home' && !l.landed) ? 'homeward' : 'home';
}

/**
 * Milliseconds on this device's clock until `at`, a server time such as a visitor's `leavesAt`, using the server's `now`
 * from a read made at `readAt`, so a phone with a wrong clock still sees a bird leave on time.
 */
export function untilServerTime(at: string, home: Pick<LettersHome, 'now'>, readAt: number, now: number): number {
  const server = home.now ? Date.parse(home.now) : readAt;
  return Date.parse(at) - server - (now - readAt);
}

/** Whether a bird is flying off or onto the sill; everything else holds still until it is through. */
export function lookInMotion(look: WindowLook): boolean {
  const own = look.scene.own.kind;
  const sill = look.scene.visitor.kind;
  return own === 'leaving' || own === 'arriving' || sill === 'arriving' || sill === 'leaving';
}

/** The window before anything is acted out: your bird at home or away, nothing at the window. */
export function emptyLook(home: LettersHome): WindowLook {
  return {
    scene: { own: home.out ? { kind: 'away' } : { kind: 'home', bird: home.bird }, visitor: { kind: 'none' }, sky: home.sky },
    moment: { kind: 'rest' },
    visitor: null,
    landing: null,
    returned: null,
    hint: null,
    waiting: false,
    seen: null,
    actedOn: null,
    asOf: null,
    left: [],
    landed: [],
  };
}

/**
 * The window's first look: a bird already at the window, your bird where it is, and the first letter still to land flying
 * in (or already on the sill if it landed before). `hint` names a notification's correspondence, whose letter lands first
 * if it can.
 */
export function firstLook(home: LettersHome, hint?: string | null): WindowLook {
  return nextLook(emptyLook(home), home, { held: false, hint });
}

/**
 * The window after another read, in order:
 *   1. the sky is always as the server says;
 *   2. nothing else changes while the window is held or a bird is flying;
 *   3. a bird at the window the server lists is shown there, and one it no longer lists flies off (home with an answer
 *      written elsewhere, or on);
 *   4. your bird is away while it is out, and flies home when it is not;
 *   5. a shown letter the server no longer lists (read and landed) leaves the sill, unless it was read in its
 *      correspondence first and only just landed here with nothing else to land; your bird home by itself flies back in;
 *   6. with nothing shown, the next letter lands where its bird fits: the named correspondence first, then letters never
 *      landed, then answers home, then the oldest.
 */
export function nextLook(look: WindowLook, home: LettersHome, opts: { held?: boolean; hint?: string | null } = {}): WindowLook {
  const late = readBefore(look, home);
  // A read older than something done here says nothing new, so the newest read in hand places the letters.
  const basis = late ? (look.seen ?? home) : home;
  const fresh = !late && home !== look.actedOn;
  const held = opts.held === true || holds(look);
  const d = draftOf(look);
  if (!late) d.seen = home;
  if (fresh) d.sky = keep(d.sky, home.sky);
  const homeward = fresh && !held ? adopt(d, home) : false;
  const hint = opts.hint || null;
  if (!held) place(d, basis, hint, homeward);
  // A bird that was away and brought nothing to land (called back elsewhere) still flies home rather than appearing there.
  if (homeward && d.own.kind === 'home') d.own = { kind: 'arriving', bird: d.own.bird };
  if (!hint) d.hint = null;
  else if (look.hint?.threadId !== hint) {
    // Its letter is at the window or flying in: it lands here, unless the person is busy with something they started.
    const showing = d.landing?.item.threadId === hint && opts.held !== true && d.moment.kind !== 'writing';
    d.hint = { threadId: hint, outcome: showing ? 'land' : 'open-thread' };
  }
  d.waiting = waitingIn(d, basis);
  settle(d);
  return finish(look, d);
}

/** Sets the moment the page itself causes (writing, back to rest); at rest, what the sill shows is said again. */
export function lookWithMoment(look: WindowLook, moment: WindowMoment): WindowLook {
  const d = draftOf(look);
  d.moment = moment;
  settle(d);
  return finish(look, d);
}

/** Your bird flies out with a letter (`POST /letters/out` answered); anything it brought home stays to be shown on the sill. */
export function lookAfterSend(look: WindowLook, bird: number, sent?: BirdOutResult | null): WindowLook {
  return acted(look, (d) => {
    d.own = { kind: 'leaving', bird };
    if (d.landing?.spot === 'own') d.landing = null;
    d.returned = null;
    d.moment = { kind: 'sent' };
    d.asOf = latest(d.asOf, sent?.since);
  });
}

/** Your bird has flown out through the window and now waits out there. */
export function lookAfterOwnGone(look: WindowLook): WindowLook {
  if (look.scene.own.kind !== 'leaving') return look;
  return flew(look, (d) => {
    d.own = { kind: 'away' };
    if (d.moment.kind === 'sent') d.moment = { kind: 'waiting' };
  });
}

/** A bird called (`POST /letters/call` answered): the first bird out sets off, and a letter in its spot makes way. */
export function lookAfterCall(look: WindowLook, visitor: LetterVisitor): WindowLook {
  return acted(look, (d) => {
    if (d.landing?.spot === 'sill') d.landing = null;
    d.visitor = visitor;
    d.sill = { kind: 'arriving', bird: visitor.person.bird };
    d.sky = d.sky.slice(1);
    d.moment = { kind: 'rest' };
    d.asOf = latest(d.asOf, visitor.since);
  });
}

/** The visitor answered (`POST /letters/visitor` answered): your letter drops onto the sill, its bird takes it home, and the birds sing. */
export function lookAfterAnswer(look: WindowLook, answer: VisitorAnswer): WindowLook {
  const visitor = look.visitor;
  if (!visitor) return look;
  return acted(look, (d) => {
    d.left = remember(d.left, visitor.letter.id);
    d.sill = { kind: 'leaving', bird: visitor.person.bird, how: 'answered' };
    d.moment = { kind: 'answered', person: answer.person, threadId: answer.threadId };
    d.song = (d.song ?? 0) + 1;
    d.asOf = latest(d.asOf, answer.letter.sentAt);
  });
}

/** The visitor sent on (`DELETE /letters/visitor` answered): it picks its letter up again and goes. */
export function lookAfterSendOn(look: WindowLook): WindowLook {
  const visitor = look.visitor;
  if (!visitor) return look;
  return acted(look, (d) => {
    d.left = remember(d.left, visitor.letter.id);
    d.sill = { kind: 'leaving', bird: visitor.person.bird, how: 'sent-on' };
    d.moment = { kind: 'sentOn', name: visitor.person.name };
  });
}

/** The visitor has flown off, or is gone without a flight because its answer was refused after it flew on: the sill is free. */
export function lookAfterVisitorGone(look: WindowLook): WindowLook {
  return flew(look, (d) => {
    if (d.visitor) d.left = remember(d.left, d.visitor.letter.id);
    d.visitor = null;
    if (d.landing?.spot !== 'sill') d.sill = { kind: 'none' };
    if (d.moment.kind === 'sentOn' || d.moment.kind === 'flownOn') d.moment = { kind: 'rest' };
    // A letter that landed while the visitor was here gets its turn now; the new pen pals were announced as their bird left.
    else if (d.moment.kind === 'answered' && d.landing) d.moment = momentOf(d.landing);
  });
}

/**
 * Your bird called back (`DELETE /letters/out` answered 204): it flies home with its letter. Any other answer is not a
 * recall: read the page again and let the next look show what happened.
 */
export function lookAfterRecall(look: WindowLook, bird: number): WindowLook {
  return acted(look, (d) => {
    d.own = { kind: 'arriving', bird };
    d.moment = { kind: 'rest' };
  });
}

/** A new bird chosen (`POST /letters/bird` answered): your bird takes its colours. */
export function lookAfterBirdChosen(look: WindowLook, bird: number): WindowLook {
  return acted(look, (d) => {
    if (d.own.kind !== 'away') d.own = { kind: d.own.kind, bird };
  });
}

/**
 * A bird has finished flying onto the sill in either spot, so its letter has landed: post `post` to /letters/landed once.
 * Nothing is posted for a called bird, a letter that landed before or a letter from a server without landings. `landed`
 * is false when no bird was on its way there.
 */
export function lookAfterLanded(look: WindowLook, spot: WindowSpot): WindowLanded {
  const d = draftOf(look);
  const post: string[] = [];
  if (spot === 'own') {
    if (d.own.kind !== 'arriving') return { look, post, landed: false };
    d.own = { kind: 'here', bird: d.own.bird };
    if (d.landing?.spot === 'own') d.landing = landedHere(d, d.landing, post);
    else if (d.returned && !d.returned.landed) {
      post.push(d.returned.letterId);
      d.returned = { ...d.returned, landed: true };
    }
  } else {
    if (d.sill.kind !== 'arriving') return { look, post, landed: false };
    d.sill = { kind: 'here', bird: d.sill.bird };
    if (d.landing?.spot === 'sill') d.landing = landedHere(d, d.landing, post);
  }
  settle(d);
  return { look: finish(look, d), post, landed: true };
}

// ───────────────────────────────────────────────────────────── the working

interface Draft {
  own: Own;
  sill: Sill;
  sky: readonly number[];
  song: number | undefined;
  moment: WindowMoment;
  visitor: LetterVisitor | null;
  landing: WindowLook['landing'];
  returned: WindowReturn | null;
  hint: WindowLook['hint'];
  waiting: boolean;
  seen: LettersHome | null;
  actedOn: LettersHome | null;
  asOf: string | null;
  left: readonly string[];
  landed: readonly string[];
}

function draftOf(look: WindowLook): Draft {
  const { scene, ...rest } = look;
  return { ...rest, own: scene.own, sill: scene.visitor, sky: scene.sky, song: scene.song };
}

/** An action at the window: the read it was done on is no longer news (`actedOn`), and the sill is said again. */
function acted(look: WindowLook, change: (d: Draft) => void): WindowLook {
  const d = draftOf(look);
  d.actedOn = look.seen;
  change(d);
  if (look.seen) d.waiting = waitingIn(d, look.seen);
  settle(d);
  return finish(look, d);
}

/**
 * A finished flight. It is not an action on a read, so a read that came during the flight stays news; otherwise your bird,
 * home after its letter was answered at the same moment as yours, would stay away with its answer on the other bird.
 */
function flew(look: WindowLook, change: (d: Draft) => void): WindowLook {
  const d = draftOf(look);
  change(d);
  if (look.seen) d.waiting = waitingIn(d, look.seen);
  settle(d);
  return finish(look, d);
}

/** Writing, and the plays that end in a flight, hold the window as a flight does. */
function holds(look: WindowLook): boolean {
  const m = look.moment.kind;
  return m === 'writing' || m === 'sent' || m === 'sentOn' || m === 'flownOn' || lookInMotion(look);
}

/** Whether the server made this read before the latest action here that returned a time. */
function readBefore(look: WindowLook, home: LettersHome): boolean {
  return look.asOf !== null && typeof home.now === 'string' && Date.parse(home.now) < Date.parse(look.asOf);
}

/** Steps 3 to 5 of `nextLook`: takes in the server's birds; says whether your bird was just found home after being away. */
function adopt(d: Draft, home: LettersHome): boolean {
  // The bird at the window; one that left never comes back, so a read from before it left cannot restore it.
  const server = home.visitor && !d.left.includes(home.visitor.letter.id) ? home.visitor : null;
  if (server && d.visitor?.letter.id !== server.letter.id) {
    // Called from another device, or by a call whose answer was lost: shown there without a flight, and a pen pal's letter
    // in its spot makes way, still to land.
    if (d.landing?.spot === 'sill') d.landing = null;
    d.visitor = server;
    d.sill = { kind: 'here', bird: server.person.bird };
  } else if (server) d.visitor = keep(d.visitor, server);
  else if (d.visitor) {
    const gone = d.visitor;
    d.left = remember(d.left, gone.letter.id);
    if (d.sill.kind === 'here') {
      // Answered on another device, it flies home with that answer and the two are pen pals; otherwise it flew on by itself.
      const pal = home.penPals.find((p) => p.person.id === gone.person.id);
      d.sill = { kind: 'leaving', bird: d.sill.bird, how: pal ? 'answered' : 'sent-on' };
      d.moment = pal ? { kind: 'answered', person: pal.person, threadId: pal.threadId } : { kind: 'flownOn', name: gone.person.name };
      if (pal) d.song = (d.song ?? 0) + 1;
    } else d.visitor = null;
  }

  // Your own bird: away while out, with its answer or letter left to show on the sill; home again when not.
  let homeward = false;
  if (home.out) {
    if (d.own.kind === 'home' || d.own.kind === 'here') {
      d.own = { kind: 'away' };
      if (d.landing?.spot === 'own') d.landing = null;
      d.returned = null;
    }
  } else if (d.own.kind === 'away') {
    d.own = { kind: 'home', bird: home.bird };
    homeward = true;
  }
  if (d.moment.kind === 'waiting') d.moment = { kind: 'rest' };
  if ((d.own.kind === 'home' || d.own.kind === 'here') && d.own.bird !== home.bird) d.own = { kind: d.own.kind, bird: home.bird };

  // A shown letter the server no longer lists was read and landed, here or elsewhere. One read in its correspondence first
  // and only just landed here is what the person is looking at, so it stays for this visit unless another letter needs the
  // window.
  const shown = d.landing;
  if (shown) {
    const now = landingsOf(home).find((l) => keyOf(l) === keyOf(shown.item));
    const stays =
      !now &&
      shown.item.read &&
      !!shown.item.letterId &&
      d.landed.includes(shown.item.letterId) &&
      landingsOf(home).length === 0 &&
      home.penPals.some((p) => p.threadId === shown.item.threadId);
    if (!now && !stays) {
      if (shown.spot === 'own' && d.own.kind === 'here') d.own = { kind: 'home', bird: d.own.bird };
      if (shown.spot === 'sill' && d.sill.kind === 'here') d.sill = { kind: 'none' };
      d.landing = null;
    } else if (now) {
      const item = known(d, now);
      d.landing = { item: keep(shown.item, { ...item, landed: item.landed || shown.item.landed }), spot: shown.spot };
    }
  }

  // Your bird home by itself: it flies in once and is said to be home until it flies out again.
  const back = home.out ? null : (home.returned ?? null);
  if (back && d.returned?.letterId !== back.letterId && d.landing?.spot !== 'own' && (d.own.kind === 'home' || d.own.kind === 'here')) {
    d.returned = { letterId: back.letterId, since: back.since, why: back.why, landed: false };
    d.own = { kind: 'arriving', bird: home.bird };
    homeward = false;
  }
  return homeward;
}

/** Step 6 of `nextLook`: with nothing shown, the first letter whose bird has a free spot lands there. */
function place(d: Draft, home: LettersHome, hint: string | null, homeward: boolean): void {
  if (d.landing || !PICKABLE.has(d.moment.kind)) return;
  for (const item of inTurn(landingsOf(home).map((l) => known(d, l)), hint)) {
    // Your own bird brings its answer home while its spot is free (at home, or back with only its own letter).
    if (item.how === 'home' && (d.own.kind === 'home' || (d.own.kind === 'here' && !d.returned))) {
      // Seen landing before, it is simply there, but a bird this window saw away always flies in.
      d.own = { kind: item.landed && !homeward ? 'here' : 'arriving', bird: d.own.bird };
      d.landing = { item, spot: 'own' };
      d.moment = momentOf(d.landing);
      return;
    }
    if (d.sill.kind === 'none' && !d.visitor) {
      d.sill = { kind: item.landed ? 'here' : 'arriving', bird: item.person.bird };
      d.landing = { item, spot: 'sill' };
      d.moment = momentOf(d.landing);
      return;
    }
  }
}

/** The letters in landing order: the named correspondence, then those never landed, then answers home, then the oldest. */
function inTurn(list: readonly LetterLanding[], hint: string | null): LetterLanding[] {
  const rank = (l: LetterLanding): number[] => [l.threadId === hint ? 0 : 1, l.landed ? 1 : 0, l.how === 'home' ? 0 : 1];
  return [...list].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i]! - rb[i]!;
    return a.deliveredAt < b.deliveredAt ? -1 : a.deliveredAt > b.deliveredAt ? 1 : 0;
  });
}

/** Whether a letter the server lists is not the one being shown, and so waits its turn. */
function waitingIn(d: Draft, home: LettersHome): boolean {
  const shown = d.landing ? keyOf(d.landing.item) : null;
  return landingsOf(home).some((l) => keyOf(l) !== shown);
}

/** What is said of the sill when nothing else is: the letter on it, or your bird home by itself. */
function settle(d: Draft): void {
  if (!DERIVED.has(d.moment.kind)) return;
  const said: WindowMoment = d.landing
    ? momentOf(d.landing)
    : d.returned
      ? { kind: 'returned', letterId: d.returned.letterId, why: d.returned.why }
      : { kind: 'rest' };
  d.moment = keep(d.moment, said);
}

function momentOf(landing: NonNullable<WindowLook['landing']>): WindowMoment {
  const { person, threadId, letterId } = landing.item;
  return landing.spot === 'own' ? { kind: 'homecoming', person, threadId, letterId } : { kind: 'arrival', person, threadId, letterId };
}

/** A letter landed in its spot: posted once if the server can be told, and landed from then on. */
function landedHere(d: Draft, landing: NonNullable<WindowLook['landing']>, post: string[]): NonNullable<WindowLook['landing']> {
  if (landing.item.landed) return landing;
  const id = landing.item.letterId;
  if (id) {
    post.push(id);
    d.landed = remember(d.landed, id);
  }
  return { item: { ...landing.item, landed: true }, spot: landing.spot };
}

/** A letter as the server lists it, landed if this window already reported it, whatever an earlier read says. */
function known(d: Draft, item: LetterLanding): LetterLanding {
  return !item.landed && item.letterId && d.landed.includes(item.letterId) ? { ...item, landed: true } : item;
}

/** A letter's id, or for a server without landings, which of its two letters it is. */
function keyOf(l: LetterLanding): string {
  return l.letterId || `${l.how}:${l.threadId}`;
}

function remember(ids: readonly string[], id: string): readonly string[] {
  return ids.includes(id) ? ids : [...ids, id].slice(-KEPT);
}

/** The later of two server times. */
function latest(a: string | null, b: string | null | undefined): string | null {
  if (!b) return a;
  return a === null || Date.parse(b) > Date.parse(a) ? b : a;
}

/** The value already held when the new one is equal, so an unchanged look stays the same object. */
function keep<T>(old: T, next: T): T {
  return old === next || JSON.stringify(old) === JSON.stringify(next) ? old : next;
}

function finish(look: WindowLook, d: Draft): WindowLook {
  const s = look.scene;
  const own = keep(s.own, d.own);
  const sill = keep(s.visitor, d.sill);
  const sky = keep(s.sky, d.sky);
  const scene = own === s.own && sill === s.visitor && sky === s.sky && d.song === s.song ? s : { own, visitor: sill, sky, ...(d.song === undefined ? {} : { song: d.song }) };
  const next: WindowLook = {
    scene,
    moment: keep(look.moment, d.moment),
    visitor: keep(look.visitor, d.visitor),
    landing: keep(look.landing, d.landing),
    returned: keep(look.returned, d.returned),
    hint: keep(look.hint, d.hint),
    waiting: d.waiting,
    seen: d.seen,
    actedOn: d.actedOn,
    asOf: d.asOf,
    left: d.left,
    landed: d.landed,
  };
  const same = (Object.keys(next) as (keyof WindowLook)[]).every((k) => next[k] === look[k]);
  return same ? look : next;
}
