import { describe, expect, it } from 'vitest';
import { KEYBOARD_GUIDES } from '@kurda/shared';
import { guidePlatform, guideSteps, lettersTyped, stepParts, tryLetters } from './guide';

describe('guidePlatform', () => {
  it('takes the phone from Platform.OS', () => {
    expect(guidePlatform('ios')).toBe('ios');
    expect(guidePlatform('android')).toBe('android');
  });

  it('reads the user agent on the web build', () => {
    expect(guidePlatform('web', 'Mozilla/5.0 (Linux; Android 14)')).toBe('android');
    expect(guidePlatform('web', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(guidePlatform('web', 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)')).toBeNull();
  });
});

describe('guideSteps', () => {
  it('shows only one device’s two to four steps, for the variety', () => {
    for (const platform of ['ios', 'android'] as const) {
      for (const dialect of ['kurmanci', 'sorani'] as const) {
        const steps = guideSteps(platform, dialect);
        expect(steps.length).toBeGreaterThanOrEqual(2);
        expect(steps.length).toBeLessThanOrEqual(4);
        expect(steps).toBe(KEYBOARD_GUIDES[platform][dialect]);
      }
    }
  });
});

describe('stepParts', () => {
  it('puts the device’s own names where the sentence says, marked to stand out', () => {
    const step = { key: 'x', en: 'Go to {0} → {1}.', ui: ['Languages', 'Add keyboard'] };
    expect(stepParts(step, 'Gehe zu {0} → {1}.')).toEqual([
      { text: 'Gehe zu ', ui: false },
      { text: 'Languages', ui: true },
      { text: ' → ', ui: false },
      { text: 'Add keyboard', ui: true },
      { text: '.', ui: false },
    ]);
  });

  it('keeps a sentence with no names whole, and a placeholder with no name as written', () => {
    expect(stepParts({ key: 'x', en: 'Tap 🌐.' }, 'Tap 🌐.')).toEqual([{ text: 'Tap 🌐.', ui: false }]);
    expect(stepParts({ key: 'x', en: '{3}' }, '{3}')).toEqual([{ text: '{3}', ui: false }]);
  });
});

describe('the try-it box', () => {
  it('asks for ç ê î ş û in Kurmancî', () => {
    expect([...tryLetters('kurmanci')]).toEqual(['ç', 'ê', 'î', 'ş', 'û']);
  });

  it('lights each letter once it is anywhere in the box, in either case and either encoding', () => {
    expect([...lettersTyped('kurmanci', 'Çê')].sort()).toEqual(['ç', 'ê']);
    // e + combining circumflex is ê
    expect(lettersTyped('kurmanci', 'ê').has('ê')).toBe(true);
    expect(lettersTyped('kurmanci', 'çêîşû').size).toBe(5);
  });

  it('asks a Soranî writer for five of the Soranî letters', () => {
    expect(tryLetters('sorani')).toHaveLength(5);
    expect(lettersTyped('sorani', 'ڕڵ').size).toBe(2);
  });
});
