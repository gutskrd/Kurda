import { useEffect, useState } from 'react';
import { checkLetterDecor, DEFAULT_PAPER, type LetterPaper, type PaperNote, type PaperStroke } from '@kurda/shared';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';

/**
 * Letter drafts on the phone, kept the same way as web/src/letters/drafts.ts. The screen a letter is written on can
 * change under it (a bird flies on, a pen pal leaves, the app closes), so the paper is saved as it is written, one
 * draft per place: your new bird (`new`), an answer to a visitor (`visitor:<letter id>`), or a correspondence
 * (`thread:<id>`). A draft is dropped once its letter is sent.
 *
 * Drafts stay on this phone for the account that wrote them: other accounts' drafts are dropped on read, nothing
 * older than a month is kept, and sign-out clears them (widget/LetterWidgetSync.tsx). Storage answers later than
 * the first render, so drafts are read into memory once (`useLetterDrafts`); if the store refuses, drafts last
 * only while the app is open.
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

interface Drawer {
  who: string;
  drafts: Record<string, Kept>;
}

export const DRAFTS_KEY = 'hevalo_letter_drafts_v1';
/** Drafts untouched this long are dropped. */
const KEEP_MS = 30 * 86_400_000;
/** More places to write from than anyone has open at once. */
const KEEP_MAX = 12;
/** Typing is kept in memory at once and written to storage this long after it stops. */
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

/** Reads `who`'s drafts into memory, once; other accounts' drafts found there are dropped. */
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
      // An unreadable store counts as empty.
    }
    drawer = { who, drafts: fresh(found?.drafts ?? {}) };
    reading = null;
  });
  reading = { who, done };
  return done;
}

/** Whether `who`'s drafts have been read, so a paper opened now starts from its draft; reads them if not. */
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
  // Drafts not read yet (slow storage): keep what is written from here on, over anything older.
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
 * The draft for `place`, validated as the composer will use it: an unknown paper falls back to the default, and
 * invalid drawings or notes are dropped rather than breaking the paper.
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

/** Whether a draft holds words, a drawing or a note; a chosen paper alone does not count. */
function draftHasWork(d: LetterDraft): boolean {
  return d.body.trim().length > 0 || d.strokes.length > 0 || d.notes.some((n) => n.text.trim().length > 0);
}

/** Saves the paper for `place`, or drops it (`null`, or nothing written). */
export function keepDraft(who: string | null, place: string, draft: LetterDraft | null): void {
  if (!who) return;
  const d = drawerFor(who);
  if (draft && draftHasWork(draft)) d.drafts[place] = { ...draft, at: Date.now() };
  else if (place in d.drafts) delete d.drafts[place];
  else return;
  writeSoon();
}

/**
 * Moves the draft from `from` to `to`, e.g. when a visitor's bird has flown and the answer becomes a new letter.
 * With `strokes: false` (a first letter to someone new) the drawing stays behind. Returns whether there was a draft.
 */
export function moveDraft(who: string | null, from: string, to: string, opts: { strokes: boolean }): boolean {
  const moved = draftOf(who, from);
  if (!who || !moved || !draftHasWork(moved)) return false;
  const d = drawerFor(who);
  delete d.drafts[from];
  // A draft already at the destination keeps its paper, and the moved words go under it.
  const there = draftOf(who, to);
  if (there && draftHasWork(there)) d.drafts[to] = { ...there, body: [there.body.trim(), moved.body.trim()].filter(Boolean).join('\n\n'), at: Date.now() };
  else d.drafts[to] = { ...moved, strokes: opts.strokes ? moved.strokes : [], at: Date.now() };
  writeSoon();
  return true;
}

/** Answers kept for birds no longer at the window; `here` is the current visitor's letter, whose answer is not stray. */
export function strayAnswers(who: string | null, here: string | null): string[] {
  if (!who || drawer?.who !== who) return [];
  const mine = here ? visitorDraft(here) : null;
  return Object.keys(drawer.drafts).filter((place) => place.startsWith('visitor:') && place !== mine);
}

/** Drops every draft at sign-out, so the next account on this phone finds nothing. */
export function forgetLetterDrafts(): Promise<void> {
  if (writeTimer !== null) clearTimeout(writeTimer);
  writeTimer = null;
  drawer = null;
  reading = null;
  return store.remove(DRAFTS_KEY);
}

/** For tests: swaps the drafts store and clears what was read; returns a function that restores the store. */
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
