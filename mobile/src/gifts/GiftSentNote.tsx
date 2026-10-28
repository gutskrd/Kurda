import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useDirection } from '../reports/direction';

/**
 * After a gift from the shop: where it went.
 *
 * A gift given from the shop is posted into the chat with that friend like
 * any other (the API does it), so the shop says so and offers the way there,
 * instead of an alert that said it was "on its way" to nowhere in particular.
 */
export function GiftSentNote({
  itemName,
  to,
  onOpenChat,
  onDismiss,
}: {
  itemName: string;
  to: string;
  onOpenChat: () => void;
  onDismiss: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View
        style={[styles.note, { backgroundColor: colors.background, borderColor: colors.gold, shadowColor: colors.softShadow }]}
        accessibilityLiveRegion="polite"
        accessibilityRole="summary"
      >
        <View style={[styles.row, { flexDirection: dir.row }]}>
          <Icon name="gift" size={22} color={colors.gold} />
          <View style={styles.text}>
            <Text style={[styles.title, dir.text, { color: colors.textPrimary }]}>{t('gift.sent', { name: to })}</Text>
            <Text style={[styles.body, dir.text, { color: colors.textSecondary }]}>
              {itemName} · {t('gift.shop.inChat', { name: to })}
            </Text>
          </View>
          <Pressable onPress={onDismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('social.close')} style={styles.close}>
            <Icon name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
        <PressableScale
          onPress={onOpenChat}
          accessibilityRole="button"
          style={[styles.open, { backgroundColor: colors.primary }]}
        >
          <Icon name="chat" size={16} color={colors.textOnPrimary} />
          <Text style={[styles.openText, { color: colors.textOnPrimary }]}>{t('gift.shop.openChat')}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.xl, alignItems: 'center' },
  note: {
    width: '100%',
    maxWidth: 520,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    gap: spacing.sm,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  row: { alignItems: 'flex-start', gap: spacing.sm },
  text: { flex: 1, gap: 2 },
  title: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  body: { fontSize: typography.sizes.sm },
  close: { padding: 4 },
  open: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
  },
  openText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
});
