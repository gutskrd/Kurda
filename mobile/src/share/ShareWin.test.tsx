// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { Share } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { haptic, onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { ShareWin, shareOut } from './ShareWin';

/*
 * The quiet Share on a win: one button that hands its message to the system's
 * sheet, and does nothing else whatever becomes of it.
 */

patchReactNativeWeb({ reduceMotion: true });

const TEXT = 'I finished a Kurdish lesson on Hevalo. 🍎\nhttps://hevalo.app/win/lesson';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetHaptics();
});

describe('the Share button', () => {
  it('is one button with the word for it, and hands the whole message to the system’s sheet', () => {
    const share = vi.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    renderWithProviders(<ShareWin text={TEXT} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledTimes(1);
    // one message, its address last: a link handed over beside the words is dropped by some share targets
    expect(share.mock.calls[0]?.[0]).toEqual({ message: TEXT });
  });

  it('says nothing and asks nothing after the sheet, whether it was used or put away', async () => {
    const share = vi.spyOn(Share, 'share').mockResolvedValue({ action: 'dismissedAction' } as never);
    renderWithProviders(<ShareWin text={TEXT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await Promise.resolve();
    expect(share).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();
  });

  it('is quiet about a phone that will not open the sheet', async () => {
    vi.spyOn(Share, 'share').mockRejectedValue(new Error('no sheet'));
    expect(() => shareOut(TEXT)).not.toThrow();
    // the refusal is swallowed: nothing is left unhandled for the app to trip over
    await new Promise((r) => setTimeout(r, 0));
  });

  it('is not felt in the hand: it only opens the sheet, as the app’s other Share buttons do', () => {
    vi.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    const felt: HapticEvent[] = [];
    const stop = onHaptic((e) => felt.push(e));
    try {
      // a buzz would be heard here: this one is
      haptic('tap');
      expect(felt).toEqual(['tap']);
      resetHaptics();
      renderWithProviders(<ShareWin text={TEXT} />);
      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
      expect(felt).toEqual(['tap']);
    } finally {
      stop();
    }
  });
});
