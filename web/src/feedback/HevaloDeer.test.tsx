import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { HevaloDeer, tiltFor } from './HevaloDeer';

describe('Hevalo the deer', () => {
  it('is decoration: hidden from screen readers, never in the tab order', () => {
    const { container } = render(<HevaloDeer board={{ kind: 'stars', stars: 3 }} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
  });

  it('holds up as many filled stars as were chosen', () => {
    const { container } = render(<HevaloDeer board={{ kind: 'stars', stars: 3 }} />);
    expect(container.querySelectorAll('.deer-star')).toHaveLength(5);
    expect(container.querySelectorAll('.deer-star.is-on')).toHaveLength(3);
  });

  it('tips the board up with every star', () => {
    for (let s = 0; s < 5; s++) expect(tiltFor(s + 1)).toBeGreaterThan(tiltFor(s));
    expect(tiltFor(-3)).toBe(tiltFor(0));
    expect(tiltFor(9)).toBe(tiltFor(5));
  });

  it('is the mascot itself, holding the board', () => {
    const { container } = render(<HevaloDeer board={{ kind: 'stars', stars: 2 }} />);
    expect(container.querySelector('image')).toHaveAttribute('href', '/mascot-deer.png');
  });

  it('holds a sign with letters, in their language and direction', () => {
    const { container } = render(<HevaloDeer board={{ kind: 'letters', letters: 'ڕ ڵ ێ', lang: 'ckb', dir: 'rtl' }} />);
    const text = container.querySelector('text')!;
    expect(text.textContent).toBe('ڕ ڵ ێ');
    expect(text).toHaveAttribute('lang', 'ckb');
    expect(container.querySelectorAll('.deer-star')).toHaveLength(0);
  });

  it('hops when told to cheer', () => {
    const { container } = render(<HevaloDeer board={{ kind: 'letters', letters: 'ç ê î ş û' }} cheer />);
    expect(container.querySelector('svg')).toHaveClass('deer-cheer');
  });
});
