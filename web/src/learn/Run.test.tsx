import { afterEach, describe, expect, it, vi } from 'vitest';
// the fire as its props: how big it burns and what it grows from, whoever draws it
vi.mock('../components/Fire', () => import('../test/fireProbe'));
import { act, render, screen } from '@testing-library/react';
import { RUN_MOMENT_MS, fireSizeToFit, runMoment } from '@kurda/shared';
import { I18nProvider } from '../i18n/I18nProvider';
import { RunLabel, RunMoment } from './Run';

/*
 * A run of right answers grows the streak's fire within the lesson: the
 * label's fire burns at the run's stage, and a milestone where it reached a
 * new one grows into it, holding the screen until it has.
 */

afterEach(() => vi.useRealTimers());

const fire = (): HTMLElement => screen.getByTestId('fire');

describe('the run of right answers', () => {
  it('burns at the stage of the run beside its label', () => {
    const { rerender } = render(
      <I18nProvider>
        <RunLabel run={4} />
      </I18nProvider>,
    );
    expect(fire()).toHaveAttribute('data-stage', 'kindling');
    rerender(
      <I18nProvider>
        <RunLabel run={12} />
      </I18nProvider>,
    );
    expect(fire()).toHaveAttribute('data-stage', 'bigfire');
  });

  for (const [count, before, after] of [
    [5, 'kindling', 'campfire'],
    [10, 'campfire', 'bigfire'],
  ] as const) {
    it(`grows its fire from ${before} into ${after} at ${count} in a row, and holds until it has`, () => {
      vi.useFakeTimers();
      const onDone = vi.fn();
      render(
        <I18nProvider>
          <RunMoment count={count} onDone={onDone} />
        </I18nProvider>,
      );
      expect(fire()).toHaveAttribute('data-stage', after);
      expect(fire()).toHaveAttribute('data-from', before);
      act(() => vi.advanceTimersByTime(RUN_MOMENT_MS));
      expect(onDone).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(runMoment(count).ms - RUN_MOMENT_MS));
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  }

  it('draws every milestone fire framed, alike, so a longer run is a bigger fire, the biggest it grows still under the words', () => {
    const drawn = (count: number): HTMLElement => {
      const { unmount } = render(
        <I18nProvider>
          <RunMoment count={count} onDone={vi.fn()} />
        </I18nProvider>,
      );
      const one = fire().cloneNode() as HTMLElement;
      unmount();
      return one;
    };
    for (const count of [5, 20, 30]) {
      expect(drawn(count)).toHaveAttribute('data-framed', 'true');
      expect(Number(drawn(count).dataset.size)).toBeCloseTo(fireSizeToFit('blaze', 200, 200), 9);
    }
  });

  it('keeps the blaze as it is at 25 in a row, for about a second', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(
      <I18nProvider>
        <RunMoment count={25} onDone={onDone} />
      </I18nProvider>,
    );
    expect(fire()).toHaveAttribute('data-stage', 'blaze');
    expect(fire()).not.toHaveAttribute('data-from');
    act(() => vi.advanceTimersByTime(RUN_MOMENT_MS));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
