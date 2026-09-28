import { describe, expect, it } from 'vitest';
import { EXPIRE_MS, SEND_EVERY_MS, typingLabel } from './typing';
import { LOCALES, TRANSLATIONS } from '../i18n/translations';

/** A translator that interpolates for real, so a dropped placeholder shows up. */
const translator = (loc: (typeof LOCALES)[number]) =>
  ((key, vars) => {
    const template = TRANSLATIONS[loc][key];
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
      vars && name in vars ? String(vars[name]) : whole,
    );
  }) as Parameters<typeof typingLabel>[1];

const t = translator('en');

describe('typingLabel', () => {
  it('says nothing when nobody is typing', () => {
    expect(typingLabel([], t)).toBe('');
  });

  it('names one person, two people, and counts the rest', () => {
    expect(typingLabel(['zana'], t)).toBe('zana is typing…');
    expect(typingLabel(['zana', 'rojîn'], t)).toBe('zana and rojîn are typing…');
    expect(typingLabel(['zana', 'rojîn', 'dilan'], t)).toBe('3 people are typing…');
    expect(typingLabel(['a', 'b', 'c', 'd'], t)).toBe('4 people are typing…');
  });

  /**
   * The reason there are three keys rather than one sentence built from parts.
   * Kurmancî agrees the verb with the count — `dinivîse` for one, `dinivîsin` for
   * more — and puts `û` between the names, so no amount of joining fragments in
   * code would produce the right sentence in every language.
   */
  it('lets each language choose its own shape', () => {
    const ku = translator('ku');
    expect(typingLabel(['zana'], ku)).toContain('dinivîse');
    expect(typingLabel(['zana', 'rojîn'], ku)).toBe('zana û rojîn dinivîsin…');
    expect(typingLabel(['a', 'b', 'c'], ku)).toContain('dinivîsin');
  });

  /*
   * Every shape in every language, with its placeholders filled. A translation
   * that dropped `{second}` would read "zana and are typing…", which no type can
   * catch and nobody would notice in English.
   */
  it('leaves no placeholder unfilled, in any language', () => {
    for (const loc of LOCALES) {
      const tr = translator(loc);
      for (const names of [['zana'], ['zana', 'rojîn'], ['a', 'b', 'c']]) {
        const out = typingLabel(names, tr);
        expect(out, `${loc} / ${names.length}`).not.toMatch(/[{}]/);
        expect(out.length, `${loc} / ${names.length}`).toBeGreaterThan(0);
      }
    }
  });

  it('mentions both names it was given, in every language', () => {
    for (const loc of LOCALES) {
      const out = typingLabel(['zana', 'rojîn'], translator(loc));
      expect(out, loc).toContain('zana');
      expect(out, loc).toContain('rojîn');
    }
  });
});

describe('the two intervals', () => {
  /*
   * A name has to outlive the gap between its owner's pings, or a steady typist
   * would flicker on and off.
   */
  it('expire later than the send interval', () => {
    expect(EXPIRE_MS).toBeGreaterThan(SEND_EVERY_MS);
  });
});
