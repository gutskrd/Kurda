import { Pressable, StyleSheet, View, type TextStyle } from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

/** The filled circle the arrow sits in, inside the 44pt touch. */
const DISC = 34;

/**
 * The message field, the same in a chat with one friend and in a club's
 * thread: rounded, 44pt tall on one line with the text in the middle of it,
 * growing upwards to five lines or so as a long message is written.
 *
 * The line height and the padding above and below it add up to the 44, so
 * the placeholder sits in the middle rather than at the top of a box taller
 * than its text.
 */
export const COMPOSER_FIELD: TextStyle = {
  minHeight: MIN_TOUCH_TARGET,
  maxHeight: 120,
  flex: 1,
  borderRadius: radii.xl,
  paddingHorizontal: spacing.md,
  paddingTop: 11,
  paddingBottom: 11,
  fontSize: typography.sizes.md,
  lineHeight: 22,
  textAlignVertical: 'center',
};

/**
 * The composer's Send, the same in both: an arrow in a filled circle once
 * there is something to send, a faint arrow before — the shape every
 * message field has, so nobody has to look for it.
 *
 * Empty, it is disabled and says so to a screen reader, rather than taking
 * the tap and doing nothing with it. The arrow points the way the text runs.
 */
export function SendButton({ ready, onPress }: { ready: boolean; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <Pressable
      onPress={onPress}
      disabled={!ready}
      accessibilityRole="button"
      accessibilityLabel={t('chat.send')}
      accessibilityState={{ disabled: !ready }}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.disc, { backgroundColor: ready ? colors.primary : 'transparent' }]}>
        <View style={dir.rtl ? dir.flip : null}>
          <Icon name="send" size={18} color={ready ? colors.textOnPrimary : colors.textSecondary} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  disc: { width: DISC, height: DISC, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
