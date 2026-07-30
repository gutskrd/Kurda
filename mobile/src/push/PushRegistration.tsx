import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { registerDevice, removeDevice } from './pushClient';
import { getPushToken } from './tokenSource';

/**
 * Registers this device for push while signed in and unregisters on sign-out
 * (KUR-094). Renders nothing. A no-op until the native token source is wired,
 * but the lifecycle is in place so enabling push is a single follow-up. Mounted
 * once under the signed-in tree.
 */
export function PushRegistration(): null {
  const { client, status } = useAuth();
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'signedIn') return;
    let active = true;
    void getPushToken().then((device) => {
      if (!active || !device) return;
      tokenRef.current = device.token;
      void registerDevice(client, device);
    });
    return () => {
      active = false;
      const token = tokenRef.current;
      if (token) {
        tokenRef.current = null;
        void removeDevice(client, token);
      }
    };
  }, [client, status]);

  return null;
}
