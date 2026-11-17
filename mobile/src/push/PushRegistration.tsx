import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { onPermissionGranted } from './device';
import { registerDevice, removeDevice } from './pushClient';
import { getPushToken } from './tokenSource';

/**
 * Registers this device for push while signed in and unregisters on sign-out. Renders nothing and never asks for
 * permission: it registers whenever a token is available, at sign-in, when notifications are allowed, and on
 * returning to the foreground in case they were allowed in the phone's settings. Mounted once under the signed-in
 * tree.
 *
 * Not for guests: nothing is sent to them and the registration route refuses them, so the phone registers once
 * the account is claimed.
 */
export function PushRegistration(): null {
  const { client, status, isGuest } = useAuth();
  const { t } = useI18n();
  const tokenRef = useRef<string | null>(null);
  // Read when a token is fetched, so a language change renames the Android channel next time without re-registering.
  const channelName = useRef(t('notifications.title'));
  channelName.current = t('notifications.title');

  useEffect(() => {
    if (status !== 'signedIn' || isGuest) return;
    let active = true;
    const sync = () => {
      void getPushToken(channelName.current).then((device) => {
        // The same token again needs no second registration this session.
        if (!active || !device || device.token === tokenRef.current) return;
        tokenRef.current = device.token;
        void registerDevice(client, device);
      });
    };
    sync();
    const offGranted = onPermissionGranted(sync);
    // Only while there is no token yet: fetching one is a network request, and a registered phone needs nothing
    // new on every open.
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !tokenRef.current) sync();
    });
    return () => {
      active = false;
      offGranted();
      foreground.remove();
      const token = tokenRef.current;
      if (token) {
        tokenRef.current = null;
        void removeDevice(client, token);
      }
    };
  }, [client, status, isGuest]);

  return null;
}
