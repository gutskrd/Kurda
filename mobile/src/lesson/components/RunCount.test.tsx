// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
// the fire as its props: how big it burns and what it grows from, whoever draws it
vi.mock('../../theme/Fire', () => import('../../theme/testing/fireProbe'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import { RUN_MOMENT_MS, runMoment } from '@kurda/shared';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { RunLabel, RunMoment } from './RunCount';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function listen(): string[] {
  const said: string[] = [];
  (AccessibilityInfo as unknown as { announceForAccessibility: (words: string) => void }).announceForAccessibility = (words) => said.push(words);
  return said;
}

const fire = (): HTMLElement => screen.getByTestId('fire');

describe('a run of right answers', () => {
  it('is named over the progress bar, with a fire as big as the run has grown it', () => {
    patchReactNativeWeb({ reduceMotion: true });
    const { rerender } = renderWithProviders(<RunLabel count={3} end={false} />);
    expect(screen.getByTestId('lesson-in-a-row').textContent).toBe('3 in a row');
    expect(fire().dataset.stage).toBe('kindling');
    rerender(<RunLabel count={4} end={false} />);
    expect(screen.getByText('4 in a row')).toBeTruthy();
    rerender(<RunLabel count={12} end={false} />);
    expect(fire().dataset.stage).toBe('bigfire');
  });

  for (const reduceMotion of [false, true]) {
    // springing in, or under Reduce Motion fading in where it is: either way said, and gone in about a second
    it(`holds its milestone for about a second, says it, and moves on${reduceMotion ? ' under Reduce Motion' : ''}`, async () => {
      patchReactNativeWeb({ reduceMotion });
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const said = listen();
      const onDone = vi.fn();
      renderWithProviders(<RunMoment count={25} onDone={onDone} />);
      expect(screen.getByRole('button', { name: '25 in a row!' })).toBeTruthy();
      expect(said).toEqual(['25 in a row!']);
      // a blaze since 20: nothing more to grow into
      expect(fire().dataset.stage).toBe('blaze');
      expect(fire().dataset.from).toBeUndefined();
      await act(() => vi.advanceTimersByTimeAsync(RUN_MOMENT_MS - 100));
      expect(onDone).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(200));
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  }

  for (const [count, before, after] of [
    [5, 'kindling', 'campfire'],
    [10, 'campfire', 'bigfire'],
    [20, 'bonfire', 'blaze'],
  ] as const) {
    it(`grows its fire from ${before} into ${after} at ${count} in a row, and holds until it has`, async () => {
      patchReactNativeWeb({ reduceMotion: false });
      vi.useFakeTimers({ shouldAdvanceTime: true });
      listen();
      const onDone = vi.fn();
      renderWithProviders(<RunMoment count={count} onDone={onDone} />);
      expect(fire().dataset.stage).toBe(after);
      expect(fire().dataset.from).toBe(before);
      await act(() => vi.advanceTimersByTimeAsync(RUN_MOMENT_MS + 100));
      expect(onDone).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(runMoment(count).ms - RUN_MOMENT_MS));
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  }

  it('moves on at once when its milestone is tapped', () => {
    patchReactNativeWeb({ reduceMotion: true });
    listen();
    const onDone = vi.fn();
    renderWithProviders(<RunMoment count={10} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: '10 in a row!' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
