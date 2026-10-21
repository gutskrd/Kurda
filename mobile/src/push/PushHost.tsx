import { useContext, useEffect } from 'react';
import { AppState } from 'react-native';
import { NavigationContainerRefContext } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { pushSupported } from './device';
import { isConversationOnScreen, openPushTarget, pushTarget, type RouteLike } from './routing';

/** Taps already followed, so the one that opened the app is not followed twice (it can arrive by both ways). */
const followed = new Set<string>();

/** How long a tap that opened the app waits for the screens to be there to open it in. */
const READY_POLL_MS = 50;
const READY_POLLS = 100;

/**
 * What a push does once it reaches the phone (KUR-094). Renders nothing;
 * mounted once in the signed-in tree, after the screens.
 *
 * - With the app open, a push shows as a banner as it would over any other
 *   app — except one about the conversation already on screen, whose message
 *   is arriving right there (routing.ts).
 * - A tap opens what it is about, whether the app was open, in the
 *   background, or started by the tap.
 * - The number on the app's icon goes when the app is opened: whatever it
 *   counted is in the app now.
 */
export function PushHost(): null {
  const nav = useContext(NavigationContainerRefContext);
  const { client } = useAuth();

  useEffect(() => {
    if (!pushSupported()) return;
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const route = nav?.isReady() ? (nav.getCurrentRoute() as RouteLike | undefined) : undefined;
        const show = !isConversationOnScreen(notification.request.content.data, route);
        // Android shows no banner without the sound, so the two go together
        return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
      },
    });
    return () => Notifications.setNotificationHandler(null);
  }, [nav]);

  useEffect(() => {
    if (!pushSupported() || !nav) return;
    let active = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const follow = (response: Notifications.NotificationResponse, polls = 0) => {
      if (!active || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const id = response.notification.request.identifier;
      if (followed.has(id)) return;
      if (!nav.isReady()) {
        if (polls < READY_POLLS) timers.push(setTimeout(() => follow(response, polls + 1), READY_POLL_MS));
        return;
      }
      followed.add(id);
      // forgotten once followed, or signing in again later would follow it again
      try {
        Notifications.clearLastNotificationResponse();
      } catch {
        // an older native module without it: the set above still stops a repeat this run
      }
      openPushTarget(pushTarget(response.notification.request.content.data), nav as unknown as RootNavigation, client);
    };
    // the tap that started the app, from cold
    try {
      const launching = Notifications.getLastNotificationResponse();
      if (launching) follow(launching);
    } catch {
      // not available: the listener below still hears taps from here on
    }
    const taps = Notifications.addNotificationResponseReceivedListener((response) => follow(response));
    return () => {
      active = false;
      for (const timer of timers) clearTimeout(timer);
      taps.remove();
    };
  }, [nav, client]);

  useEffect(() => {
    if (!pushSupported()) return;
    const clear = () => void Notifications.setBadgeCountAsync(0).catch(() => undefined);
    clear();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') clear();
    });
    return () => foreground.remove();
  }, []);

  return null;
}
