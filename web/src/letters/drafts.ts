import { checkLetterDecor, DEFAULT_PAPER, type LetterPaper, type PaperNote, type PaperStroke } from '@kurda/shared';

/**
 * Letter drafts, kept as they are written since the page can change underneath (a bird leaves, a pen pal says
 * goodbye, the tab closes). One draft per place: a new letter (`new`), an answer to the visiting bird
 * (`visitor:<letter id>`) or a correspondence (`thread:<id>`), cleared once sent. Kept in this browser for the writing
 * account only, for at most a month, and cleared on sign-out (auth/AuthProvider.tsx); without storage a draft lasts as
 * long as the page.
 */

/** What is on the paper of a letter not yet sent. */
interface LetterDraft {
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

/** The draft for `place`, validated: an unknown paper falls back to the default and invalid strokes or notes are dropped. */
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
function draftHasWork(d: LetterDraft): boolean {
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
 * Moves the draft from `from` to `to`, such as an answer whose bird has left; `strokes: false` drops the drawing, as
 * for a first letter. Returns whether there was a draft to move.
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

/** Answer drafts for birds no longer at the window; `here` is the current visitor's letter, whose answer is not stray. */
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
