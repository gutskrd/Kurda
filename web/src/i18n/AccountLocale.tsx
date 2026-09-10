import { useEffect, useRef } from 'react';
import { isAppLocale } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from './I18nProvider';

/**
 * An account's language wins over the device's.
 *
 * The provider settles on a language before anyone has signed in — from what
 * this device chose last, or from the browser. Once there is an account, its
 * choice is the one the person actually made, and it should follow them onto a
 * borrowed laptop or a new phone without being asked again.
 *
 * Applied once per sign-in rather than continuously: after that, changing the
 * language in Settings sets both at once, and re-asserting the stored value on
 * every render would fight it.
 *
 * Renders nothing. It exists so the provider stays free of anything to do with
 * sessions, which would otherwise make it un-testable without an auth stack.
 */
export function AccountLocale(): null {
  const { user } = useAuth();
  const { locale, setLocale } = useI18n();
  const applied = useRef<string | null>(null);

  useEffect(() => {
    const theirs = user?.locale;
    if (!user || !isAppLocale(theirs)) {
      // signed out again: the next sign-in should re-apply
      if (!user) applied.current = null;
      return;
    }
    if (applied.current === user.id) return;
    applied.current = user.id;
    if (theirs !== locale) setLocale(theirs);
  }, [user, locale, setLocale]);

  return null;
}
