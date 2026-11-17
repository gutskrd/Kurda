import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
import { DEFAULT_PAPER, type PaperStroke } from '@kurda/shared';
import { memoryStore } from '../keyboard/deviceStore';
import { DRAFTS_KEY, NEW_LETTER, draftOf, forgetLetterDrafts, keepDraft, loadLetterDrafts, moveDraft, setDraftStoreForTests, strayAnswers, threadDraft, visitorDraft } from './drafts';

const T = '6f9b1c2e-1d2a-4b3c-8d4e-5f6a7b8c9d0e';
const words = (body: string) => ({ body, paper: DEFAULT_PAPER, strokes: [], notes: [] });
const line: PaperStroke = { tool: 'pen', color: 'navy', width: 6, points: [100, 200, 140, 230] };

let store = memoryStore();
let putBack: () => void = () => undefined;
beforeEach(() => {
  vi.useFakeTimers();
  store = memoryStore();
  putBack = setDraftStoreForTests(store);
});
afterEach(() => {
  putBack();
  vi.useRealTimers();
});

/** Simulates an app restart: memory is cleared and storage is read afresh. */
async function reopen(who: string): Promise<void> {
  vi.advanceTimersByTime(1000);
  setDraftStoreForTests(store);
  await loadLetterDrafts(who);
}

describe('letters being written, kept on the phone', () => {
  it('keeps what is on the paper through the app being closed, for the account that wrote it', async () => {
    await loadLetterDrafts('me');
    keepDraft('me', NEW_LETTER, words('Silav hevalo'));
    keepDraft('me', threadDraft(T), words('Spas Baran!'));
    await reopen('me');
    expect(draftOf('me', NEW_LETTER)?.body).toBe('Silav hevalo');
    expect(draftOf('me', threadDraft(T))?.body).toBe('Spas Baran!');
  });

  it('hands nobody else’s drafts over, on the same phone', async () => {
    await loadLetterDrafts('me');
    keepDraft('me', NEW_LETTER, words('Silav hevalo'));
    await reopen('someone-else');
    expect(draftOf('someone-else', NEW_LETTER)).toBeNull();
    expect(draftOf('me', NEW_LETTER)).toBeNull();
  });

  it('lets a draft go once its letter is sent, and keeps nothing for a paper with nothing on it', async () => {
    await loadLetterDrafts('me');
    keepDraft('me', NEW_LETTER, words('Silav hevalo'));
    keepDraft('me', NEW_LETTER, null);
    keepDraft('me', threadDraft(T), words('   '));
    await reopen('me');
    expect(draftOf('me', NEW_LETTER)).toBeNull();
    expect(draftOf('me', threadDraft(T))).toBeNull();
    expect(store.data.has(DRAFTS_KEY)).toBe(false);
  });

  it('moves an answer whose bird flew on to your own bird without its drawing, and to a pen pal with it', async () => {
    await loadLetterDrafts('me');
    keepDraft('me', visitorDraft('l9'), { ...words('Silav Baran'), strokes: [line] });
    expect(moveDraft('me', visitorDraft('l9'), NEW_LETTER, { strokes: false })).toBe(true);
    expect(draftOf('me', visitorDraft('l9'))).toBeNull();
    expect(draftOf('me', NEW_LETTER)).toMatchObject({ body: 'Silav Baran', strokes: [] });
    keepDraft('me', visitorDraft('l10'), { ...words('Silav Azad'), strokes: [line] });
    expect(moveDraft('me', visitorDraft('l10'), threadDraft(T), { strokes: true })).toBe(true);
    expect(draftOf('me', threadDraft(T))?.strokes).toHaveLength(1);
    // Nothing written there, so nothing to move.
    expect(moveDraft('me', visitorDraft('l11'), NEW_LETTER, { strokes: false })).toBe(false);
  });

  it('finds the answers kept for birds no longer at the window, and not the one there now', async () => {
    await loadLetterDrafts('me');
    keepDraft('me', visitorDraft('l9'), words('Silav Baran'));
    keepDraft('me', visitorDraft('l10'), words('Silav Azad'));
    keepDraft('me', threadDraft(T), words('Ez baş im.'));
    expect(strayAnswers('me', 'l10')).toEqual([visitorDraft('l9')]);
    expect(strayAnswers('me', null).sort()).toEqual([visitorDraft('l10'), visitorDraft('l9')]);
    expect(strayAnswers('somebody', null)).toEqual([]);
  });

  it('puts a moved answer under a letter already being written there, rather than over it', async () => {
    await loadLetterDrafts('me');
    keepDraft('me', NEW_LETTER, words('Silav!'));
    keepDraft('me', visitorDraft('l9'), words('Ez Rojda me.'));
    moveDraft('me', visitorDraft('l9'), NEW_LETTER, { strokes: false });
    expect(draftOf('me', NEW_LETTER)?.body).toBe('Silav!\n\nEz Rojda me.');
  });

  it('lets a month-old draft go', async () => {
    await loadLetterDrafts('me');
    keepDraft('me', NEW_LETTER, words('Silav hevalo'));
    vi.setSystemTime(Date.now() + 31 * 86_400_000);
    expect(draftOf('me', NEW_LETTER)).toBeNull();
  });

  it('forgets every draft at sign-out, on the phone too', async () => {
    await loadLetterDrafts('me');
    keepDraft('me', NEW_LETTER, words('Silav hevalo'));
    vi.advanceTimersByTime(1000);
    expect(store.data.has(DRAFTS_KEY)).toBe(true);
    await forgetLetterDrafts();
    expect(store.data.has(DRAFTS_KEY)).toBe(false);
    expect(draftOf('me', NEW_LETTER)).toBeNull();
  });
});
