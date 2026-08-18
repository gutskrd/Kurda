import { Alert } from 'react-native';
import { describeError } from '../api/errors';
import type { ApiResult } from '../api/types';

/**
 * Confirm and fire a moderation report, then surface the outcome (KUR-292).
 * Cross-platform (a two-button Alert), so it works on iOS + Android. The report
 * feeds the unified moderation queue where a human reviews it.
 */
export function confirmReport(what: string, run: () => Promise<ApiResult<unknown>>): void {
  Alert.alert(`Report this ${what}?`, 'Our moderators will review it.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Report',
      style: 'destructive',
      onPress: async () => {
        const res = await run();
        if (res.ok) Alert.alert('Reported', 'Thanks — this has been sent for review.');
        else Alert.alert('Couldn’t report', describeError(res.error).message);
      },
    },
  ]);
}
