import { describe, expect, it } from 'vitest';
import { filterText, normalize } from './filter.js';

describe('normalize', () => {
  it('folds diacritics, case, leetspeak and strips separators', () => {
    expect(normalize('F.U.C.K')).toBe('fuck');
    expect(normalize('sh1t')).toBe('shit');
    expect(normalize('ŞİT')).toBe('sit');
  });
});

describe('filterText', () => {
  it('leaves clean text untouched', () => {
    const r = filterText('silav hevalno, çawa yî?');
    expect(r.flagged).toBe(false);
    expect(r.masked).toBe('silav hevalno, çawa yî?');
  });

  it('masks a plain profanity and flags it', () => {
    const r = filterText('you are a fuck');
    expect(r.masked).toContain('****');
    expect(r.masked).not.toContain('fuck');
    expect(r.flagged).toBe(true);
    expect(r.hits).toContain('fuck');
  });

  it('defeats diacritic / separator / leet / repeat evasion', () => {
    expect(filterText('f.u.c.k you').flagged).toBe(true);
    expect(filterText('fuuuuck').flagged).toBe(true);
    expect(filterText('sh1t happens').masked).not.toContain('sh1t');
  });

  it('flags spaced-out evasion even if it cannot cleanly mask it', () => {
    expect(filterText('f u c k').flagged).toBe(true);
  });

  it('does not false-positive on innocent words', () => {
    // "assassin" contains "ass" but whole-token match avoids the Scunthorpe trap
    expect(filterText('the assassin walked past class').flagged).toBe(false);
  });
});
