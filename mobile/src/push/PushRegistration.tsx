import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { onPermissionGranted } from './device';
import { registerDevice, removeDevice } from './pushClient';
import { registeredPushToken, rememberPushToken, takePushToken } from './thisDevice';
import { getPushToken } from './tokenSource';

/**
 * Registers this device for push while signed in and unregisters it when the signed-in tree goes away. Renders
 * nothing and never asks for permission: it registers whenever a token is available, at sign-in, when
 * notifications are allowed, and on returning to the foreground in case they were allowed in the phone's
 * settings. Signing out and deleting the account unregister the phone themselves before the session clears
 * (sharing the token through push/thisDevice.ts). Not for guests: nothing is sent to them and the route refuses
 * them, so the phone registers once the account is claimed.
 */
export function PushRegistration(): null {
  const { client, status, isGuest, user } = useAuth();
  // A child's phone is told only the learning reminders their parent allows, so it registers only while they are.
  const childQuiet = user?.kind === 'child' && user.child?.remindersAllowed !== true;
  const { t } = useI18n();
  // Read when a token is fetched, so a language change renames the Android channel next time without re-registering.
  const channelName = useRef(t('notifications.title'));
  channelName.current = t('notifications.title');

  useEffect(() => {
    if (status !== 'signedIn' || isGuest || childQuiet) return;
    let active = true;
    const sync = () => {
      void getPushToken(channelName.current).then((device) => {
        // The same token again needs no second registration this session.
        if (!active || !device || device.token === registeredPushToken()) return;
        rememberPushToken(device.token);
        void registerDevice(client, device);
      });
    };
    sync();
    const offGranted = onPermissionGranted(sync);
    // Only while there is no token yet: fetching one is a network request, and a registered phone needs nothing
    // new on every open.
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !registeredPushToken()) sync();
    });
    return () => {
      active = false;
      offGranted();
      foreground.remove();
      const token = takePushToken();
      if (token) void removeDevice(client, token);
    };
  }, [client, status, isGuest, childQuiet]);

  return null;
}
