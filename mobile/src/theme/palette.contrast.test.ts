import { describe, expect, it } from 'vitest';
import { DARK, LIGHT } from './palette';
import { AA_LARGE, AA_NORMAL, contrastRatio } from '../a11y/contrast';

/**
 * WCAG AA contrast audit for the app palette (KUR-266). The monochrome scheme
 * must stay readable in both modes: body text hits AA (4.5:1) on the app
 * background and on primary buttons; secondary/muted text and the brand colour
 * (used mostly for large headings) hit at least AA large-text (3:1). Text sits
 * on translucent glass cards over the gradient, but the raw background is the
 * lowest-contrast surface, so it's the conservative check.
 */
for (const p of [LIGHT, DARK]) {
  describe(`palette contrast — ${p.scheme}`, () => {
    it('primary text on the background meets AA (4.5:1)', () => {
      expect(contrastRatio(p.textPrimary, p.background)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('button label on the primary button meets AA (4.5:1)', () => {
      expect(contrastRatio(p.textOnPrimary, p.primary)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('secondary text on the background meets at least AA large (3:1)', () => {
      expect(contrastRatio(p.textSecondary, p.background)).toBeGreaterThanOrEqual(AA_LARGE);
    });

    it('the brand/primary colour on the background meets at least AA large (3:1)', () => {
      expect(contrastRatio(p.primary, p.background)).toBeGreaterThanOrEqual(AA_LARGE);
    });

    it('the danger colour on the background meets at least AA large (3:1)', () => {
      expect(contrastRatio(p.danger, p.background)).toBeGreaterThanOrEqual(AA_LARGE);
    });
  });
}
