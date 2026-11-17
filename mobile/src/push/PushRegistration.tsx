import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { onPermissionGranted } from './device';
import { registerDevice, removeDevice } from './pushClient';
import { registeredPushToken, rememberPushToken, takePushToken } from './thisDevice';
import { getPushToken } from './tokenSource';

/**
 * Registers this device for push while signed in and unregisters on sign-out
 * (KUR-094). Renders nothing, and never asks for permission: it registers
 * whenever there is a token to register — at sign-in, the moment the app is
 * allowed to notify (the offer after a lesson, Settings), and on coming back
 * to the front, in case it was allowed in the phone's settings meanwhile.
 * Mounted once under the signed-in tree. Signing out and deleting the account
 * unregister the phone themselves, before the session is cleared (the token
 * they take is shared through push/thisDevice.ts); the removal here is for any
 * other way the tree goes away.
 *
 * Not for a guest: nothing is sent to a guest — no messages, invites or gifts
 * — and registering the phone is one of the routes refused to one, so the
 * phone is registered once the account is claimed, as at any sign-in.
 */
export function PushRegistration(): null {
  const { client, status, isGuest } = useAuth();
  const { t } = useI18n();
  // read when a token is fetched, so a change of language renames the Android
  // channel next time without unregistering and registering the phone
  const channelName = useRef(t('notifications.title'));
  channelName.current = t('notifications.title');

  useEffect(() => {
    if (status !== 'signedIn' || isGuest) return;
    let active = true;
    const sync = () => {
      void getPushToken(channelName.current).then((device) => {
        // the same token again needs no second registration this session
        if (!active || !device || device.token === registeredPushToken()) return;
        rememberPushToken(device.token);
        void registerDevice(client, device);
      });
    };
    sync();
    const offGranted = onPermissionGranted(sync);
    // only while there is no token yet: fetching one is a request to Expo, and
    // a phone already registered needs nothing new every time it is opened
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
  }, [client, status, isGuest]);

  return null;
}
