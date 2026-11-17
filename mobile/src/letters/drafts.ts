import { useEffect, useState } from 'react';
import { checkLetterDecor, DEFAULT_PAPER, type LetterPaper, type PaperNote, type PaperStroke } from '@kurda/shared';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';

/**
 * Letters that are never lost while they are being written, on the phone (the
 * website's web/src/letters/drafts.ts, kept the same way).
 *
 * A letter takes a while to write, in a language still being learned, and
 * the screen it is written on can change under it: a bird that was waiting on
 * the sill flies on by itself, a pen pal says goodbye, two birds cross, the
 * app is closed or the phone runs out of battery. So whatever is on the paper
 * is kept as it is written, one draft for each place a letter is written
 * from: your own new bird (`new`), an answer to the bird at your window
 * (`visitor:<letter id>`), and a correspondence (`thread:<id>`). The paper
 * opens on it again, and it is let go once that letter has been sent.
 *
 * Drafts are kept on this phone only, for the account that wrote them: a
 * draft of anybody else is dropped before one is read, nothing older than a
 * month is kept, and signing out lets them all go (widget/LetterWidgetSync.tsx
 * hears every sign-out). The phone's storage answers later than a screen is
 * drawn, so the drafts are read into memory once (`useLetterDrafts`) and the
 * paper opens on them from there; a store that refuses only means the draft
 * lasts as long as the app is open.
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

interface Drawer {
  who: string;
  drafts: Record<string, Kept>;
}

export const DRAFTS_KEY = 'hevalo_letter_drafts_v1';
/** A draft untouched this long is let go: a letter half written a month ago is not the one being written now. */
const KEEP_MS = 30 * 86_400_000;
/** More places to write from than anybody has open at once: five pen pals, a visitor and a bird of your own. */
const KEEP_MAX = 12;
/** Typing is kept in memory at once and written to the phone a moment after it stops, not on every letter typed. */
const WRITE_AFTER_MS = 400;

/** The draft for your own new bird. */
export const NEW_LETTER = 'new';
/** The draft of an answer to the bird at your window, by the letter it brought. */
export const visitorDraft = (letterId: string): string => `visitor:${letterId}`;
/** The draft of a letter back in a correspondence. */
export const threadDraft = (threadId: string): string => `thread:${threadId}`;

let store: DeviceStore = deviceStore;
/** The drafts of the account signed in, once read from the phone. */
let drawer: Drawer | null = null;
let reading: { who: string; done: Promise<void> } | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function fresh(drafts: Record<string, Kept>): Record<string, Kept> {
  const now = Date.now();
  const kept = Object.entries(drafts)
    .filter(([, d]) => d && typeof d.at === 'number' && now - d.at < KEEP_MS)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, KEEP_MAX);
  return Object.fromEntries(kept);
}

/** Reads `who`'s drafts from the phone into memory, once; anybody else's found there are not handed over. */
export function loadLetterDrafts(who: string): Promise<void> {
  if (drawer?.who === who) return Promise.resolve();
  if (reading?.who === who) return reading.done;
  const done = store.get(DRAFTS_KEY).then((raw) => {
    if (reading?.who !== who) return;
    let found: Drawer | null = null;
    try {
      const parsed = raw ? (JSON.parse(raw) as Drawer) : null;
      if (parsed && parsed.who === who && parsed.drafts && typeof parsed.drafts === 'object') found = parsed;
    } catch {
      // an unreadable drawer is an empty one
    }
    drawer = { who, drafts: fresh(found?.drafts ?? {}) };
    reading = null;
  });
  reading = { who, done };
  return done;
}

/** Whether `who`'s drafts have been read, so a paper opened now opens on its draft; reads them if not. */
export function useLetterDrafts(who: string | null): boolean {
  const [ready, setReady] = useState(() => who === null || drawer?.who === who);
  useEffect(() => {
    if (who === null || drawer?.who === who) {
      setReady(true);
      return;
    }
    let live = true;
    setReady(false);
    void loadLetterDrafts(who).then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [who]);
  return ready;
}

function drawerFor(who: string): Drawer {
  // drafts not read yet (the storage was slow): what is written now is kept from here on, over anything older there
  if (drawer?.who !== who) drawer = { who, drafts: {} };
  return drawer;
}

function writeSoon(): void {
  if (writeTimer !== null) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const d = drawer;
    if (!d) return;
    const drafts = fresh(d.drafts);
    void (Object.keys(drafts).length === 0 ? store.remove(DRAFTS_KEY) : store.set(DRAFTS_KEY, JSON.stringify({ who: d.who, drafts })));
  }, WRITE_AFTER_MS);
}

/**
 * The draft kept for `place`, checked as the composer will use it: a paper it
 * does not know falls back to the default one, and a drawing or a note that
 * is not one any more is left out rather than breaking the paper.
 */
export function draftOf(who: string | null, place: string): LetterDraft | null {
  if (!who || drawer?.who !== who) return null;
  const d = drawer.drafts[place];
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
  const d = drawerFor(who);
  if (draft && draftHasWork(draft)) d.drafts[place] = { ...draft, at: Date.now() };
  else if (place in d.drafts) delete d.drafts[place];
  else return;
  writeSoon();
}

/**
 * Moves the draft for `from` to `to`: an answer whose bird has flown becomes
 * a letter for your own bird, or for a correspondence with that person. A
 * first letter to somebody new carries no drawing (`strokes: false`), so a
 * drawing does not go with it. Says whether there was a draft to move.
 */
export function moveDraft(who: string | null, from: string, to: string, opts: { strokes: boolean }): boolean {
  const moved = draftOf(who, from);
  if (!who || !moved || !draftHasWork(moved)) return false;
  const d = drawerFor(who);
  delete d.drafts[from];
  // what is already being written there stays as it is, on its own paper, and the moved words go under it
  const there = draftOf(who, to);
  if (there && draftHasWork(there)) d.drafts[to] = { ...there, body: [there.body.trim(), moved.body.trim()].filter(Boolean).join('\n\n'), at: Date.now() };
  else d.drafts[to] = { ...moved, strokes: opts.strokes ? moved.strokes : [], at: Date.now() };
  writeSoon();
  return true;
}

/**
 * The answers kept for birds no longer at the window: begun, and left when
 * the app was closed, while the bird's day ran out. `here` is the letter of
 * the bird at the window now, whose answer is not stray.
 */
export function strayAnswers(who: string | null, here: string | null): string[] {
  if (!who || drawer?.who !== who) return [];
  const mine = here ? visitorDraft(here) : null;
  return Object.keys(drawer.drafts).filter((place) => place.startsWith('visitor:') && place !== mine);
}

/** Every draft let go: at sign-out, so nobody who signs in on this phone next finds what was being written. */
export function forgetLetterDrafts(): Promise<void> {
  if (writeTimer !== null) clearTimeout(writeTimer);
  writeTimer = null;
  drawer = null;
  reading = null;
  return store.remove(DRAFTS_KEY);
}

/** For tests: the store drafts are kept in, and a phone with nothing read yet; returns a function that puts the store back. */
export function setDraftStoreForTests(next: DeviceStore): () => void {
  const before = store;
  store = next;
  drawer = null;
  reading = null;
  return () => {
    store = before;
    drawer = null;
    reading = null;
  };
}
