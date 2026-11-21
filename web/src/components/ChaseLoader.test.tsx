import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CHASE } from '@kurda/shared';
import { I18nProvider } from '../i18n/I18nProvider';
import { Loading } from './states';

/* A page on its way shows Hevalo chasing his winged apple, says what is loading to a screen reader, and two at once never share ids. */

describe('the page-loading picture', () => {
  it('draws one stride in its frames, each shown in turn, with the apple and its wings, behind words a screen reader hears', () => {
    const { container } = render(
      <I18nProvider>
        <Loading label="Opening your letters" />
      </I18nProvider>,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Opening your letters');
    expect(container.querySelector('.chase svg')).toHaveAttribute('aria-hidden', 'true');
    const frames = [...container.querySelectorAll<SVGGElement>('.chase-frame')];
    expect(frames).toHaveLength(CHASE.frames);
    // Each frame starts its turn a frame's length after the one before.
    expect(frames.map((f) => f.style.animationDelay)).toEqual(frames.map((_, i) => `${((-i * CHASE.strideMs) / CHASE.frames).toFixed(1)}ms`));
    expect(container.querySelectorAll('.chase-wing')).toHaveLength(2);
  });

  it('gives each picture its own ids', () => {
    const { container } = render(
      <I18nProvider>
        <Loading />
        <Loading />
      </I18nProvider>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(ids.length).toBeGreaterThan(CHASE.frames);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
