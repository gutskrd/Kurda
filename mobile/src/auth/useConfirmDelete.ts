import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from './AuthContext';
import { useKeptFamily } from '../family/overview';

/**
 * The two-step confirmation before an account is deleted, and the message after, for every place that offers it:
 * Settings, and the two screens a new account can be held at (the emailed code, the birth month). Deleting signs the
 * phone out, so the message shows over the welcome screen.
 */
export function useConfirmDelete(): () => void {
  const { deleteAccount, isGuest, user } = useAuth();
  const { t } = useI18n();
  // A sign-up that never confirmed its address is closed at once too: there is nothing on it to come back for.
  const unconfirmed = !isGuest && user?.emailVerified === false;
  // A parent's child profiles are deleted with the account, so they are named before anything is asked.
  const children = useKeptFamily()?.children.length ?? 0;
  return useCallback(() => {
    // A guest has no grace period: nobody could sign in to it again, so the server closes it at once.
    const base = isGuest ? t('settings.delete.guestWarning') : unconfirmed ? t('settings.delete.unconfirmedWarning') : t('settings.delete.warning');
    const warning = children > 0 ? `${base}\n\n${t('family.delete.withAccount', { count: children })}` : base;
    Alert.alert(t('settings.delete.confirmTitle'), warning, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.delete.confirm'),
        style: 'destructive',
        onPress: () => {
          void deleteAccount().then((result) => {
            if (!result.ok) Alert.alert(t('settings.delete.failed'), result.message);
            else if (result.graceDays > 0) Alert.alert(t('settings.delete.scheduledTitle'), t('settings.delete.scheduledBody', { days: result.graceDays }));
            else Alert.alert(isGuest ? t('settings.delete.guestDone') : t('settings.delete.doneNow'));
          });
        },
      },
    ]);
  }, [deleteAccount, isGuest, unconfirmed, children, t]);
}
