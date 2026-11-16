// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, screen } from '@testing-library/react';
import { GAME_EMBLEMS } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { stampSize } from '@kurda/shared';
import { GameStamp } from './GameStamp';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

describe('a stamp’s sizes', () => {
  it('gives every stamp of one width the same height, whatever is written on it', () => {
    const a = stampSize(170);
    expect(a.art).toBe(170 - a.pad * 2);
    expect(a.height).toBeGreaterThan(a.art + a.pad);
    expect(stampSize(170)).toEqual(a);
  });

  it('gives the stamp put forward more room for its larger words', () => {
    expect(stampSize(228, true).height - stampSize(228).height).toBeGreaterThan(0);
  });

  it('grows with the reader’s text size, and never shrinks under the usual one', () => {
    expect(stampSize(170, false, 1.3).height).toBeGreaterThan(stampSize(170).height);
    expect(stampSize(170, false, 0.8).height).toBe(stampSize(170).height);
    // the cover keeps its size: it is the words that need the room
    expect(stampSize(170, false, 1.3).art).toBe(stampSize(170).art);
  });

  it('keeps a margin inside the perforations however narrow the stamp', () => {
    expect(stampSize(100).pad).toBe(14);
    expect(stampSize(60).art).toBeGreaterThanOrEqual(0);
  });
});

describe('a game’s stamp', () => {
  it('shows the game’s name and what it means under it', () => {
    renderWithProviders(<GameStamp game="race" name="Pêşbaziya Nivîsandinê" meaning="Typing race" width={170} />);
    expect(screen.getByText('Pêşbaziya Nivîsandinê')).toBeTruthy();
    expect(screen.getByText('Typing race')).toBeTruthy();
    // a picture, not a control: whoever shows it is the thing that is pressed
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('leaves out the meaning where the name says it already', () => {
    renderWithProviders(<GameStamp game="peyvok" name="Peyvok" width={170} />);
    expect(screen.getAllByText('Peyvok')).toHaveLength(1);
  });

  it('draws for every game, by day and large', () => {
    for (const game of GAME_EMBLEMS) {
      renderWithProviders(<GameStamp game={game} name={game} width={228} large />);
      expect(screen.getByText(game)).toBeTruthy();
      cleanup();
    }
  });
});
