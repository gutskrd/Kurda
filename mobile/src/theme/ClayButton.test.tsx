// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('./Pressable', () => import('../testing/reach'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { forgetReach, reachOf } from '../testing/reach';
import { ClayButton } from './glass';
import { ReachGroup } from './Pressable';

/*
 * The app's button (theme/glass.tsx): what it does when its label is longer
 * than its room, and which side its icon is on. Both were found on screens:
 * a label ran out past the button's edge in German, and in Soranî an icon
 * stood after the word it belongs before.
 */

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  forgetReach();
  localStorage.removeItem('kurda_locale_v1');
});

/** The pill a button draws: the row its icon, label and badge stand in. */
function pill(button: HTMLElement): HTMLElement {
  return button.firstElementChild as HTMLElement;
}

describe('the app’s button', () => {
  it('lets a label longer than its room go on to a second line inside it, centred', () => {
    renderWithProviders(<ClayButton label="Learn colours, numbers, days and months" onPress={() => undefined} />);
    const label = screen.getByText('Learn colours, numbers, days and months');
    // a label that may not shrink is as wide as its words, and runs out of a button narrower than them
    expect(getComputedStyle(label).flexShrink).toBe('1');
    expect(getComputedStyle(label).textAlign).toBe('center');
  });

  it('puts its icon before its label, on the side the language starts from', async () => {
    renderWithProviders(<ClayButton label="Share" icon="share" badge="3" onPress={() => undefined} />);
    await act(async () => undefined);
    const row = pill(screen.getByRole('button', { name: 'Share' }));
    expect(getComputedStyle(row).flexDirection).toBe('row');
    // the icon first, then the word, then the count that closes it
    expect(row.children).toHaveLength(3);
    expect(row.children[1]!.textContent).toBe('Share');
    expect(row.children[2]!.textContent).toBe('3');
  });

  it('mirrors itself for a language read from the right: the icon on the right, the count on the left', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    renderWithProviders(<ClayButton label="هاوبەشکردن" icon="share" badge="3" onPress={() => undefined} testID="go" />);
    await act(async () => undefined);
    const row = pill(screen.getByTestId('go'));
    // the same order in the markup, laid out from the other side
    expect(getComputedStyle(row).flexDirection).toBe('row-reverse');
    expect(row.children[1]!.textContent).toBe('هاوبەشکردن');
  });

  it('keeps its press, and gives it up while it is busy or has nothing to do', () => {
    const onPress = vi.fn();
    renderWithProviders(
      <>
        <ClayButton label="Go" onPress={onPress} />
        <ClayButton label="Wait" busy onPress={onPress} />
        <ClayButton label="Not yet" disabled onPress={onPress} />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    fireEvent.click(screen.getByRole('button', { name: 'Wait' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not yet' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    for (const name of ['Wait', 'Not yet']) expect(screen.getByRole('button', { name }).getAttribute('aria-disabled'), name).toBe('true');
  });
});

describe('how far the app’s button answers a finger', () => {
  it('reaches 2 past the top and bottom of a regular pill, to a fingertip’s 48, and nothing sideways', () => {
    renderWithProviders(<ClayButton label="Save" onPress={() => undefined} />);
    expect(reachOf('Save')).toEqual({ top: 2, bottom: 2, left: 0, right: 0 });
  });

  it('reaches nothing more from a large one, which is already 50 tall', () => {
    renderWithProviders(<ClayButton label="Continue" size="large" onPress={() => undefined} />);
    expect(reachOf('Continue')).toBeUndefined();
  });

  it('reaches 8 past every edge when it stands alone', () => {
    renderWithProviders(<ClayButton label="Try again" reach="open" onPress={() => undefined} />);
    expect(reachOf('Try again')).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
  });

  it('keeps the same reach while it is busy or disabled, so its parent never has to lay out again for it', () => {
    renderWithProviders(
      <>
        <ClayButton label="Wait" busy onPress={() => undefined} />
        <ClayButton label="Not yet" disabled onPress={() => undefined} />
      </>,
    );
    expect(reachOf('Wait')).toEqual({ top: 2, bottom: 2, left: 0, right: 0 });
    expect(reachOf('Not yet')).toEqual({ top: 2, bottom: 2, left: 0, right: 0 });
  });

  it('shares a gap with the buttons round it inside a group', () => {
    renderWithProviders(
      <ReachGroup gap={8} rowGap={2}>
        <ClayButton label="Accept" reach="open" onPress={() => undefined} />
      </ReachGroup>,
    );
    expect(reachOf('Accept')).toEqual({ top: 1, bottom: 1, left: 4, right: 4 });
  });
});
