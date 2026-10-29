// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { emptyMatch, type MatchPair, type MatchState } from '@kurda/shared';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { onHaptic, resetHaptics } from '../../feedback/haptics';
import type { HapticEvent } from '../../feedback/hapticPacing';
import type { Exercise } from '../types';
import { MatchPairsExercise, PAIR_FLASH_MS } from './MatchPairsExercise';

/** Kurdish cards and their meanings, each side shuffled; `pairOf` says which meaning is each card's. */
const pairs: Exercise = {
  id: 'mp',
  type: 'match_pairs',
  lefts: ['sêv', 'nan', 'av'],
  rights: ['water', 'apple', 'bread'],
  pairOf: [1, 2, 0],
};

let felt: HapticEvent[] = [];
let said: string[] = [];
let stopFeeling: () => void = () => undefined;
beforeEach(() => {
  patchReactNativeWeb({ reduceMotion: true });
  resetHaptics();
  felt = [];
  said = [];
  stopFeeling = onHaptic((e) => felt.push(e));
  (AccessibilityInfo as unknown as { announceForAccessibility: (words: string) => void }).announceForAccessibility = (words) => said.push(words);
});
afterEach(() => {
  stopFeeling();
  cleanup();
});

/** The exercise as the lesson holds it: the pairs made so far, kept above it. */
function Held({ exercise, made }: { exercise: Exercise; made: (matches: MatchPair[]) => void }): React.JSX.Element {
  const [state, setState] = useState<MatchState>(emptyMatch);
  return (
    <MatchPairsExercise
      exercise={exercise}
      state={state}
      onChange={(next) => {
        setState(next);
        made(next.matches);
      }}
      disabled={false}
    />
  );
}

const card = (name: string): HTMLElement => screen.getByRole('button', { name });

/** Taps far enough apart for each to be felt, as a person's are. */
function tap(name: string): void {
  resetHaptics();
  fireEvent.click(card(name));
}

describe('pairs answered as they are made', () => {
  it('opens with what to do, in words, as the heading of the screen', () => {
    renderWithProviders(<Held exercise={pairs} made={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Match the pairs' })).toBeTruthy();
  });

  it('keeps a right pair the moment it is made, from either side, says so, and spends both cards once it has shown', async () => {
    const made = vi.fn();
    renderWithProviders(<Held exercise={pairs} made={made} />);
    // the meaning first this time
    tap('apple');
    expect(card('apple').getAttribute('aria-selected')).toBe('true');
    tap('sêv');
    expect(made).toHaveBeenLastCalledWith([{ left: 'sêv', right: 'apple' }]);
    expect(felt).toEqual(['select', 'correct']);
    expect(said).toEqual(['sêv and apple: a pair']);
    // shown as right for a moment, then used up: no lip, no press
    expect(card('sêv').getAttribute('aria-disabled')).not.toBe('true');
    await waitFor(() => expect(card('sêv').getAttribute('aria-disabled')).toBe('true'), { timeout: PAIR_FLASH_MS.right + 1000 });
    expect(card('apple').getAttribute('aria-disabled')).toBe('true');
    expect(card('apple').children).toHaveLength(1);
  });

  it('lets a wrong pair go: felt as a gentle miss, said, and both cards waiting again', async () => {
    const made = vi.fn();
    renderWithProviders(<Held exercise={pairs} made={made} />);
    tap('nan');
    tap('water');
    expect(made).not.toHaveBeenCalled();
    expect(felt).toEqual(['select', 'wrong']);
    expect(said).toEqual(['nan and water: not a pair']);
    expect(card('nan').getAttribute('aria-selected')).toBe('false');
    await act(() => new Promise((done) => setTimeout(done, PAIR_FLASH_MS.wrong + 50)));
    for (const name of ['nan', 'water']) {
      expect(card(name).getAttribute('aria-disabled')).not.toBe('true');
      expect(card(name).children).toHaveLength(2);
    }
    // and either can be paired again, rightly this time
    tap('nan');
    tap('bread');
    expect(made).toHaveBeenLastCalledWith([{ left: 'nan', right: 'bread' }]);
  });

  it('moves the pick to another card on the same side, and lets it go when it is tapped again', () => {
    renderWithProviders(<Held exercise={pairs} made={() => undefined} />);
    tap('sêv');
    tap('nan');
    expect(card('sêv').getAttribute('aria-selected')).toBe('false');
    expect(card('nan').getAttribute('aria-selected')).toBe('true');
    tap('nan');
    expect(card('nan').getAttribute('aria-selected')).toBe('false');
  });

  it('makes every pair before it is done', () => {
    const made = vi.fn();
    renderWithProviders(<Held exercise={pairs} made={made} />);
    for (const [left, right] of [
      ['sêv', 'apple'],
      ['nan', 'bread'],
      ['av', 'water'],
    ] as const) {
      tap(left);
      tap(right);
    }
    expect(made).toHaveBeenLastCalledWith([
      { left: 'sêv', right: 'apple' },
      { left: 'nan', right: 'bread' },
      { left: 'av', right: 'water' },
    ]);
  });
});

describe('pairs from a server that does not say which is which', () => {
  // made freely and graded together at Check, as they always were: tapping a made pair undoes it
  it('pairs whatever is tapped, says nothing of right or wrong, and undoes a pair tapped again', () => {
    const made = vi.fn();
    renderWithProviders(<Held exercise={{ ...pairs, pairOf: undefined }} made={made} />);
    tap('sêv');
    tap('water');
    expect(made).toHaveBeenLastCalledWith([{ left: 'sêv', right: 'water' }]);
    expect(said).toEqual([]);
    expect(felt).not.toContain('wrong');
    tap('water');
    expect(made).toHaveBeenLastCalledWith([]);
  });
});
