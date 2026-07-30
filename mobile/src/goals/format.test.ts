import { describe, expect, it } from 'vitest';
import { goalPercentLabel, ringStroke } from './format';

describe('goalPercentLabel', () => {
  it('rounds progress to a whole percent', () => {
    expect(goalPercentLabel(0)).toBe('0%');
    expect(goalPercentLabel(0.5)).toBe('50%');
    expect(goalPercentLabel(0.333)).toBe('33%');
  });

  it('clamps out-of-range progress', () => {
    expect(goalPercentLabel(1.5)).toBe('100%');
    expect(goalPercentLabel(-1)).toBe('0%');
  });
});

describe('ringStroke', () => {
  const r = 40;
  const C = 2 * Math.PI * r;

  it('is fully offset (empty) at 0 progress', () => {
    expect(ringStroke(0, r).dashoffset).toBeCloseTo(C);
  });

  it('has no offset (full) at complete', () => {
    expect(ringStroke(1, r).dashoffset).toBeCloseTo(0);
  });

  it('is half the circumference at 50%', () => {
    expect(ringStroke(0.5, r).dashoffset).toBeCloseTo(C / 2);
  });

  it('clamps overshoot to full', () => {
    expect(ringStroke(2, r).dashoffset).toBeCloseTo(0);
  });
});
