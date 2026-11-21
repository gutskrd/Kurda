import { useCallback } from 'react';
import { Alert, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { useNavigation } from '@react-navigation/native';
import type { ApiError } from '../api/types';
import { isMaintenance, type Translate } from '../api/errors';
import type { RootNavigation } from '../navigation/rootStack';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET, reachSlop } from '../a11y/a11y';
import { sendErrorOf, standingExplains } from './sendErrors';
import { useDirection } from './direction';
import { heldDim } from '../theme/MotionParts';
import { useAccountHeld } from './HeldNotice';

/** The icon's width and the gap after it: the link lines up with the words. */
const LINK_INSET = 26;

/**
 * A failed send, said in place (above a chat composer, under a form). Calm on purpose: a limit is not a mistake made
 * just now. When the limit is a Hevalo decision with written reasons, a link to Account standing sits beside it; a
 * group's own mute or the automatic pause has nothing to read, so no link. Announced once (a live region), and
 * dismissable. Inside a sheet or dialog, pass `onNavigate` to close it first, since Account standing opens under a
 * Modal.
 */
export function SendErrorNotice({
  error,
  onDismiss,
  onNavigate,
  style,
  heldShownBeside = false,
}: {
  error: ApiError | null;
  onDismiss?: () => void;
  /** Called just before Account standing opens, so the sheet this sits in closes itself. */
  onNavigate?: () => void;
  /** Where it sits: by default inset above a composer; a card's column passes its own. */
  style?: StyleProp<ViewStyle>;
  /** The composer this answers turns into the held notice once the account is known held, so saying it here would repeat it. */
  heldShownBeside?: boolean;
}): React.JSX.Element | null {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const navigation = useNavigation<RootNavigation>();
  const dir = useDirection();
  const held = useAccountHeld();
  if (!error) return null;
  const { message, restriction } = sendErrorOf(error, t, locale);
  if (heldShownBeside && held && restriction?.kind === 'held') return null;
  const tone = restriction ? colors.textPrimary : colors.danger;
  return (
    <View
      style={[styles.notice, { backgroundColor: restriction ? colors.controlTrack : colors.dangerFill }, style]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View style={[styles.row, { flexDirection: dir.row }]}>
        <Icon name={restriction ? 'shield' : 'alert'} size={18} color={restriction ? colors.textSecondary : colors.danger} />
        <Text style={[styles.text, dir.text, { color: tone }]}>{message}</Text>
        {onDismiss ? (
          <Pressable
            onPress={onDismiss}
            hitSlop={DISMISS_REACH}
            accessibilityRole="button"
            accessibilityLabel={t('social.close')}
            style={({ pressed }) => [styles.dismiss, pressed && heldDim]}
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
          // Under the words, past the icon, on the side they start from.
          style={({ pressed }) => [styles.link, dir.rtl ? { alignSelf: 'flex-end', paddingRight: LINK_INSET } : { paddingLeft: LINK_INSET }, pressed && heldDim]}
        >
          <Text style={[styles.linkText, { color: colors.primary }]}>{t('restriction.seeStanding')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The same answer as an alert, for screens that already answer a failed send with one (a post, a comment, a picture, a
 * voice note, a profile change): the screen's own title, the limit as the message, and an Account standing button when
 * it has the reasons. For an upload already put into words by `describeUploadFailure`, pass `{ message, limited }`.
 */
export function useSendErrorAlert(): (title: string, error: ApiError | { message: string; limited?: boolean }) => void {
  const { t, locale } = useI18n();
  const navigation = useNavigation<RootNavigation>();
  return useCallback(
    (title: string, error: ApiError | { message: string; limited?: boolean }) => {
      // Hevalo being offline is shown by the screen over the app, not an alert on top of it.
      if ('kind' in error && isMaintenance(error)) return;
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

/** The close cross is drawn this big: the glyph and the 2pt round it. */
const DISMISS_SIZE = 16 + 2 * 2;

/**
 * It answers over 48pt every way but up, where it stops half a gap past the notice's top padding: the other half of the
 * 8pt gap above belongs to the control there.
 */
const DISMISS_REACH = reachSlop(DISMISS_SIZE, DISMISS_SIZE, { limit: { top: spacing.sm + spacing.sm / 2 } });

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
  text: { flex: 1, fontSize: typography.sizes.text, lineHeight: 20 },
  dismiss: { padding: 2 },
  link: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
});
