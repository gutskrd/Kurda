import { describe, expect, it } from 'vitest';
import { LOCALES, TRANSLATIONS } from '../i18n/translations';
import { CARD_LABEL_KEY, DIMEN_KINDS, GOTIN_KINDS, SECTIONS, kindWithin } from './types';

describe('the wall’s sections and kinds', () => {
  it('keeps a kind only inside its own half', () => {
    expect(kindWithin('gotin', 'helbest')).toBe('helbest');
    expect(kindWithin('dimen', 'mim')).toBe('mim');
    // switching half with the other half's kind still selected would ask the
    // server for a contradiction, so it is dropped rather than sent
    expect(kindWithin('dimen', 'helbest')).toBeNull();
    expect(kindWithin('gotin', 'wene')).toBeNull();
    // "everything" narrows to nothing, and neither does a missing kind
    expect(kindWithin('all', 'helbest')).toBeNull();
    expect(kindWithin('gotin', null)).toBeNull();
    expect(kindWithin('gotin', 'all')).toBeNull();
  });

  it('gives every section and kind a label the catalogues actually hold', () => {
    const keys = [
      ...SECTIONS.map((s) => s.labelKey),
      ...GOTIN_KINDS.map((k) => k.labelKey),
      ...DIMEN_KINDS.map((k) => k.labelKey),
      ...Object.values(CARD_LABEL_KEY),
    ];
    for (const locale of LOCALES) {
      for (const key of keys) {
        expect(TRANSLATIONS[locale][key], `${locale} ${key}`).toBeTruthy();
      }
    }
  });

  /**
   * The badge falls back to the raw kind rather than an empty chip, so a kind
   * the server ships before the app knows its name still shows something. That
   * only works while this map stays open — a `Record<Kind, …>` would make an
   * unfamiliar kind a type error instead of a graceful degrade.
   */
  it('knows the five kinds the server sends today', () => {
    expect(Object.keys(CARD_LABEL_KEY).sort()).toEqual(['gotin', 'image', 'meme', 'poem', 'story']);
    expect(CARD_LABEL_KEY['something-new']).toBeUndefined();
  });
});
