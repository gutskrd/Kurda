import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PAPER, type PaperStroke } from '@kurda/shared';
import { NEW_LETTER, draftOf, forgetDrafts, keepDraft, moveDraft, strayAnswers, threadDraft, visitorDraft } from './drafts';

afterEach(() => localStorage.clear());

const stroke: PaperStroke = { tool: 'pen', color: 'navy', width: 6, points: [100, 200, 140, 230] };
const draft = (body: string, over = {}) => ({ body, paper: DEFAULT_PAPER, strokes: [], notes: [], ...over });

describe('letter drafts', () => {
  it('keeps what is on the paper for each place a letter is written from, for its writer alone', () => {
    keepDraft('ada', NEW_LETTER, draft('Silav!'));
    keepDraft('ada', threadDraft('t1'), draft('Spas, Baran.'));
    expect(draftOf('ada', NEW_LETTER)?.body).toBe('Silav!');
    expect(draftOf('ada', threadDraft('t1'))?.body).toBe('Spas, Baran.');
    expect(draftOf('rojda', NEW_LETTER)).toBeNull();
    expect(draftOf(null, NEW_LETTER)).toBeNull();
  });

  it('lets a draft go when nothing is written on it, or when it is sent', () => {
    keepDraft('ada', NEW_LETTER, draft('Silav!'));
    keepDraft('ada', NEW_LETTER, draft('   '));
    expect(draftOf('ada', NEW_LETTER)).toBeNull();
    keepDraft('ada', NEW_LETTER, draft('Silav!'));
    keepDraft('ada', NEW_LETTER, null);
    expect(localStorage.getItem('hevalo_letter_drafts')).toBeNull();
  });

  it('moves an answer whose bird flew on to your own bird, leaving its drawing behind', () => {
    keepDraft('ada', visitorDraft('l1'), draft('Silav Baran!', { strokes: [stroke] }));
    expect(moveDraft('ada', visitorDraft('l1'), NEW_LETTER, { strokes: false })).toBe(true);
    expect(draftOf('ada', visitorDraft('l1'))).toBeNull();
    expect(draftOf('ada', NEW_LETTER)).toMatchObject({ body: 'Silav Baran!', strokes: [] });
    // nothing to move is said so
    expect(moveDraft('ada', visitorDraft('l2'), NEW_LETTER, { strokes: false })).toBe(false);
  });

  it('finds the answers kept for birds no longer at the window, and not the one there now', () => {
    keepDraft('ada', visitorDraft('l1'), draft('Silav Baran!'));
    keepDraft('ada', visitorDraft('l2'), draft('Silav Rojîn!'));
    keepDraft('ada', threadDraft('t1'), draft('Ez baş im.'));
    expect(strayAnswers('ada', 'l2')).toEqual([visitorDraft('l1')]);
    expect(strayAnswers('ada', null).sort()).toEqual([visitorDraft('l1'), visitorDraft('l2')]);
    expect(strayAnswers('rojda', null)).toEqual([]);
  });

  it('puts a moved answer under what is already being written there', () => {
    keepDraft('ada', threadDraft('t1'), draft('Ez baş im.'));
    keepDraft('ada', visitorDraft('l1'), draft('Tu çawa yî?', { strokes: [stroke] }));
    moveDraft('ada', visitorDraft('l1'), threadDraft('t1'), { strokes: true });
    expect(draftOf('ada', threadDraft('t1'))?.body).toBe('Ez baş im.\n\nTu çawa yî?');
  });

  it('reads a damaged draft as far as it can, and forgets them all at sign-out', () => {
    localStorage.setItem(
      'hevalo_letter_drafts',
      JSON.stringify({ who: 'ada', drafts: { new: { body: 'Silav', paper: { style: 'zigzag' }, strokes: [{ tool: 'laser' }], notes: [{ text: 5 }], at: Date.now() } } }),
    );
    expect(draftOf('ada', NEW_LETTER)).toEqual({ body: 'Silav', paper: DEFAULT_PAPER, strokes: [], notes: [] });
    forgetDrafts();
    expect(draftOf('ada', NEW_LETTER)).toBeNull();
  });

  it('lets a draft untouched for a month go', () => {
    localStorage.setItem('hevalo_letter_drafts', JSON.stringify({ who: 'ada', drafts: { new: { ...draft('Kevn'), at: Date.now() - 31 * 86_400_000 } } }));
    expect(draftOf('ada', NEW_LETTER)).toBeNull();
  });
});
