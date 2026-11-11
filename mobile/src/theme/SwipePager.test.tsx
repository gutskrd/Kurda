// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { NEIGHBOURS_AFTER_MS, SwipePager } from './SwipePager';

patchReactNativeWeb({ reduceMotion: true });

/** jsdom lays nothing out, so the window is given a phone's width: the pager's pages are as wide until it is measured. */
const WIDTH = 390;
Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: WIDTH });
window.dispatchEvent(new Event('resize'));

const PAGES = ['one', 'two', 'three'] as const;
type Page = (typeof PAGES)[number];

/** The pager under a switch of three buttons, as a tab has it. */
function Book({ first = 'one', onTurn }: { first?: Page; onTurn?: (page: Page) => void }): React.JSX.Element {
  const [page, setPage] = useState<Page>(first);
  const turn = (next: Page): void => {
    setPage(next);
    onTurn?.(next);
  };
  return (
    <>
      {PAGES.map((p) => (
        <Pressable key={p} accessibilityRole="button" accessibilityLabel={`show ${p}`} onPress={() => turn(p)} />
      ))}
      <SwipePager pages={PAGES} value={page} onChange={turn} testID="book" renderPage={(p, active) => <Text>{`${p}${active ? ', showing' : ''}`}</Text>} />
    </>
  );
}

/** The row of pages is dragged to where `page` (from the left) fills it, as a swipe leaves it. */
function swipeTo(page: number): void {
  const row = screen.getByTestId('book');
  Object.defineProperty(row, 'scrollLeft', { configurable: true, value: page * WIDTH });
  fireEvent.scroll(row);
  // the web's scroller holds back events that come faster than a finger moves, and tells of the last one when it stops
  vi.advanceTimersByTime(150);
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('pages under a switch', () => {
  it('draws the page asked for at once and the others a moment later, hidden from a screen reader', () => {
    renderWithProviders(<Book first="two" />);
    expect(screen.getByText('two, showing')).toBeTruthy();
    expect(screen.queryByText('one')).toBeNull();
    expect(screen.queryByText('three')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(NEIGHBOURS_AFTER_MS);
    });
    expect(screen.getByText('one')).toBeTruthy();
    expect(screen.getByText('three')).toBeTruthy();
    expect(screen.getByTestId('book-one').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByTestId('book-two').getAttribute('aria-hidden')).not.toBe('true');
  });

  it('chooses the page a swipe comes to rest on', () => {
    const turned: Page[] = [];
    renderWithProviders(<Book onTurn={(p) => turned.push(p)} />);
    act(() => {
      vi.advanceTimersByTime(NEIGHBOURS_AFTER_MS);
    });
    act(() => swipeTo(1));
    expect(turned).toEqual(['two']);
    expect(screen.getByText('two, showing')).toBeTruthy();
    act(() => swipeTo(2));
    act(() => swipeTo(1));
    expect(turned).toEqual(['two', 'three', 'two']);
  });

  it('turns to the page the switch chose, and draws it if it was not yet drawn', () => {
    const turned: Page[] = [];
    renderWithProviders(<Book onTurn={(p) => turned.push(p)} />);
    fireEvent.click(screen.getByRole('button', { name: 'show three' }));
    // the tap is the only choice made: the pages passed on the way are not
    expect(turned).toEqual(['three']);
    expect(screen.getByText('three, showing')).toBeTruthy();
    expect(screen.getByTestId('book-one').getAttribute('aria-hidden')).toBe('true');
  });
});
