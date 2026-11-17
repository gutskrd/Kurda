import * as Notifications from 'expo-notifications';
import { letterNoticeOf, type LetterNotice } from '@kurda/shared';
import { pushSupported } from '../push/device';

/**
 * A letter's notification arriving while the app is open, read as a letter's
 * (`letterNoticeOf`). The letters window and an open correspondence listen
 * for it and read themselves again, so a bird lands there and a letter shows
 * there without the notification being tapped. Returns how to stop
 * listening; where there are no notifications (the web build), nothing is
 * heard.
 */
export function onLetterNotice(listener: (notice: LetterNotice) => void): () => void {
  if (!pushSupported()) return () => undefined;
  try {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const notice = letterNoticeOf(n.request.content.data);
      if (notice) listener(notice);
    });
    return () => sub.remove();
  } catch {
    // a binary without the module: the realtime ping still says when a letter came
    return () => undefined;
  }
}
