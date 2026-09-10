import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton, SkeletonRegion, SkeletonText } from './Skeleton';
import { FeedSkeleton, RankingsSkeleton } from './skeletons';

describe('Skeleton', () => {
  it('leaves a line box without a height, so the stylesheet decides it', () => {
    // The whole point of `line` is that the bar is one line of whatever element
    // it stands in — `height: 1lh` in CSS. An inline height here would override
    // that and put the guessing back, which is what made the first draft of the
    // feed skeleton 72px shorter than the card that replaced it.
    const { container } = render(<Skeleton line w="70%" />);
    const box = container.firstElementChild as HTMLElement;
    expect(box.className).toContain('skeleton-line');
    expect(box.style.height).toBe('');
    expect(box.style.width).toBe('70%');
  });

  it('sizes a circle on both axes from one number', () => {
    const { container } = render(<Skeleton circle size={34} />);
    const box = container.firstElementChild as HTMLElement;
    expect(box.style.width).toBe('34px');
    expect(box.style.height).toBe('34px');
  });

  it('gives a paragraph a short last line', () => {
    const { container } = render(<SkeletonText lines={3} lastWidth="55%" />);
    const bars = [...container.querySelectorAll<HTMLElement>('.skeleton-line')];
    expect(bars).toHaveLength(3);
    expect(bars.slice(0, 2).map((b) => b.style.width)).toEqual(['100%', '100%']);
    expect(bars.at(-1)?.style.width).toBe('55%');
  });
});

describe('SkeletonRegion', () => {
  it('says "loading" once and hides every box from screen readers', () => {
    render(
      <SkeletonRegion label="Loading the wall…">
        <Skeleton line />
        <Skeleton circle size={34} />
      </SkeletonRegion>,
    );

    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-busy')).toBe('true');
    // the label is the only thing announced; the boxes are decoration
    expect(region.textContent).toBe('Loading the wall…');
    for (const box of region.querySelectorAll('.skeleton')) {
      expect(box.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

describe('screen skeletons', () => {
  it('announces the screen being waited for, not just that something is', () => {
    render(<FeedSkeleton count={1} label="civak.loading" />);
    expect(screen.getByRole('status').textContent).toBe('Loading the wall…');
  });

  it('falls back to a plain "loading" when a screen has nothing better to say', () => {
    render(<RankingsSkeleton count={1} />);
    expect(screen.getByRole('status').textContent).toBe('Loading…');
  });

  it('is built from the real screen\u2019s own class names', () => {
    // This is what makes the placeholder the same height as the thing: padding,
    // gaps and line-height all come from the finished screen's rules. A skeleton
    // rebuilt out of plain divs would look right today and drift on the next
    // stylesheet change, silently.
    const { container } = render(<FeedSkeleton count={2} />);
    expect(container.querySelector('.feed')).not.toBeNull();
    expect(container.querySelectorAll('.fcard')).toHaveLength(2);
    for (const cls of [
      '.fcard-head',
      '.fcard-who',
      '.fcard-name',
      '.fcard-body',
      '.fcard-title',
      '.fcard-text',
      '.fcard-actions',
    ]) {
      expect(container.querySelector(cls), cls).not.toBeNull();
    }
    // and the text stand-ins sit *inside* those elements, which is where the
    // line height comes from
    expect(container.querySelector('.fcard-name > .skeleton-line')).not.toBeNull();
    expect(container.querySelector('.fcard-title > .skeleton-line')).not.toBeNull();
  });

  it('keeps the same cards carrying a picture on every render', () => {
    // A reshuffle between renders would move everything below it — the exact
    // jump a skeleton exists to prevent.
    const first = render(<FeedSkeleton count={6} />).container.innerHTML;
    const second = render(<FeedSkeleton count={6} />).container.innerHTML;
    expect(first).toBe(second);
  });
});
