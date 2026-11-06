import { describe, expect, it } from 'vitest';
import { checkGameContent, type CaseFileContent } from '../content.js';
import { answerXp } from '../solo.js';
import { DETECTIVE_HINTS, DETECTIVE_HINT_XP, accusationEvidence, caseItems, caseXp, suspectPortrait, unusedEvidence, untranslated } from './rules.js';

const en = (text: string) => ({ en: text });

// a small case made of the course's own lines
const file = {
  title: en('The empty jar'),
  intro: en('A jar of honey is empty in the morning.'),
  suspects: [
    { id: 'hamo', name: 'Hamo', about: en('The uncle.') },
    { id: 'hevalo', name: 'Hevalo', about: en('The deer.') },
    { id: 'baran', name: 'Baran', about: en('A cousin.'), portrait: undefined },
  ],
  evidence: [
    { id: 'advice', kind: 'note', ku: 'Û şîreta sêyem: bi şev hingiv qedexe ye!', meanings: en('Honey at night is forbidden!') },
    { id: 'apples', kind: 'statement', ku: 'Ez bêguneh im! Ez tenê ji sêvan hez dikim.', meanings: en('I only like apples.'), from: 'hevalo' },
    { id: 'away', kind: 'statement', ku: 'Na, Baran îro ne li malê ye.', meanings: en('Baran is not at home today.'), from: 'hamo' },
    { id: 'spare', kind: 'message', ku: 'Spas, xalo.', meanings: en('Thanks, uncle.') },
  ],
  steps: [
    { prompt: en('What is forbidden?'), options: [en('Honey at night'), en('Apples')], correctIndex: 0, evidence: ['advice'] },
    { prompt: en('Who was away?'), options: [en('Hevalo'), en('Baran')], correctIndex: 1, evidence: ['away', 'advice'] },
  ],
  culprit: 'hamo',
  solution: en('Hamo ate the honey.'),
};

describe('a case file', () => {
  it('is stored when its suspects, evidence and steps point at each other', () => {
    expect(checkGameContent('case_file', 'kmr', file).ok).toBe(true);
    const lost = checkGameContent('case_file', 'kmr', { ...file, culprit: 'nobody' });
    expect(lost.ok).toBe(false);
    const portrait = checkGameContent('case_file', 'kmr', { ...file, suspects: [{ ...file.suspects[0], portrait: 'someone' }, file.suspects[1]] });
    expect(portrait.ok).toBe(false);
  });
});

describe('the items of a case', () => {
  const c = checkGameContent('case_file', 'kmr', file);
  if (!c.ok) throw new Error('the case should be valid');
  const kase: CaseFileContent = c.payload;

  it('are its deduction steps, then the accusation', () => {
    expect(caseItems(kase)).toEqual([{ kind: 'step', step: 0 }, { kind: 'step', step: 1 }, { kind: 'accuse' }]);
  });

  it('rest the accusation on every step’s evidence once, and find the card no step uses', () => {
    expect(accusationEvidence(kase)).toEqual(['advice', 'away']);
    expect(unusedEvidence(kase)).toEqual(['apples', 'spare']);
    expect(untranslated(kase, new Set(['advice']))).toEqual(['apples', 'away', 'spare']);
  });

  it('draws a suspect as the character the case names, or the one with its id, or no one', () => {
    expect(suspectPortrait({ id: 'baran' })).toBeNull();
    expect(suspectPortrait({ id: 'hamo' })).toBe('hamo');
    expect(suspectPortrait({ id: 'uncle', portrait: 'hamo' })).toBe('hamo');
  });
});

describe('what a case pays', () => {
  it('is every correct deduction, less a hint’s cost each, never below nothing', () => {
    const earned = answerXp(2, { correct: true, firstTry: true, repeat: false }) * 3;
    expect(caseXp(earned, 0)).toBe(earned);
    expect(caseXp(earned, 2)).toBe(earned - 2 * DETECTIVE_HINT_XP);
    expect(caseXp(1, DETECTIVE_HINTS)).toBe(0);
    expect(caseXp(5, -1)).toBe(5);
  });
});
