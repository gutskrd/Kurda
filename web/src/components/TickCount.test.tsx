import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { TickCount } from './TickCount';

const plain = (n: number): string => String(n);

/** A browser that plays motion, or one with reduced motion. */
function withMotion(reduced = false): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('TickCount', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.stubGlobal('matchMedia', undefined);
  });

  it('shows a count that first appears without moving it', () => {
    withMotion();
    const { container } = render(<TickCount value={4} format={plain} />);
    expect(container.querySelector('.tick')?.className).toBe('tick');
    expect(container.textContent).toBe('4');
  });

  it('slides the old number out and the new one in, up for more and down for fewer', () => {
    vi.useFakeTimers();
    withMotion();
    const { container, rerender } = render(<TickCount value={4} format={plain} className="fcard-count" />);
    rerender(<TickCount value={5} format={plain} className="fcard-count" />);
    expect(container.querySelector('.tick')?.classList.contains('is-up')).toBe(true);
    expect(container.querySelector('.tick-was')?.textContent).toBe('4');
    expect(container.querySelector('.tick-was')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.tick-now')?.textContent).toBe('5');

    act(() => vi.advanceTimersByTime(250));
    expect(container.querySelector('.tick-was')).toBeNull();
    expect(container.querySelector('.fcard-count')?.textContent).toBe('5');

    rerender(<TickCount value={3} format={plain} className="fcard-count" />);
    expect(container.querySelector('.tick')?.classList.contains('is-down')).toBe(true);
  });

  it('just changes under Reduce Motion', () => {
    withMotion(true);
    const { container, rerender } = render(<TickCount value={4} format={plain} />);
    rerender(<TickCount value={5} format={plain} />);
    expect(container.querySelector('.tick-was')).toBeNull();
    expect(container.querySelector('.tick')?.className).toBe('tick');
    expect(container.textContent).toBe('5');
  });
});
