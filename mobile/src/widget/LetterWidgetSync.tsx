import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { pushSupported } from '../push/device';
import { reloadLetterWidget } from './reload';
import { ensureWidgetToken, forgetWidgetToken } from './tokens';

/**
 * Keeps the home-screen letter widget in step with the app. Renders nothing;
 * mounted once under the account (App.tsx), outside the screens, so a sign-out
 * is heard however it happens — from Settings, a session that ran out, an
 * account deleted.
 *
 * - Signed in with an account that can have pen pals: the widget has a token
 *   (tokens.ts), in the app's language, and is asked to show what is new.
 * - Signed out, or a guest: the token is taken away from the server and the
 *   phone, and the widget says to open Hevalo.
 * - A letter arriving while the app is open (its notification shown, or
 *   tapped): the widget is asked to reload, so it is waiting there when the
 *   app is closed. With the app closed the widget asks for itself, at the time
 *   its last feed gave.
 * - Back to the front: a token the widget found refused is replaced, and the
 *   widget reloads — at most every ten minutes, since nothing is new most times.
 */

/** How often coming back to the app may reload the widget. */
const FRONT_RELOAD_MS = 10 * 60_000;

/** A notification about a pen pal's letter (api letters/service.ts sends `kind: 'letter'`). */
export function isLetterNotice(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as { kind?: unknown }).kind === 'letter';
}

export function LetterWidgetSync(): null {
  const { client, status, isGuest, user, baseUrl } = useAuth();
  const { locale } = useI18n();
  // a guest has no pen pals, and an address not yet confirmed has no letters to show
  const withLetters = status === 'signedIn' && !isGuest && user !== null && user.emailVerified !== false;

  useEffect(() => {
    if (status === 'restoring') return;
    if (withLetters) void ensureWidgetToken({ client, apiBase: baseUrl, locale });
    else void forgetWidgetToken();
  }, [status, withLetters, client, baseUrl, locale]);

  useEffect(() => {
    if (!withLetters) return;
    const front = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void ensureWidgetToken({ client, apiBase: baseUrl, locale }).then((outcome) => {
        // a token just made has reloaded the widget already
        if (outcome === 'kept') reloadLetterWidget({ unlessWithinMs: FRONT_RELOAD_MS });
      });
    });
    return () => front.remove();
  }, [withLetters, client, baseUrl, locale]);

  useEffect(() => {
    if (!withLetters || !pushSupported()) return;
    const letterCame = (data: unknown): void => {
      if (isLetterNotice(data)) reloadLetterWidget();
    };
    const shown = Notifications.addNotificationReceivedListener((n) => letterCame(n.request.content.data));
    const tapped = Notifications.addNotificationResponseReceivedListener((r) => letterCame(r.notification.request.content.data));
    return () => {
      shown.remove();
      tapped.remove();
    };
  }, [withLetters]);

  return null;
}
