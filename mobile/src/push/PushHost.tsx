import { useContext, useEffect } from 'react';
import { AppState } from 'react-native';
import { NavigationContainerRefContext } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../auth/AuthContext';
import { useUnread } from '../messages/unread';
import { announceArrival, arrivalsShown, toastsInApp } from '../notifications/arrivals';
import type { RootNavigation } from '../navigation/rootStack';
import { pushSupported } from './device';
import { isConversationOnScreen, openPushTarget, pushTarget, type RouteLike } from './routing';

/** Taps already followed, so the one that opened the app is not followed twice (it can arrive both ways). */
const followed = new Set<string>();

/** How long a tap that opened the app waits for the screens to be there to open it in. */
const READY_POLL_MS = 50;
const READY_POLLS = 100;

/**
 * What a push does once it reaches the phone. Renders nothing; mounted once in the signed-in tree, after the
 * screens.
 *
 * - With the app open, a push shows as Hevalo's own toast at the top (notifications/ArrivalToasts.tsx), or as the
 *   system's banner for a kind with an in-app moment of its own; never one about the conversation on screen
 *   (routing.ts). Either way the bell's count is read again.
 * - A tap opens what it is about, whether the app was open, backgrounded or launched by the tap.
 * - The app icon badge clears when the app opens.
 */
export function PushHost(): null {
  const nav = useContext(NavigationContainerRefContext);
  const { client } = useAuth();
  const { refresh } = useUnread();

  useEffect(() => {
    if (!pushSupported()) return;
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const { content } = notification.request;
        const route = nav?.isReady() ? (nav.getCurrentRoute() as RouteLike | undefined) : undefined;
        const show = !isConversationOnScreen(content.data, route);
        refresh({ soon: true });
        if (show && arrivalsShown() && toastsInApp(content.data)) {
          announceArrival({ id: notification.request.identifier, title: content.title ?? '', body: content.body ?? '', data: content.data ?? {} });
          // Kept in the list to find later; the toast is its banner.
          return { shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
        }
        // Android shows no banner without the sound, so the two go together.
        return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
      },
    });
    return () => Notifications.setNotificationHandler(null);
  }, [nav, refresh]);

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
      // Forgotten once followed, or signing in again later would follow it again.
      try {
        Notifications.clearLastNotificationResponse();
      } catch {
        // An older native module without it: the set above still stops a repeat this run.
      }
      openPushTarget(pushTarget(response.notification.request.content.data), nav as unknown as RootNavigation, client);
    };
    // The tap that started the app, from cold.
    try {
      const launching = Notifications.getLastNotificationResponse();
      if (launching) follow(launching);
    } catch {
      // Not available: the listener below still hears taps from here on.
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
