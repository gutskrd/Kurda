import { useCallback } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { ApiError } from '../api/types';
import type { Translate } from '../api/errors';
import type { RootNavigation } from '../navigation/rootStack';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { sendErrorOf, standingExplains } from './sendErrors';

/**
 * A failed send, said in place — above a chat composer, under a form.
 *
 * Calm on purpose: a limit is not an error the person made just now, so it is
 * not red and does not shout. When the limit is a Hevalo decision with its
 * reasons written down, a link to Account standing sits beside it; when it is
 * not (a group's own mute, the automatic pause), there is nothing there to
 * read, so there is no link.
 *
 * Announced once when it appears (a live region), and dismissable.
 *
 * Inside a sheet or a dialog, pass `onNavigate` to close it first: Account
 * standing opens under a Modal, so without it the link seems to do nothing.
 */
export function SendErrorNotice({
  error,
  onDismiss,
  onNavigate,
}: {
  error: ApiError | null;
  onDismiss?: () => void;
  /** called just before Account standing opens — the sheet this sits in closes itself */
  onNavigate?: () => void;
}): React.JSX.Element | null {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const navigation = useNavigation<RootNavigation>();
  if (!error) return null;
  const { message, restriction } = sendErrorOf(error, t, locale);
  const tone = restriction ? colors.textPrimary : colors.danger;
  return (
    <View
      style={[styles.notice, { backgroundColor: restriction ? colors.controlTrack : colors.dangerFill }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View style={styles.row}>
        <Icon name={restriction ? 'shield' : 'alert'} size={18} color={restriction ? colors.textSecondary : colors.danger} />
        <Text style={[styles.text, { color: tone }]}>{message}</Text>
        {onDismiss ? (
          <Pressable
            onPress={onDismiss}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('social.close')}
            style={styles.dismiss}
          >
            <Icon name="close" size={16} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {restriction && standingExplains(restriction) ? (
        <Pressable
          onPress={() => {
            onNavigate?.();
            navigation.navigate('AccountStanding');
          }}
          accessibilityRole="link"
          style={styles.link}
        >
          <Text style={[styles.linkText, { color: colors.primary }]}>{t('restriction.seeStanding')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The same answer as an alert, for screens that already answer a failed send
 * with one (a post, a comment, a picture, a voice note, a profile change). The
 * title stays the screen's own ("Couldn't post"); the message becomes the
 * limit, with a second button to Account standing when it has the reasons.
 *
 * An upload (a picture, a voice note) has already been put into words by
 * `describeUploadFailure`; pass `{ message, limited }` from its result instead.
 */
export function useSendErrorAlert(): (title: string, error: ApiError | { message: string; limited?: boolean }) => void {
  const { t, locale } = useI18n();
  const navigation = useNavigation<RootNavigation>();
  return useCallback(
    (title: string, error: ApiError | { message: string; limited?: boolean }) => {
      const { message, standing } = alertTextOf(error, t, locale);
      if (standing) {
        Alert.alert(title, message, [
          { text: t('restriction.seeStanding'), onPress: () => navigation.navigate('AccountStanding') },
          { text: t('social.close'), style: 'cancel' },
        ]);
      } else {
        Alert.alert(title, message);
      }
    },
    [locale, navigation, t],
  );
}

/** What the alert says, and whether Account standing has the reasons. */
function alertTextOf(
  error: ApiError | { message: string; limited?: boolean },
  t: Translate,
  locale: string,
): { message: string; standing: boolean } {
  if (!('kind' in error)) return { message: error.message, standing: error.limited === true };
  const { message, restriction } = sendErrorOf(error, t, locale);
  return { message, standing: restriction !== null && standingExplains(restriction) };
}

const styles = StyleSheet.create({
  notice: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    gap: spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  text: { flex: 1, fontSize: typography.sizes.sm, lineHeight: 20 },
  dismiss: { padding: 2 },
  link: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', alignSelf: 'flex-start', paddingStart: 26 },
  linkText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
});
