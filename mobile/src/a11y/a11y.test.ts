import { describe, expect, it } from 'vitest';
import {
  a11yProps,
  decorative,
  hitSlopFor,
  meetsTouchTarget,
  MIN_TOUCH_TARGET,
} from './a11y';

describe('a11yProps', () => {
  it('marks the element accessible with role + label', () => {
    expect(a11yProps('button', 'Continue')).toEqual({
      accessible: true,
      accessibilityRole: 'button',
      accessibilityLabel: 'Continue',
    });
  });

  it('includes the hint when provided', () => {
    expect(a11yProps('button', 'Skip', 'Skips onboarding')).toMatchObject({
      accessibilityHint: 'Skips onboarding',
    });
  });

  it('omits an empty or whitespace-only hint', () => {
    expect(a11yProps('link', 'Terms', '   ')).not.toHaveProperty('accessibilityHint');
    expect(a11yProps('link', 'Terms', '')).not.toHaveProperty('accessibilityHint');
  });
});

describe('decorative', () => {
  it('hides the element from assistive tech on both platforms', () => {
    expect(decorative()).toEqual({
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
  });
});

describe('touch targets', () => {
  it('accepts controls at or above the minimum', () => {
    expect(meetsTouchTarget(MIN_TOUCH_TARGET, MIN_TOUCH_TARGET)).toBe(true);
    expect(meetsTouchTarget(60, 48)).toBe(true);
  });

  it('rejects controls below the minimum on either axis', () => {
    expect(meetsTouchTarget(20, 44)).toBe(false);
    expect(meetsTouchTarget(44, 20)).toBe(false);
  });

  it('pads a small control up to the minimum via hitSlop', () => {
    // A 24x24 icon needs (44-24)/2 = 10pt of slop on every side.
    expect(hitSlopFor(24, 24)).toEqual({ top: 10, bottom: 10, left: 10, right: 10 });
  });

  it('adds no slop when the control is already large enough', () => {
    expect(hitSlopFor(48, 50)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
    // A padded control always ends up at least the minimum size.
    const slop = hitSlopFor(24, 24);
    expect(24 + slop.left + slop.right).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });
});
