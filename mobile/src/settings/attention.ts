import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { StandingStatus } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { pushSupported, readPermission } from '../push/device';
import { accountStanding } from '../reports/api';

/**
 * What in Settings needs action, so its row can show it: notifications blocked or never asked, and an account
 * that is limited, suspended or closed. Read whenever Settings comes into view, since either can change
 * elsewhere. Unknown counts as nothing to do, so a row never flickers.
 */
export function useSettingsAttention(): { pushOff: boolean; standing: StandingStatus | null } {
  const { client, isGuest } = useAuth();
  const [pushOff, setPushOff] = useState(false);
  const [standing, setStanding] = useState<StandingStatus | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (pushSupported()) {
        void readPermission().then((state) => {
          if (active) setPushOff(state.status === 'denied' || state.status === 'undetermined');
        });
      }
      // A guest cannot be limited and the route refuses guests, so do not ask.
      if (!isGuest) {
        void accountStanding(client).then((res) => {
          if (active && res.ok) setStanding(res.data.status);
        });
      }
      return () => {
        active = false;
      };
    }, [client, isGuest]),
  );

  return { pushOff, standing };
}
