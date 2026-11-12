// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
import { cleanup, render, waitFor } from '@testing-library/react';
import { gameEmblemLayers } from '@kurda/shared';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { GameArt } from './GameArt';

afterEach(cleanup);

describe('a game’s emblem on the phone', () => {
  it('is one still picture unless it is asked to move', () => {
    patchReactNativeWeb({ reduceMotion: false });
    const { container } = render(<GameArt game="peyvok" size={76} />);
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('is laid out in its layers when it moves, every one drawn once', async () => {
    patchReactNativeWeb({ reduceMotion: false });
    const { container } = render(<GameArt game="detective" size={120} moving />);
    const layers = gameEmblemLayers({ game: 'detective', size: 120 });
    await waitFor(() => expect(container.querySelectorAll('svg')).toHaveLength(layers.length));
  });

  it('stays still with Reduce Motion on, whatever the screen asks', async () => {
    patchReactNativeWeb({ reduceMotion: true });
    const { container } = render(<GameArt game="detective" size={120} moving />);
    // the setting is read after the first frame: once it has been, there is one picture and no layers
    await waitFor(() => expect(container.querySelectorAll('svg')).toHaveLength(1));
  });
});
