import { describe, expect, it } from 'vitest';
import { KEYBOARD_GUIDES, KEYBOARD_PLATFORMS } from '@kurda/shared';
import { en } from '../i18n/en';
import { GUIDE_STEP_KEYS, lettersTyped, stepParts, tryLetters } from './guide';

describe('the keyboard guides', () => {
  it('have a sentence in the catalogues for every step, the same as the shared English', () => {
    for (const platform of KEYBOARD_PLATFORMS) {
      for (const dialect of ['kurmanci', 'sorani'] as const) {
        for (const step of KEYBOARD_GUIDES[platform][dialect]) {
          const key = GUIDE_STEP_KEYS[step.key];
          expect(key, `${platform}/${dialect}: ${step.key}`).toBe(step.key);
          expect(en[key!]).toBe(step.en);
        }
      }
    }
  });

  it('set the device’s own names apart, and leave the rest of the sentence as it is', () => {
    const step = { key: 'x', en: 'Open {0} → {1}.', ui: ['Settings', 'Keyboard'] };
    expect(stepParts(step, 'Veke {0} → {1}.')).toEqual([
      { text: 'Veke ', ui: false },
      { text: 'Settings', ui: true },
      { text: ' → ', ui: false },
      { text: 'Keyboard', ui: true },
      { text: '.', ui: false },
    ]);
    // a placeholder with no name stays as it was rather than vanishing
    expect(stepParts({ key: 'x', en: '{3}' }, '{3}')).toEqual([{ text: '{3}', ui: false }]);
  });

  it('count each letter once it is anywhere in the try-it box, however it was typed', () => {
    expect(tryLetters('kurmanci')).toEqual(['ç', 'ê', 'î', 'ş', 'û']);
    expect(lettersTyped('kurmanci', 'Ç ê')).toEqual(new Set(['ç', 'ê']));
    expect(lettersTyped('kurmanci', 'çêîşû').size).toBe(5);
    expect(tryLetters('sorani')).toHaveLength(5);
    expect(lettersTyped('sorani', 'ڕ ڵ').size).toBe(2);
  });
});
