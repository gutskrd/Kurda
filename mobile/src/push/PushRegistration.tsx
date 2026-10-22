import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { onPermissionGranted } from './device';
import { registerDevice, removeDevice } from './pushClient';
import { getPushToken } from './tokenSource';

/**
 * Registers this device for push while signed in and unregisters on sign-out
 * (KUR-094). Renders nothing, and never asks for permission: it registers
 * whenever there is a token to register — at sign-in, the moment the app is
 * allowed to notify (the offer after a lesson, Settings), and on coming back
 * to the front, in case it was allowed in the phone's settings meanwhile.
 * Mounted once under the signed-in tree.
 */
export function PushRegistration(): null {
  const { client, status } = useAuth();
  const { t } = useI18n();
  const tokenRef = useRef<string | null>(null);
  // read when a token is fetched, so a change of language renames the Android
  // channel next time without unregistering and registering the phone
  const channelName = useRef(t('notifications.title'));
  channelName.current = t('notifications.title');

  useEffect(() => {
    if (status !== 'signedIn') return;
    let active = true;
    const sync = () => {
      void getPushToken(channelName.current).then((device) => {
        // the same token again needs no second registration this session
        if (!active || !device || device.token === tokenRef.current) return;
        tokenRef.current = device.token;
        void registerDevice(client, device);
      });
    };
    sync();
    const offGranted = onPermissionGranted(sync);
    // only while there is no token yet: fetching one is a request to Expo, and
    // a phone already registered needs nothing new every time it is opened
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
  }, [client, status]);

  return null;
}
