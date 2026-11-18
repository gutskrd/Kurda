// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../theme/Pressable', () => import('../testing/reach'));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { forgetReach, reachOf } from '../testing/reach';
import { PlayButton } from './parts';
import type { ClipPlayer } from './useClipPlayer';

/* The round play button's reach follows its drawn size: the regular one answers over 48 and the large one, already bigger, adds nothing. */

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  forgetReach();
});

function player(play: (src: string) => void = () => undefined): ClipPlayer {
  return { supported: true, play, isPlaying: () => false, clockFor: () => null };
}

describe('a sound’s play button', () => {
  it('reaches 2 past each edge of the regular 44, to a fingertip’s 48, and plays when tapped', () => {
    const play = vi.fn();
    renderWithProviders(<PlayButton src="https://media.test/a.wav" label="Listen" player={player(play)} />);
    expect(reachOf('Listen')).toEqual({ top: 2, bottom: 2, left: 2, right: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
    expect(play).toHaveBeenCalledWith('https://media.test/a.wav');
  });

  it('reaches no further than the large one is drawn, as it is already taller than a fingertip', () => {
    renderWithProviders(<PlayButton src="https://media.test/a.wav" label="Listen" player={player()} size="large" />);
    expect(reachOf('Listen')).toBeUndefined();
  });
});
