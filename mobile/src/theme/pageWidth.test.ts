import { describe, expect, it, vi } from 'vitest';

let window = { width: 390, height: 844 };
vi.mock('react-native', () => ({
  Dimensions: { get: () => window },
  useWindowDimensions: () => window,
}));
const { NARROW_PAGE, pageWidth, useNarrowPage, usePageWidth } = await import('./pageWidth');
const { layout } = await import('./tokens');

describe('the page width', () => {
  it('is the window’s on a phone and the column’s on an unfolded phone or a tablet', () => {
    window = { width: 390, height: 844 };
    expect(usePageWidth()).toBe(390);
    expect(pageWidth()).toBe(390);
    window = { width: 884, height: 1104 };
    expect(usePageWidth()).toBe(layout.page);
    expect(pageWidth()).toBe(layout.page);
  });

  it('calls only a measured page under the narrow width narrow', () => {
    window = { width: 280, height: 653 };
    expect(useNarrowPage()).toBe(true);
    window = { width: NARROW_PAGE, height: 568 };
    expect(useNarrowPage()).toBe(false);
    window = { width: 0, height: 0 };
    expect(useNarrowPage()).toBe(false);
  });
});
