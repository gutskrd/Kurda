import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { heldDim } from '../theme/MotionParts';
import { Pressable, ReachGroup } from '../theme/Pressable';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';

/**
 * Under a message or comment the server was not reached for, as on the website: "Not sent", then Try again and
 * Cancel. Shared by chats and comment threads.
 */
export function UnsentNote({ onRetry, onDiscard, style }: { onRetry: () => void; onDiscard: () => void; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const link = (label: string, onPress: () => void, testID: string) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      reachSize={{ height: LINE }}
      testID={testID}
      style={({ pressed }) => [styles.link, pressed && heldDim]}
    >
      <Text style={[styles.linkText, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={[styles.row, { flexDirection: dir.row }, style]} accessibilityLiveRegion="polite">
      <View style={[styles.said, { flexDirection: dir.row }]}>
        <Icon name="alert" size={13} color={colors.danger} />
        <Text style={[styles.text, { color: colors.danger }]}>{t('chat.notSent')}</Text>
      </View>
      <ReachGroup gap={GAP}>
        {link(t('common.retry'), onRetry, 'unsent-retry')}
        {link(t('common.cancel'), onDiscard, 'unsent-cancel')}
      </ReachGroup>
    </View>
  );
}

/** One line of the small words. */
const LINE = 18;
const GAP = spacing.md - 4;

const styles = StyleSheet.create({
  row: { alignItems: 'center', gap: GAP, marginTop: 4 },
  said: { alignItems: 'center', gap: spacing.xs },
  text: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  link: { minHeight: LINE, justifyContent: 'center' },
  linkText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
});
