// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { RUN_MOMENT_MS, RunLabel, RunMoment } from './RunCount';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function listen(): string[] {
  const said: string[] = [];
  (AccessibilityInfo as unknown as { announceForAccessibility: (words: string) => void }).announceForAccessibility = (words) => said.push(words);
  return said;
}

describe('a run of right answers', () => {
  it('is named over the progress bar, with a flame', () => {
    patchReactNativeWeb({ reduceMotion: true });
    const { rerender } = renderWithProviders(<RunLabel count={3} end={false} />);
    expect(screen.getByTestId('lesson-in-a-row').textContent).toBe('3 in a row');
    rerender(<RunLabel count={4} end={false} />);
    expect(screen.getByText('4 in a row')).toBeTruthy();
  });

  for (const reduceMotion of [false, true]) {
    // springing in, or under Reduce Motion fading in where it is: either way said, and gone in about a second
    it(`holds its milestone for about a second, says it, and moves on${reduceMotion ? ' under Reduce Motion' : ''}`, async () => {
      patchReactNativeWeb({ reduceMotion });
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const said = listen();
      const onDone = vi.fn();
      renderWithProviders(<RunMoment count={5} onDone={onDone} />);
      expect(screen.getByRole('button', { name: '5 in a row!' })).toBeTruthy();
      expect(said).toEqual(['5 in a row!']);
      await act(() => vi.advanceTimersByTimeAsync(RUN_MOMENT_MS - 100));
      expect(onDone).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(200));
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
