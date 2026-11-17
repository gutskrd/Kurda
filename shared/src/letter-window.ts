/**
 * The letters window, worked out once for both apps: what it acts out, from
 * what the server says (`GET /letters`) and from what is done at it.
 *
 * Each app used to work this out by itself, and both lost birds there: a
 * first look that showed one bird and hid the rest, reloads that copied only
 * the sky, so nothing that came while the window was open was ever shown,
 * and a phone that looked again properly only after a correspondence had
 * been opened from it. Here it is one pure function of two things, the look
 * the window has now and the page as last read, so the rule that matters
 * most is one a test can hold it to: no letter still to land waits while
 * there is a free spot on the sill for its bird.
 *
 * The sill has two spots. Your own bird's (`own`): it stands there at home,
 * flies out with a letter, and lands there again coming home, with the answer
 * somebody wrote (a `home` landing), with its own letter when nobody called
 * it (`returned`), or with its letter when you called it back. And the
 * visitor's spot (`sill`): a bird you called, waiting for your answer, or a
 * pen pal's bird with their next letter (a `window` landing). An answer whose
 * bird is out again is brought to the visitor's spot by its writer's own
 * bird, rather than waiting up to two weeks for yours to come back.
 *
 * Every letter lands once (`LetterLanding`): its bird flies in, the window
 * says so (`lookAfterLanded` gives the ids to post to /letters/landed), and
 * after that the letter waits on the sill, with no flight, until it is read.
 * One letter is acted out at a time; any other waits its turn, and `waiting`
 * says there is one.
 *
 * How the apps use it:
 *
 *   const [look, setLook] = useState<WindowLook | null>(null);
 *   const moving = look !== null && lookInMotion(look);
 *   useEffect(() => {
 *     if (data) setLook((l) => (l ? nextLook(l, data, { held, hint }) : firstLook(data, hint)));
 *   }, [data, held, hint, moving]);
 *
 * `held` is anything on the page that must not be swapped out under the
 * person: a sheet open, a bird being chosen, a request on its way. Writing a
 * letter holds by itself. While the window is held, or a bird is flying, only
 * the sky changes; the rest catches up as soon as that ends. Each thing done
 * at the window goes through its `lookAfter…` function, and each flight the
 * window finishes through `lookAfterOwnGone`, `lookAfterVisitorGone` or
 * `lookAfterLanded`.
 *
 * What is done at the window shows before the server has been read again,
 * and a read the window had already been given when something was done is
 * not news to it after that (`actedOn`): it still places letters, but it
 * never takes back a bird that has just flown or come. A read the server made
 * before something done here (its `now` earlier than that action's own time,
 * `asOf`) is passed over the same way, and so is a bird that has left this
 * window (`left`). The apps still drop the answer to a read they asked for
 * before their last action, so that a slow one never comes in after it.
 */
import type { BirdOutResult, LetterFlight, LetterLanding, LetterPerson, LetterReturnReason, LetterVisitor, LettersHome, VisitorAnswer } from './letters.js';

