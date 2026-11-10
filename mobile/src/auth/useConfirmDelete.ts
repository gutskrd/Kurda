import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from './AuthContext';

/**
 * Asking twice before an account is deleted, and saying what happened after.
 *
 * One confirmation for every place the app offers to delete an account:
 * Settings, and the two screens a new account can be held at before it is
 * usable (the emailed code, the birth month). Somebody who signed up and
 * thought better of it at either of those could only sign out, which left the
 * account, and the address it was made with, on the server; deleting an
 * account has to be possible from wherever the app has one open.
 *
 * Deleting signs the phone out, so what follows is said over the welcome
 * screen: leaving without a word reads as the app having crashed.
 */
export function useConfirmDelete(): () => void {
  const { deleteAccount, isGuest } = useAuth();
  const { t } = useI18n();
  return useCallback(() => {
    // a guest has no grace period: nobody could sign in to it again, so the server closes it at once
    Alert.alert(t('settings.delete.confirmTitle'), isGuest ? t('settings.delete.guestWarning') : t('settings.delete.warning'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.delete.confirm'),
        style: 'destructive',
        onPress: () => {
          void deleteAccount().then((result) => {
            if (!result.ok) Alert.alert(t('settings.delete.failed'), result.message);
            else if (result.graceDays > 0) Alert.alert(t('settings.delete.scheduledTitle'), t('settings.delete.scheduledBody', { days: result.graceDays }));
            else Alert.alert(t('settings.delete.guestDone'));
          });
        },
      },
    ]);
  }, [deleteAccount, isGuest, t]);
}
