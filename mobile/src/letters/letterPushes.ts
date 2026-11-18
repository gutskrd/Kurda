import * as Notifications from 'expo-notifications';
import { letterNoticeOf, type LetterNotice } from '@kurda/shared';
import { pushSupported } from '../push/device';

/**
 * Calls `listener` for letter notifications that arrive while the app is open (`letterNoticeOf`), so the window and
 * an open correspondence refresh without a tap. Returns an unsubscribe; does nothing where notifications are
 * unavailable (the web build).
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
    // A build without the module still hears new letters through the realtime ping.
    return () => undefined;
  }
}
