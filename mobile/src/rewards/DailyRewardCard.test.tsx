// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { DailyRewardCard } from './DailyRewardCard';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const status = (claimed: boolean) => ({
  canClaim: !claimed,
  claimableDay: 3,
  reward: 15,
  schedule: [5, 10, 15, 20, 25, 30, 50],
  alreadyClaimedToday: claimed,
  cycleDay: 3,
  learnedToday: true,
});

describe('the day’s Zêr', () => {
  it('is felt as a light tap when it is claimed — once, and not as it is shown', async () => {
    let claimed = false;
    testAuth.client = fakeClient({
      'GET /rewards/daily': () => ok(status(claimed)),
      'POST /rewards/daily/claim': () => {
        claimed = true;
        return ok({ reward: 15 });
      },
    });
    const felt: HapticEvent[] = [];
    resetHaptics();
    const stop = onHaptic((e) => felt.push(e));
    try {
      renderWithProviders(<DailyRewardCard />);
      const claim = await screen.findByRole('button', { name: 'Claim 15 Zêr' });
      expect(felt).toEqual([]);
      fireEvent.click(claim);
      expect(await screen.findByLabelText('+15 Zêr claimed!')).toBeTruthy();
      await waitFor(() => expect(felt).toEqual(['tap']));
    } finally {
      stop();
    }
  });
});
