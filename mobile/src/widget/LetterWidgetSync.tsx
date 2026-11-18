import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { letterNoticeOf } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { pushSupported } from '../push/device';
import { reloadLetterWidget } from './reload';
import { ensureWidgetToken, forgetWidgetToken } from './tokens';
import { forgetLetterDrafts } from '../letters/drafts';

/**
 * Keeps the home-screen letter widget in step with the account. Renders nothing; mounted once under the account
 * (App.tsx) so every kind of sign-out is noticed. Signed in with pen pals, the widget gets a token (tokens.ts)
 * and reloads; signed out or a guest, the token is revoked and the widget says to open Hevalo, and unfinished
 * letter drafts are discarded (letters/drafts.ts). A letter notice while the app is open reloads the widget;
 * returning to the foreground replaces a refused token and reloads at most every ten minutes.
 */

/** How often coming back to the app may reload the widget. */
const FRONT_RELOAD_MS = 10 * 60_000;

/** A letter notification: a pen pal's, or your own bird home with an answer (api letters/service.ts sends `kind: 'letter'`). */
export function isLetterNotice(data: unknown): boolean {
  return letterNoticeOf(data) !== null;
}

export function LetterWidgetSync(): null {
  const { client, status, isGuest, user, baseUrl } = useAuth();
  const { locale } = useI18n();
  // A guest has no pen pals, and an address not yet confirmed has no letters to show.
  const withLetters = status === 'signedIn' && !isGuest && user !== null && user.emailVerified !== false;

  useEffect(() => {
    if (status === 'restoring') return;
    if (withLetters) void ensureWidgetToken({ client, apiBase: baseUrl, locale });
    else void forgetWidgetToken();
  }, [status, withLetters, client, baseUrl, locale]);

  useEffect(() => {
    if (status === 'signedOut') void forgetLetterDrafts();
  }, [status]);

  useEffect(() => {
    if (!withLetters) return;
    const front = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void ensureWidgetToken({ client, apiBase: baseUrl, locale }).then((outcome) => {
        // A token just made has reloaded the widget already.
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
