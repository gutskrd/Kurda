import { checkLetterDecor, DEFAULT_PAPER, type LetterPaper, type PaperNote, type PaperStroke } from '@kurda/shared';

/**
 * Letters that are never lost while they are being written.
 *
 * A letter takes a while to write, in a language still being learned, and
 * the page it is written on can change under it: a bird that was waiting on
 * the sill flies on by itself, a pen pal says goodbye, two birds cross, the
 * tab is closed by mistake. So whatever is on the paper is kept as it is
 * written, one draft for each place a letter is written from: your own new
 * bird (`new`), an answer to the bird at your window (`visitor:<letter id>`),
 * and a correspondence (`thread:<id>`). The paper opens on it again, and it
 * is let go once that letter has been sent.
 *
 * Drafts are kept in this browser only, for the account that wrote them: a
 * draft of anybody else is dropped before one is read, nothing older than a
 * month is kept, and signing out lets them all go (auth/AuthProvider.tsx).
 * Storage a browser refuses (private windows, a full disk) only means the
 * draft lasts as long as the page.
 */

/** What is on the paper of a letter not yet sent. */
export interface LetterDraft {
  body: string;
  paper: LetterPaper;
  strokes: PaperStroke[];
  notes: PaperNote[];
}

interface Kept extends LetterDraft {
  at: number;
}

interface Store {
  who: string;
  drafts: Record<string, Kept>;
}

const KEY = 'hevalo_letter_drafts';
/** A draft untouched this long is let go: a letter half written a month ago is not the one being written now. */
const KEEP_MS = 30 * 86_400_000;
/** More places to write from than anybody has open at once: five pen pals, a visitor and a bird of your own. */
const KEEP_MAX = 12;

/** The draft for your own new bird. */
export const NEW_LETTER = 'new';
/** The draft of an answer to the bird at your window, by the letter it brought. */
export const visitorDraft = (letterId: string): string => `visitor:${letterId}`;
/** The draft of a letter back in a correspondence. */
export const threadDraft = (threadId: string): string => `thread:${threadId}`;

function read(who: string): Store {
  try {
    const raw = localStorage.getItem(KEY);
    const store = raw ? (JSON.parse(raw) as Store) : null;
    // somebody else's drafts are never handed over: another account on this browser starts with none
    if (store && store.who === who && store.drafts && typeof store.drafts === 'object') return store;
  } catch {
    // unreadable storage is an empty drawer
  }
  return { who, drafts: {} };
}

function write(store: Store): void {
  try {
    const now = Date.now();
    const kept = Object.entries(store.drafts)
      .filter(([, d]) => now - d.at < KEEP_MS)
      .sort(([, a], [, b]) => b.at - a.at)
      .slice(0, KEEP_MAX);
    if (kept.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ who: store.who, drafts: Object.fromEntries(kept) }));
  } catch {
    // a browser that keeps nothing keeps the draft only as long as the page
  }
}

/**
 * The draft kept for `place`, checked as the composer will use it: a paper it
 * does not know falls back to the default one, and a drawing or a note that
 * is not one any more is left out rather than breaking the paper.
 */
export function draftOf(who: string | null, place: string): LetterDraft | null {
  if (!who) return null;
  const d = read(who).drafts[place];
  if (!d || typeof d.body !== 'string' || Date.now() - d.at >= KEEP_MS) return null;
  const paperCheck = checkLetterDecor({ paper: d.paper }, { strokes: false });
  const paper = paperCheck.ok ? paperCheck.value.paper : DEFAULT_PAPER;
  const strokeCheck = checkLetterDecor({ paper, strokes: Array.isArray(d.strokes) ? d.strokes : [] }, { strokes: true });
  const notes = (Array.isArray(d.notes) ? d.notes : []).filter((n) => checkLetterDecor({ paper, notes: [n] }, { strokes: false }).ok);
  return { body: d.body, paper, strokes: strokeCheck.ok ? strokeCheck.value.strokes : [], notes };
}

/** Whether a draft holds anything worth keeping: words, a line drawn or a note (a paper chosen alone is not a letter). */
export function draftHasWork(d: LetterDraft): boolean {
  return d.body.trim().length > 0 || d.strokes.length > 0 || d.notes.some((n) => n.text.trim().length > 0);
}

/** Keeps what is on the paper for `place`, or lets it go (`null`, or nothing written). */
export function keepDraft(who: string | null, place: string, draft: LetterDraft | null): void {
  if (!who) return;
  const store = read(who);
  if (draft && draftHasWork(draft)) store.drafts[place] = { ...draft, at: Date.now() };
  else if (place in store.drafts) delete store.drafts[place];
  else return;
  write(store);
}

/**
 * Moves the draft for `from` to `to`: an answer whose bird has flown becomes
 * a letter for your own bird, or for a correspondence with that person. A
 * first letter to somebody new carries no drawing (`strokes: false`), so a
 * drawing does not go with it. Says whether there was a draft to move.
 */
export function moveDraft(who: string | null, from: string, to: string, opts: { strokes: boolean }): boolean {
  const d = draftOf(who, from);
  if (!who || !d || !draftHasWork(d)) return false;
  const store = read(who);
  delete store.drafts[from];
  // what is already being written there stays as it is, on its own paper, and the moved words go under it
  const there = draftOf(who, to);
  if (there && draftHasWork(there)) store.drafts[to] = { ...there, body: [there.body.trim(), d.body.trim()].filter(Boolean).join('\n\n'), at: Date.now() };
  else store.drafts[to] = { ...d, strokes: opts.strokes ? d.strokes : [], at: Date.now() };
  write(store);
  return true;
}

/**
 * The answers kept for birds no longer at the window: begun, and left when
 * the page was closed, while the bird's day ran out. `here` is the letter of
 * the bird at the window now, whose answer is not stray.
 */
export function strayAnswers(who: string | null, here: string | null): string[] {
  if (!who) return [];
  const mine = here ? visitorDraft(here) : null;
  return Object.keys(read(who).drafts).filter((place) => place.startsWith('visitor:') && place !== mine);
}

/** Every draft let go: at sign-out, so nobody at this browser next finds what was being written. */
export function forgetDrafts(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing could be kept, so nothing is left behind
  }
}
