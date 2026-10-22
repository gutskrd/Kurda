import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { StandingStatus } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { pushSupported, readPermission } from '../push/device';
import { accountStanding } from '../reports/api';

/**
 * What in Settings wants something done, so its row can say so in gold: the
 * phone not letting notifications through (off, or never asked), and an
 * account that is limited, suspended or closed.
 *
 * Read each time Settings comes into view, since either can change away
 * from it (in the phone's own settings, or by a moderator). Until each is
 * known it is taken as nothing to do, so a row never turns gold and back.
 */
export function useSettingsAttention(): { pushOff: boolean; standing: StandingStatus | null } {
  const { client } = useAuth();
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
      void accountStanding(client).then((res) => {
        if (active && res.ok) setStanding(res.data.status);
      });
      return () => {
        active = false;
      };
    }, [client]),
  );

  return { pushOff, standing };
}
