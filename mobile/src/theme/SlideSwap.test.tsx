// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('../play/testing/native'));
// The leaving timing is held until the test releases it; otherwise animations end at once under test and the leaving slide is never seen.
const held = vi.hoisted(() => ({ runs: [] as { finish: () => void }[] }));
vi.mock('./animate', async (original) => ({
  ...(await original<typeof import('./animate')>()),
  timing: () => {
    const run = { finish: () => undefined as void };
    held.runs.push(run);
    return {
      start: (cb?: (r: { finished: boolean }) => void) => {
        run.finish = () => cb?.({ finished: true });
      },
      stop: () => undefined,
      reset: () => undefined,
    };
  },
}));

import { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Pressable, Text } from 'react-native';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { SlideSwap, useSlideLeaving } from './SlideSwap';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => {
  held.runs = [];
});
afterEach(cleanup);

/** Runs every held animation to its end, so the leaving slide is gone. */
function gone(): void {
  act(() => held.runs.splice(0).forEach((run) => run.finish()));
}

const mounted: string[] = [];

/** A slide with its own state: a count it keeps, and a record of each mount. */
function Counter({ name }: { name: string }): React.JSX.Element {
  const [count, setCount] = useState(0);
  const leaving = useSlideLeaving();
  useEffect(() => {
    mounted.push(name);
  }, [name]);
  return (
    <Pressable onPress={() => setCount((n) => n + 1)} accessibilityRole="button" accessibilityLabel={name}>
      <Text>{`${name}: ${count}${leaving ? ', leaving' : ''}`}</Text>
    </Pressable>
  );
}

describe('a slide giving way to the next', () => {
  it('sends off a still of the slide, mounted afresh from what it last drew', () => {
    mounted.length = 0;
    const { rerender } = render(
      <SlideSwap id="a" direction="forward">
        <Counter name="first" />
      </SlideSwap>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'first' }));
    expect(screen.getByText('first: 1')).toBeTruthy();

    rerender(
      <SlideSwap id="b" direction="forward">
        <Counter name="second" />
      </SlideSwap>,
    );
    // A still pictures its props, without what the slide kept for itself.
    expect(within(screen.getByTestId('slide-out-start')).getByText('first: 0, leaving')).toBeTruthy();
    expect(within(screen.getByTestId('slide-in')).getByText('second: 0')).toBeTruthy();
    expect(mounted).toEqual(['first', 'first', 'second']);
    gone();
    expect(screen.queryByTestId('slide-out-start')).toBeNull();
    expect(screen.queryByText(/first/)).toBeNull();
  });

  it('holds a held slide as it stood, and tells it that it is leaving', () => {
    mounted.length = 0;
    const { rerender } = render(
      <SlideSwap id="a" direction="forward" held>
        <Counter name="first" />
      </SlideSwap>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'first' }));

    rerender(
      <SlideSwap id="b" direction="forward" held>
        <Counter name="second" />
      </SlideSwap>,
    );
    // The same slide, not another: its count is kept and it mounted once.
    expect(within(screen.getByTestId('slide-out-start')).getByText('first: 1, leaving')).toBeTruthy();
    expect(within(screen.getByTestId('slide-in')).getByText('second: 0')).toBeTruthy();
    expect(mounted).toEqual(['first', 'second']);
    gone();
    expect(screen.queryByTestId('slide-out-start')).toBeNull();
    expect(screen.queryByText(/first/)).toBeNull();
    expect(screen.getByText('second: 0')).toBeTruthy();
  });

  it('leaves by the other side in a language read from the right', () => {
    const { rerender } = render(
      <SlideSwap id="a" direction="forward" mirrored held>
        <Counter name="first" />
      </SlideSwap>,
    );
    rerender(
      <SlideSwap id="b" direction="forward" mirrored held>
        <Counter name="second" />
      </SlideSwap>,
    );
    expect(within(screen.getByTestId('slide-out-end')).getByText('first: 0, leaving')).toBeTruthy();
  });

  it('hides the slide that is leaving from a screen reader', () => {
    const { rerender } = render(
      <SlideSwap id="a" direction="forward" held>
        <Counter name="first" />
      </SlideSwap>,
    );
    rerender(
      <SlideSwap id="b" direction="forward" held>
        <Counter name="second" />
      </SlideSwap>,
    );
    expect(screen.queryByRole('button', { name: 'first' })).toBeNull();
    expect(screen.getByRole('button', { name: 'first', hidden: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'second' })).toBeTruthy();
  });

  it('takes a held slide back while it is still leaving, as it stood, and sends the other off', () => {
    mounted.length = 0;
    const first = (
      <SlideSwap id="a" direction="back" held>
        <Counter name="first" />
      </SlideSwap>
    );
    const { rerender } = render(first);
    fireEvent.click(screen.getByRole('button', { name: 'first' }));
    rerender(
      <SlideSwap id="b" direction="forward" held>
        <Counter name="second" />
      </SlideSwap>,
    );
    rerender(first);
    // The same first slide with its count, no longer leaving; the second leaves by the end side.
    expect(within(screen.getByTestId('slide-in')).getByText('first: 1')).toBeTruthy();
    expect(within(screen.getByTestId('slide-out-end')).getByText('second: 0, leaving')).toBeTruthy();
    expect(mounted).toEqual(['first', 'second']);
    gone();
    expect(screen.queryByText(/second/)).toBeNull();
    expect(screen.getByRole('button', { name: 'first' })).toBeTruthy();
  });

  it('sends nothing off for a slide that showed nothing, and lets what was leaving go on leaving', () => {
    const { rerender } = render(
      <SlideSwap id="a" direction="forward" held>
        <Counter name="first" />
      </SlideSwap>,
    );
    // A skipped slide draws nothing.
    rerender(
      <SlideSwap id="b" direction="forward" held>
        {null}
      </SlideSwap>,
    );
    rerender(
      <SlideSwap id="c" direction="forward" held>
        <Counter name="third" />
      </SlideSwap>,
    );
    expect(within(screen.getByTestId('slide-out-start')).getByText('first: 0, leaving')).toBeTruthy();
    expect(within(screen.getByTestId('slide-in')).getByText('third: 0')).toBeTruthy();
  });
});
