import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CHEST_LAYERS } from '@kurda/shared';
import { Chest } from './Chest';

/*
 * A quest's chest, drawn: its parts as groups the stylesheet moves. Opening
 * one over the whole screen, and what it pays, is in quests.test.tsx.
 */

/** Everything drawn inside the chest's parts, in order. */
const drawn = (root: HTMLElement): ChildNode[] => [...root.querySelectorAll('[data-part]')].flatMap((part) => [...part.childNodes]);

describe('a chest, drawn', () => {
  it('stacks its parts as groups named for the stylesheet, the shadow under the group that hops', () => {
    const { container } = render(<Chest tier="common" size={96} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect([...svg.children].map((el) => el.getAttribute('data-part') ?? el.getAttribute('class'))).toEqual(['shadow', 'chest-hop']);
    expect([...svg.querySelectorAll('.chest-hop > [data-part]')].map((el) => el.getAttribute('data-part'))).toEqual(CHEST_LAYERS.filter((part) => part !== 'shadow'));
  });

  /**
   * The chest hops, bursts open and stands open by classes on the drawing
   * alone, and the screen it is on draws itself again at each of those steps.
   * Its parts have not changed, so they stay the nodes they were: put in
   * again, an animation running on one would start over, and the stylesheet
   * would be moving a lid that had only just been parsed.
   */
  it('leaves every part in place as it hops and opens, and draws another chest as what it is', () => {
    const { rerender, container } = render(<Chest tier="rare" size={96} shine />);
    const parts = drawn(container);
    expect(parts.length).toBeGreaterThanOrEqual(CHEST_LAYERS.length);
    for (const next of [<Chest tier="rare" size={96} shine />, <Chest tier="rare" size={96} popping />, <Chest tier="rare" size={96} open reach={2} />]) {
      rerender(next);
      const now = drawn(container);
      expect(now.length).toBe(parts.length);
      // counted rather than compared one by one, so that a failure says how much of the chest was drawn again
      expect(now.filter((node, i) => node !== parts[i]).length).toBe(0);
    }
    expect(container.querySelector('svg')).toHaveClass('is-open');
    // an epic chest in its place: lacquer where the wood was
    const body = [...container.querySelector('[data-part="body"]')!.childNodes];
    rerender(<Chest tier="epic" size={96} open />);
    expect(container.querySelector('svg')).toHaveAttribute('data-tier', 'epic');
    expect(container.querySelector('[data-part="body"]')!.childNodes.length).toBeGreaterThan(0);
    for (const node of body) expect(node.isConnected).toBe(false);
  });
});