/** What the window acts out: your own bird, the bird in the visitor's spot, and the birds out over the country. */
export interface LetterWindowScene {
  /** your bird: at home on the sill, flying out, out there, flying in, or settled back with the letter it brought (`here`) */
  own: { kind: 'home'; bird: number } | { kind: 'leaving'; bird: number } | { kind: 'away' } | { kind: 'arriving'; bird: number } | { kind: 'here'; bird: number };
  /** a bird called to the window or a pen pal's bird with a letter: coming down, settled, or leaving answered or sent on */
  visitor: { kind: 'none' } | { kind: 'arriving'; bird: number } | { kind: 'here'; bird: number } | { kind: 'leaving'; bird: number; how: 'answered' | 'sent-on' };
  /** the birds out there, by colour, the next to come first */
  sky: readonly number[];
  /** sung once each time this changes: two people have just become pen pals */
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
  /** your bird has flown and waits out there: said at once, before the page has been read again */
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

/** Your bird home by itself with its letter, as the window shows it; it stays said until the bird flies out again. */
export interface WindowReturn {
  letterId: string;
  since: string;
  why: LetterReturnReason;
  /** its landing has been said to the server */
  landed: boolean;
}

/** Everything the window shows, and what it keeps to work out the next look. */
export interface WindowLook {
  scene: LetterWindowScene;
  moment: WindowMoment;
  /** the bird called to the window, as the call brought it or the server says; kept while it flies off, for its name */
  visitor: LetterVisitor | null;
  /** the letter being acted out now, and in which spot */
  landing: { item: LetterLanding; spot: WindowSpot } | null;
  /** your bird home by itself, while the window shows it so */
  returned: WindowReturn | null;
  /** what was made of the correspondence named on arriving (a notification's `?bird=`): its bird lands here, or the correspondence opens instead */
  hint: { threadId: string; outcome: 'land' | 'open-thread' } | null;
  /** another letter is waiting its turn at the window */
  waiting: boolean;
  /** the last read of the page the window was given */
  seen: LettersHome | null;
  /** the read the window had been given when something was last done at it: no longer news, so only used to place letters */
  actedOn: LettersHome | null;
  /** the server's time of the latest thing done here that said one: a read made before it is out of date */
  asOf: string | null;
  /** the letters of the birds that left this window, which an out-of-date read must not bring back */
  left: readonly string[];
  /** the letters this window has said landed, which a read from before it said so must not land again */
  landed: readonly string[];
}

/** What a finished flight onto the sill comes to: the next look, the letters to post to /letters/landed, and whether a bird landed at all. */
export interface WindowLanded {
  look: WindowLook;
  post: string[];
  landed: boolean;
}

/** How many of the birds that left this window, and of the letters landed at it, it remembers: more than ever come and go while one page is open. */
const KEPT = 16;
/** The moments a letter may take over: nothing else is being said, or only something that has had its moment. */
const PICKABLE: ReadonlySet<WindowMoment['kind']> = new Set(['rest', 'waiting', 'answered', 'returned', 'homecoming', 'arrival']);
/** The moments said of what is on the sill, worked out again from it whenever it changes. */
const DERIVED: ReadonlySet<WindowMoment['kind']> = new Set(['rest', 'returned', 'homecoming', 'arrival']);

/**
 * Every letter still to land at the window, or landed and not yet read,
 * oldest first. A server from before landings sent only its newest answer
 * home and newest pen pal's letter, each until it was read; those come back
 * as landings that are never counted as landed and have no letter id, so
 * nothing is posted for them, and they land on each visit until read, as
 * they always did.
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

/**
 * Where your own bird is now, for the calm line at the window: at home, out
 * over the country waiting to be called, at somebody's window, or on its way
 * home. A server from before `flight` said only whether it was out.
 */
export function flightOf(home: LettersHome): LetterFlight {
  if (home.flight) return home.flight;
  if (home.out) return home.out.visiting ? 'window' : 'sky';
  return home.returned || landingsOf(home).some((l) => l.how === 'home' && !l.landed) ? 'homeward' : 'home';
}

/**
 * How long from `now`, in milliseconds on this device's clock, until `at`, a
 * time on the server's clock: a visitor's `leavesAt`, a bird's `homeBy`. The
 * page says the server's time as it was read (`now`, read at `readAt` here),
 * so a phone whose clock is set wrong still sees a bird leave on time.
 */
export function untilServerTime(at: string, home: Pick<LettersHome, 'now'>, readAt: number, now: number): number {
  const server = home.now ? Date.parse(home.now) : readAt;
  return Date.parse(at) - server - (now - readAt);
}

/** Whether a bird is on its way off the sill or onto it: the window holds still for everything else until it is through. */
export function lookInMotion(look: WindowLook): boolean {
  const own = look.scene.own.kind;
  const sill = look.scene.visitor.kind;
  return own === 'leaving' || own === 'arriving' || sill === 'arriving' || sill === 'leaving';
}

/** The window as it is before anything is acted out: your bird at home or away, nothing at the window. */
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
 * The window's first look at the page: a bird at the window already there,
 * your bird where it is, and the first letter still to land flying in (or
 * already on the sill, if it landed before). `hint` names the correspondence
 * a notification was about, whose letter lands first if it can.
 */
export function firstLook(home: LettersHome, hint?: string | null): WindowLook {
  return nextLook(emptyLook(home), home, { held: false, hint });
}

/**
 * The window after another read of the page. In order:
 *   1. the sky is always as the server says;
 *   2. nothing else changes while the window is held or a bird is flying;
 *   3. a bird at the window the server has is shown there (one it no longer
 *      has flies off: home with an answer written elsewhere, or on);
 *   4. your bird is away while it is out, and flies home when it is not;
 *   5. a letter shown that the server no longer lists (read, and landed)
 *      leaves the sill, unless it was read in its correspondence first and
 *      has only just landed here, with nothing else to land; and your bird
 *      home by itself is shown coming back;
 *   6. with nothing being shown, the next letter lands where its bird fits:
 *      the named correspondence first, then letters that have not landed
 *      before, then answers home, then the oldest.
 */
export function nextLook(look: WindowLook, home: LettersHome, opts: { held?: boolean; hint?: string | null } = {}): WindowLook {
  const late = readBefore(look, home);
  // a read older than something done here says nothing new, so the newest read there is places the letters
  const basis = late ? (look.seen ?? home) : home;
  const fresh = !late && home !== look.actedOn;
  const held = opts.held === true || holds(look);
  const d = draftOf(look);
  if (!late) d.seen = home;
  if (fresh) d.sky = keep(d.sky, home.sky);
  const homeward = fresh && !held ? adopt(d, home) : false;
  const hint = opts.hint || null;
  if (!held) place(d, basis, hint, homeward);
  // a bird that was away and brought nothing to land (called back elsewhere) still flies home, rather than appearing there
  if (homeward && d.own.kind === 'home') d.own = { kind: 'arriving', bird: d.own.bird };
  if (!hint) d.hint = null;
  else if (look.hint?.threadId !== hint) {
    // its letter is at the window, or flying in: it lands here, unless the person is busy with something they started
    const showing = d.landing?.item.threadId === hint && opts.held !== true && d.moment.kind !== 'writing';
    d.hint = { threadId: hint, outcome: showing ? 'land' : 'open-thread' };
  }
  d.waiting = waitingIn(d, basis);
  settle(d);
  return finish(look, d);
}

/** The moment set by the page itself (writing, back to rest), with what the sill shows said again when it is rest. */
export function lookWithMoment(look: WindowLook, moment: WindowMoment): WindowLook {
  const d = draftOf(look);
  d.moment = moment;
  settle(d);
  return finish(look, d);
}

/** Your bird flies out with a letter (`POST /letters/out` answered): anything it brought home stays to be shown on the sill. */
export function lookAfterSend(look: WindowLook, bird: number, sent?: BirdOutResult | null): WindowLook {
  return acted(look, (d) => {
    d.own = { kind: 'leaving', bird };
    if (d.landing?.spot === 'own') d.landing = null;
    d.returned = null;
    d.moment = { kind: 'sent' };
    d.asOf = latest(d.asOf, sent?.since);
  });
}

/** Your bird has flown out through the window: it waits out there now. */
export function lookAfterOwnGone(look: WindowLook): WindowLook {
  if (look.scene.own.kind !== 'leaving') return look;
  return flew(look, (d) => {
    d.own = { kind: 'away' };
    if (d.moment.kind === 'sent') d.moment = { kind: 'waiting' };
  });
}

/** A bird called to the window (`POST /letters/call` answered): the first bird out there sets out, and a letter in its spot makes way. */
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

/** The visitor answered (`POST /letters/visitor` answered): your letter drops onto the sill, its bird takes it home, and the two birds sing. */
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

/** The visitor sent on its way (`DELETE /letters/visitor` answered): it picks its letter up again and goes. */
export function lookAfterSendOn(look: WindowLook): WindowLook {
  const visitor = look.visitor;
  if (!visitor) return look;
  return acted(look, (d) => {
    d.left = remember(d.left, visitor.letter.id);
    d.sill = { kind: 'leaving', bird: visitor.person.bird, how: 'sent-on' };
    d.moment = { kind: 'sentOn', name: visitor.person.name };
  });
}

/**
 * The visitor has flown off through the window, or is gone without a flight
 * (its answer refused because it had already flown on): the sill is free.
 */
export function lookAfterVisitorGone(look: WindowLook): WindowLook {
  return flew(look, (d) => {
    if (d.visitor) d.left = remember(d.left, d.visitor.letter.id);
    d.visitor = null;
    if (d.landing?.spot !== 'sill') d.sill = { kind: 'none' };
    if (d.moment.kind === 'sentOn' || d.moment.kind === 'flownOn') d.moment = { kind: 'rest' };
    // a letter that landed while the visitor was here (your bird home with an answer) has its turn now that the sill is
    // the window's again: the pen pals just made were said while their bird flew off, and are in the list below
    else if (d.moment.kind === 'answered' && d.landing) d.moment = momentOf(d.landing);
  });
}

/**
 * Your bird called back (`DELETE /letters/out` answered 204): it flies home
 * with its letter. Any other answer is not a recall: read the page again and
 * let the next look show what did happen (an answer home, as often as not).
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
 * A bird has finished flying onto the sill, in your own spot or the
 * visitor's. Its letter has landed: post `post` to /letters/landed (once;
 * nothing is posted for a bird called to the window, a letter that had
 * landed before, or a letter from a server without landings). `landed` is
 * false when no bird was on its way there, so nothing happened.
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

/** Something done at the window: the read it was done on is no longer news (`actedOn`), and the sill is said again. */
function acted(look: WindowLook, change: (d: Draft) => void): WindowLook {
  const d = draftOf(look);
  d.actedOn = look.seen;
  change(d);
  if (look.seen) d.waiting = waitingIn(d, look.seen);
  settle(d);
  return finish(look, d);
}

/**
 * A flight through the window finished. That is not something done on a read
 * of the page, so the read the window was given meanwhile stays news: had it
 * counted as acted on, a read that came while a bird was flying (your own
 * bird home after its letter was answered at the same moment as yours) would
 * never be taken in, and your bird would stay away with its answer brought in
 * on the other bird.
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

/** A read the server made before the latest thing done here that said its time. */
function readBefore(look: WindowLook, home: LettersHome): boolean {
  return look.asOf !== null && typeof home.now === 'string' && Date.parse(home.now) < Date.parse(look.asOf);
}

/** Steps 3 to 5 of `nextLook`: the server's birds taken in. Says whether your bird has just been found home after being away. */
function adopt(d: Draft, home: LettersHome): boolean {
  // the bird at the window; one that has left it never comes back to it, so a read from before it left cannot bring it back
  const server = home.visitor && !d.left.includes(home.visitor.letter.id) ? home.visitor : null;
  if (server && d.visitor?.letter.id !== server.letter.id) {
    // called from another device, or by a call whose answer was lost: it is there already, so it is shown there, without
    // a flight; a pen pal's letter in its spot makes way, still to land
    if (d.landing?.spot === 'sill') d.landing = null;
    d.visitor = server;
    d.sill = { kind: 'here', bird: server.person.bird };
  } else if (server) d.visitor = keep(d.visitor, server);
  else if (d.visitor) {
    const gone = d.visitor;
    d.left = remember(d.left, gone.letter.id);
    if (d.sill.kind === 'here') {
      // answered on another device, it flies home with that answer and the two are pen pals; otherwise it flew on by itself
      const pal = home.penPals.find((p) => p.person.id === gone.person.id);
      d.sill = { kind: 'leaving', bird: d.sill.bird, how: pal ? 'answered' : 'sent-on' };
      d.moment = pal ? { kind: 'answered', person: pal.person, threadId: pal.threadId } : { kind: 'flownOn', name: gone.person.name };
      if (pal) d.song = (d.song ?? 0) + 1;
    } else d.visitor = null;
  }

  // your own bird: away while it is out, its answer or its letter left to be shown on the sill; home again when it is not
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

  // a letter shown that the server no longer lists has been read and has landed, here or on another device; but one
  // read in its correspondence first and only just landed here is what the person is looking at: it stays on the sill
  // for this visit, rather than its bird vanishing a moment after it came down, unless another letter needs the window
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

  // your bird home by itself, nobody having answered it: it flies in once, and is said to be home until it flies out again
  const back = home.out ? null : (home.returned ?? null);
  if (back && d.returned?.letterId !== back.letterId && d.landing?.spot !== 'own' && (d.own.kind === 'home' || d.own.kind === 'here')) {
    d.returned = { letterId: back.letterId, since: back.since, why: back.why, landed: false };
    d.own = { kind: 'arriving', bird: home.bird };
    homeward = false;
  }
  return homeward;
}

/** Step 6 of `nextLook`: with nothing being shown, the first letter that has a spot for its bird lands there. */
function place(d: Draft, home: LettersHome, hint: string | null, homeward: boolean): void {
  if (d.landing || !PICKABLE.has(d.moment.kind)) return;
  for (const item of inTurn(landingsOf(home).map((l) => known(d, l)), hint)) {
    // your own bird brings its answer home to its own spot while that is free (at home, or back with only its own letter)
    if (item.how === 'home' && (d.own.kind === 'home' || (d.own.kind === 'here' && !d.returned))) {
      // seen landing before, it is simply there; but a bird this window saw away always flies in
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

/** The letters in the order they land: the named correspondence, then not landed before, then answers home, then the oldest. */
function inTurn(list: readonly LetterLanding[], hint: string | null): LetterLanding[] {
  const rank = (l: LetterLanding): number[] => [l.threadId === hint ? 0 : 1, l.landed ? 1 : 0, l.how === 'home' ? 0 : 1];
  return [...list].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i]! - rb[i]!;
    return a.deliveredAt < b.deliveredAt ? -1 : a.deliveredAt > b.deliveredAt ? 1 : 0;
  });
}

/** Whether a letter the server lists is not the one being shown, so it waits its turn. */
function waitingIn(d: Draft, home: LettersHome): boolean {
  const shown = d.landing ? keyOf(d.landing.item) : null;
  return landingsOf(home).some((l) => keyOf(l) !== shown);
}

/** What is said of the sill when nothing else is being said: the letter on it, or your bird home by itself. */
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

/** A letter landed in its spot: posted once, if the server can be told of it, and landed from then on. */
function landedHere(d: Draft, landing: NonNullable<WindowLook['landing']>, post: string[]): NonNullable<WindowLook['landing']> {
  if (landing.item.landed) return landing;
  const id = landing.item.letterId;
  if (id) {
    post.push(id);
    d.landed = remember(d.landed, id);
  }
  return { item: { ...landing.item, landed: true }, spot: landing.spot };
}

/** A letter as the server lists it, landed if this window has said so already, whatever an earlier read says. */
function known(d: Draft, item: LetterLanding): LetterLanding {
  return !item.landed && item.letterId && d.landed.includes(item.letterId) ? { ...item, landed: true } : item;
}

/** A letter's own id, or for a server without landings, which of its two letters it is. */
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

/** The value already held when the new one is the same, so a look that has not changed is the same look. */
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
