// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

// react-native-web drops a ScrollView's `keyboardShouldPersistTaps`, so the ScrollView is wrapped to record its props.
const seen = vi.hoisted(() => ({ scrollers: [] as Record<string, unknown>[] }));
vi.mock('react-native', async () => {
  const web = await import('react-native-web');
  const { createElement, forwardRef } = await import('react');
  const ScrollView = forwardRef<unknown, Record<string, unknown>>(function ScrollView(props, ref) {
    seen.scrollers.push(props);
    return createElement(web.ScrollView as never, { ...props, ref });
  });
  return { ...web, ScrollView };
});
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('./Pressable', () => import('../testing/reach'));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { StyleSheet } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { forgetReach, reachOf } from '../testing/reach';
import { Chips } from './Chips';

// How far each chip answers inside its scroller, which once clipped their reach so a tap between chips hit neither.

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  forgetReach();
  seen.scrollers.length = 0;
});

const OPTIONS = ['all', 'unread', 'groups'] as const;
const label = (v: string) => v[0]!.toUpperCase() + v.slice(1);

/** The props the row's scroller was last drawn with. */
function scroller(): Record<string, unknown> {
  const last = seen.scrollers[seen.scrollers.length - 1];
  if (!last) throw new Error('no scroller has been drawn');
  return last;
}

describe('how far a chip answers a finger', () => {
  it('reaches 6 up and down, to a fingertip’s 48, and half the 8pt gap to each side', () => {
    renderWithProviders(<Chips options={OPTIONS} value="all" onChange={() => undefined} labelOf={label} />);
    for (const name of ['All', 'Unread', 'Groups']) expect(reachOf(name), name).toEqual({ top: 6, bottom: 6, left: 4, right: 4 });
  });

  it('leaves the row that much room inside its scroller, and pulls the scroller back out by the same, so nothing moves', () => {
    renderWithProviders(<Chips options={OPTIONS} value="all" onChange={() => undefined} labelOf={label} />);
    const content = StyleSheet.flatten(scroller().contentContainerStyle as never) as Record<string, unknown>;
    const outer = StyleSheet.flatten(scroller().style as never) as Record<string, unknown>;
    expect(content).toMatchObject({ paddingTop: 6, paddingBottom: 6 });
    expect(outer).toMatchObject({ marginTop: -6, marginBottom: -6 });
  });

  it('reaches only as far as the room a caller leaves it', () => {
    renderWithProviders(<Chips options={OPTIONS} value="all" onChange={() => undefined} labelOf={label} room={2} />);
    expect(reachOf('Unread')).toEqual({ top: 2, bottom: 2, left: 4, right: 4 });
    expect(StyleSheet.flatten(scroller().style as never)).toMatchObject({ marginTop: -2, marginBottom: -2 });
  });

  it('is chosen at the first tap while the keyboard is up', () => {
    renderWithProviders(<Chips options={OPTIONS} value="all" onChange={() => undefined} labelOf={label} />);
    expect(scroller().keyboardShouldPersistTaps).toBe('handled');
    expect(scroller().horizontal).toBe(true);
  });

  it('still chooses the chip tapped, and says the count after its word', () => {
    const onChange = vi.fn();
    renderWithProviders(<Chips options={OPTIONS} value="all" onChange={onChange} labelOf={label} countOf={(v) => (v === 'unread' ? 3 : null)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unread, 3' }));
    expect(onChange).toHaveBeenCalledWith('unread');
    expect(reachOf('Unread, 3')).toEqual({ top: 6, bottom: 6, left: 4, right: 4 });
  });
});
