import { useEffect, useRef } from 'react';
import { isAppLocale } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from './I18nProvider';

/**
 * Applies the account's language over the device's, once per sign-in, so it follows the person to a new device;
 * Settings then changes both. Kept apart from the provider so the provider can be tested without auth.
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
