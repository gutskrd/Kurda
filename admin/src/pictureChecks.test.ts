import { describe, expect, it } from 'vitest';
import type { PictureCaseItem } from '@kurda/shared';
import { decidable, defaultRule, excerpt, findings, picturesPath, ruleSource, viewFrom, viewHref } from './pictureChecks';

describe('what the check found', () => {
  it('lists only possible and above, surest first', () => {
    expect(findings({ suggestive: 'possible', violence: 'none', sexual: 'certain', hate: 'likely' }).map((f) => f.text)).toEqual([
      'Nudity — certain',
      'Hate symbols — likely',
      'Suggestive — possible',
    ]);
    expect(findings(null)).toEqual([]);
    expect(findings({ sexual: 'none' })).toEqual([]);
  });

  it('starts a removal on the surest finding’s rule, never on child safety, and on “something else” without one', () => {
    const found = (levels: PictureCaseItem['levels']) => ({ levels, reportCategory: null });
    expect(defaultRule(found({ shocking: 'likely', sexual: 'possible' }))).toBe('violence');
    expect(defaultRule(found({ suggestive: 'certain' }))).toBe('sexual');
    expect(defaultRule(found({ minor_safety: 'certain', self_harm: 'possible' }))).toBe('self_harm');
    expect(defaultRule(found({ minor_safety: 'certain' }))).toBe('other');
    expect(defaultRule(found(null))).toBe('other');
    expect(ruleSource(found(null))).toBeNull();
    expect(ruleSource(found({ minor_safety: 'certain' }))).toBeNull();
  });

  it('starts a reported picture’s removal on the rule reporters chose, unless that is child safety', () => {
    expect(defaultRule({ levels: { sexual: 'likely' }, reportCategory: 'harassment' })).toBe('harassment');
    expect(ruleSource({ levels: { sexual: 'likely' }, reportCategory: 'harassment' })).toBe('reports');
    expect(defaultRule({ levels: { sexual: 'likely' }, reportCategory: 'child_safety' })).toBe('sexual');
    expect(ruleSource({ levels: { sexual: 'likely' }, reportCategory: 'child_safety' })).toBe('check');
  });
});

describe('the list', () => {
  it('reads the tab from the address and writes it back', () => {
    expect(viewFrom(new URLSearchParams('view=reported'))).toBe('reported');
    expect(viewFrom(new URLSearchParams('view=elsewhere'))).toBe('waiting');
    expect(viewHref('waiting')).toBe('#/picture-checks');
    expect(viewHref('decided')).toBe('#/picture-checks?view=decided');
    expect(picturesPath('asked', 'a&b')).toBe('/admin/pictures?view=asked&cursor=a%26b');
  });

  it('decides on this page only what is open and not a child-safety hit', () => {
    const base = { decided: null, sensitive: false, status: 'open' } as const;
    expect(decidable({ ...base } as never)).toBe(true);
    expect(decidable({ ...base, sensitive: true } as never)).toBe(false);
    expect(decidable({ ...base, status: 'escalated' } as never)).toBe(false);
    expect(decidable({ ...base, decided: { outcome: 'approved', byUsername: null, at: '' } } as never)).toBe(false);
  });

  it('cuts a long post at a word', () => {
    expect(excerpt('short and sweet')).toBe('short and sweet');
    expect(excerpt(`${'word '.repeat(50)}end`, 24)).toBe('word word word word…');
  });
});
