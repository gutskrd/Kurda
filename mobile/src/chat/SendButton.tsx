import { Pressable, StyleSheet, Text } from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

/**
 * The composer's Send, the same in a chat with one friend and in a club's
 * thread: a filled button once there is something to send, a quiet one
 * before. It was a filled button in one and coloured words in the other, for
 * the same job one screen apart.
 *
 * Empty, it is disabled and says so to a screen reader, rather than taking
 * the tap and doing nothing with it.
 */
export function SendButton({ ready, onPress }: { ready: boolean; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Pressable
      onPress={onPress}
      disabled={!ready}
      accessibilityRole="button"
      accessibilityLabel={t('chat.send')}
      accessibilityState={{ disabled: !ready }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: ready ? colors.primary : colors.controlTrack, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={[styles.label, { color: ready ? colors.textOnPrimary : colors.textSecondary }]} numberOfLines={1}>
        {t('chat.send')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.md },
  label: { fontSize: typography.ios.button, fontWeight: typography.weights.semibold },
});
