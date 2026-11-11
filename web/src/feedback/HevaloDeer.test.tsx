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

  /**
   * The box the deer stands in draws itself again with every star chosen and
   * every key pressed. What has not changed stays the nodes it was — the card
   * always, the board until its stars do — where putting it in again would
   * parse it afresh each time and leave whatever held a star holding one no
   * longer on the page.
   */
  it('leaves the card and the board in place when the box around it is drawn again, and draws the board again only as its stars change', () => {
    const drawn = (root: HTMLElement): { card: ChildNode[]; board: ChildNode[] } => ({
      card: [...root.querySelector('svg > g')!.childNodes],
      board: [...root.querySelector('.deer-board > g')!.childNodes],
    });
    const { rerender, container } = render(<HevaloDeer board={{ kind: 'stars', stars: 3 }} />);
    const first = drawn(container);
    expect(first.card.length).toBeGreaterThan(0);
    expect(first.board.length).toBeGreaterThan(0);
    rerender(<HevaloDeer board={{ kind: 'stars', stars: 3 }} cheer />);
    expect(container.querySelector('svg')).toHaveClass('deer-cheer');
    const again = drawn(container);
    expect(again.card).toHaveLength(first.card.length);
    expect(again.board).toHaveLength(first.board.length);
    again.card.forEach((node, i) => expect(node).toBe(first.card[i]));
    again.board.forEach((node, i) => expect(node).toBe(first.board[i]));
    // two more stars: the board is drawn as it now is, the card behind it left alone
    rerender(<HevaloDeer board={{ kind: 'stars', stars: 5 }} cheer />);
    expect(container.querySelectorAll('.deer-star.is-on')).toHaveLength(5);
    for (const node of first.board) expect(node.isConnected).toBe(false);
    drawn(container).card.forEach((node, i) => expect(node).toBe(first.card[i]));
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
