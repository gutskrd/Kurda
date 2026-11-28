import { StyleSheet, Text, View } from 'react-native';
import { timeLabel } from '../chat/thread';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

/**
 * A one-tap thanks for a gift, drawn as a quiet line across the thread with a heart, as on the website, so it never
 * reads as words someone typed: "Rojda said thanks for Gul", or "You said thanks for Gul". A thanks from before the
 * app knew its gift names the gift plainly. Like a bubble, it says its time only to screen readers, so the line stays on
 * one row.
 */
export function ThanksLine({ mine, name, gift, at }: { mine: boolean; name: string; gift: string | null; at: string }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const what = gift ?? t('gift.thanksLine.theGift');
  const words = mine ? t('gift.thanksLine.mine', { gift: what }) : t('gift.thanksLine.theirs', { name, gift: what });
  const time = timeLabel(at, locale);
  return (
    <View style={styles.wrap} accessible accessibilityLabel={time ? `${words}, ${time}` : words} testID="thanks-line">
      <View style={[styles.line, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}>
        <View style={[styles.mark, { backgroundColor: colors.surface }]}>
          <Icon name="heart-fill" size={13} color={colors.goldText} />
        </View>
        <Text style={[styles.words, dir.text, { color: colors.textSecondary }]}>{words}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginVertical: spacing.sm, paddingHorizontal: spacing.md },
  line: { alignItems: 'center', gap: spacing.sm, maxWidth: '100%', paddingVertical: 4, paddingStart: 4, paddingEnd: spacing.md, borderRadius: radii.pill },
  mark: { width: 24, height: 24, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  words: { flexShrink: 1, fontSize: typography.sizes.text },
});
