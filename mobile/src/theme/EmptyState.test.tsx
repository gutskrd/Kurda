// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('./Pressable', () => import('../testing/reach'));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { forgetReach, reachOf } from '../testing/reach';
import { EmptyState } from './EmptyState';
import { ErrorRetry } from './glass';

/*
 * What a screen says when it has nothing to show (theme/EmptyState.tsx): its
 * ways out stand alone on an empty screen, so they reach past their edges,
 * and the two of them share the gap between them.
 */

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  forgetReach();
});

describe('how far an empty screen’s ways out answer a finger', () => {
  it('lets both reach 8 to the sides and half the 8pt gap between them up and down', () => {
    const find = vi.fn();
    const write = vi.fn();
    renderWithProviders(<EmptyState title="Nothing here yet" action={{ label: 'Find people', onPress: find }} secondary={{ label: 'Write something', onPress: write }} />);
    expect(reachOf('Find people')).toEqual({ top: 4, bottom: 4, left: 8, right: 8 });
    expect(reachOf('Write something')).toEqual({ top: 4, bottom: 4, left: 8, right: 8 });
    fireEvent.click(screen.getByRole('button', { name: 'Find people' }));
    fireEvent.click(screen.getByRole('button', { name: 'Write something' }));
    expect(find).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('gives a screen that could not load the same reach on its Try again', () => {
    renderWithProviders(<ErrorRetry onRetry={() => undefined} />);
    const retry = screen.getByRole('button');
    expect(reachOf(retry.getAttribute('aria-label')!)).toEqual({ top: 4, bottom: 4, left: 8, right: 8 });
  });
});
