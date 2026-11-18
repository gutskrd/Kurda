// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../theme/Pressable', () => import('../testing/reach'));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { forgetReach, reachLimitOf, reachOf } from '../testing/reach';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { FriendRequestTicket } from './FriendTicket';

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  forgetReach();
  vi.restoreAllMocks();
});

interface Slop {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const slop = (name: string): Slop => ({ top: 0, bottom: 0, left: 0, right: 0, ...(reachOf(name) as Partial<Slop>) });

/** Accept and Decline on a request in the Friends list, 4 apart. */
const BETWEEN = 4;

function ticket(onAccept = vi.fn(), onDecline = vi.fn()) {
  renderWithProviders(
    <FriendRequestTicket
      compact
      person={{ userId: 'u-roj', username: 'roj' }}
      answer={null}
      onOpen={vi.fn()}
      onAccept={onAccept}
      onDecline={onDecline}
      acceptLabel="Accept roj"
      declineLabel="Decline roj"
    />,
  );
  return { onAccept, onDecline };
}

describe('a friend request in the Friends list', () => {
  it('answers a finger a little above or below Accept, which is drawn under a fingertip', () => {
    ticket();
    // Drawn 36pt, so 6pt each way up and down to 48pt; nothing across, where its width is the words'.
    expect(slop('Accept roj')).toEqual({ top: 6, bottom: 6, left: 0, right: 0 });
    expect(slop('Decline roj')).toEqual({ top: 2, bottom: 2, left: 2, right: 2 });
  });

  it('shares the 4 between Accept and Decline, so neither takes the other’s tap', () => {
    ticket();
    expect(reachLimitOf('Decline roj')).toMatchObject({ left: BETWEEN / 2, right: BETWEEN / 2 });
    expect(slop('Accept roj').right + slop('Decline roj').left).toBeLessThanOrEqual(BETWEEN);
  });

  it('still accepts and declines on a tap', () => {
    const { onAccept, onDecline } = ticket();
    fireEvent.click(screen.getByRole('button', { name: 'Accept roj' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decline roj' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDecline).toHaveBeenCalledTimes(1);
  });
});
