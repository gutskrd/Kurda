// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
import { useState } from 'react';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { onHaptic, resetHaptics } from '../../feedback/haptics';
import type { HapticEvent } from '../../feedback/hapticPacing';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { RULER, ageRange, offsetForAge } from './age';
import { AgeRuler } from './AgeRuler';

/*
 * The ruler: the big number and "years old" over it, a tick a year with the
 * numbers every ten, the age under the pointer following the scroll a year
 * at a time with a tick in the hand, and to a screen reader one adjustable
 * control that says the age.
 */

patchReactNativeWeb({ reduceMotion: true });
const TODAY = new Date('2026-11-04T12:00:00Z');
const range = ageRange(TODAY);

let felt: HapticEvent[] = [];
let stop: () => void = () => undefined;
const changes: number[] = [];

beforeEach(() => {
  resetHaptics();
  felt = [];
  changes.length = 0;
  stop = onHaptic((e) => felt.push(e));
});
afterEach(() => {
  stop();
  cleanup();
});

function Ruler({ start = 20 }: { start?: number }) {
  const [age, setAge] = useState(start);
  return (
    <AgeRuler
      value={age}
      onChange={(next) => {
        changes.push(next);
        setAge(next);
      }}
      now={TODAY}
    />
  );
}

/** the ruler scrolled to `x` points */
function scrollTo(x: number): void {
  act(() => {
    fireEvent.scroll(screen.getByTestId('age-ruler-scroll'), { target: { scrollLeft: x } });
  });
}

describe('AgeRuler', () => {
  it('shows the age large, with the unit under it, and a numbered tick every ten years', () => {
    renderWithProviders(<Ruler />);
    expect(screen.getByTestId('age-ruler-number').textContent).toBe('20');
    expect(screen.getByText('years old')).toBeTruthy();
    // the numbers under the tall ticks, every ten years to the oldest
    for (let age = 10; age <= range.max; age += 10) expect(screen.getAllByText(String(age)).length).toBeGreaterThan(0);
    expect(screen.queryByText('15')).toBeNull();
  });

  it('is one adjustable control to a screen reader, saying the age', () => {
    renderWithProviders(<Ruler />);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuemin')).toBe(String(range.min));
    expect(slider.getAttribute('aria-valuemax')).toBe(String(range.max));
    expect(slider.getAttribute('aria-valuenow')).toBe('20');
    expect(slider.getAttribute('aria-valuetext')).toBe('20 years old');
    // the ticks themselves are not read: the control says it all
    expect(screen.getByTestId('age-ruler-ticks').getAttribute('aria-hidden')).toBe('true');
  });

  it('follows the scroll a year at a time, counting the number up and ticking in the hand', () => {
    renderWithProviders(<Ruler />);
    scrollTo(offsetForAge(34, range.min));
    expect(changes).toEqual([34]);
    expect(screen.getByTestId('age-ruler-number').textContent).toBe('34');
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('34');
    expect(felt).toEqual(['select']);
  });

  it('lands between two ticks on the nearer year, and says nothing for a scroll that stays on the same one', async () => {
    renderWithProviders(<Ruler />);
    scrollTo(offsetForAge(20, range.min) + RULER.tick * 0.3);
    expect(changes).toEqual([]);
    // a second move straight after the first is read when the scroll comes to rest
    scrollTo(offsetForAge(20, range.min) + RULER.tick * 0.7);
    await waitFor(() => expect(changes).toEqual([21]));
  });

  it('never says an age off the ends of the ruler', () => {
    renderWithProviders(<Ruler />);
    scrollTo(1e6);
    expect(changes).toEqual([range.max]);
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe(`${range.max} years old`);
  });

  it('says an age set from outside, as a screen reader’s swipe sets one', () => {
    const view = renderWithProviders(<AgeRuler value={20} onChange={() => undefined} now={TODAY} />);
    view.rerender(<AgeRuler value={21} onChange={() => undefined} now={TODAY} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('21 years old');
    expect(screen.getByTestId('age-ruler-number').textContent).toBe('21');
  });
});
