import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { display } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useDirection } from './direction';

/** A caring message to show: the notice as the moderators wrote it, and where help is. */
export interface CaringMessage {
  title: string;
  body: string;
  helplineUrl: string;
}

/**
 * The moderators' message to someone who may be at risk, in full, with the
 * helpline one tap away.
 *
 * In a list a notification is cut to a line or two, and this one's helpline
 * is in its second paragraph — so a tap on it opens it here (`socialDeepLink`
 * → `CaringMessage`) instead of leading nowhere. Not an alert: nothing is
 * wrong with the reader, and it says nothing they did. The words are the
 * moderators' own (their note first, then the check-in), so they keep their
 * own direction on a Soranî screen; the button is ours, in the reader's
 * language.
 *
 * Shared by the Inbox and the notification list; renders nothing when
 * `message` is null.
 */
export function CaringMessageDialog({
  message,
  onClose,
}: {
  message: CaringMessage | null;
  onClose: () => void;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  if (!message) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.scrim }]}>
        <View style={[styles.card, { backgroundColor: colors.background }]} accessibilityViewIsModal>
          <View style={[styles.mark, { backgroundColor: colors.successFill }]}>
            <Icon name="lifebuoy" size={26} color={colors.success} />
          </View>
          <Text style={[styles.title, styles.center, { color: colors.textPrimary }]} accessibilityRole="header">
            {message.title}
          </Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
            <Text style={[styles.body, dir.free, { color: colors.textPrimary }]}>{message.body}</Text>
          </ScrollView>
          <ClayButton
            label={t('report.help.find')}
            tone="success"
            size="large"
            icon="globe"
            onPress={() => void Linking.openURL(message.helplineUrl)}
            style={styles.stretch}
          />
          <Pressable onPress={onClose} accessibilityRole="button" style={styles.close}>
            <Text style={[styles.closeText, { color: colors.textSecondary }]}>{t('social.close')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { width: '100%', maxWidth: 420, maxHeight: '90%', borderRadius: radii.xl, padding: spacing.lg, gap: spacing.md },
  mark: { alignSelf: 'center', width: 56, height: 56, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  title: { ...display(typography.sizes.lg) },
  center: { textAlign: 'center' },
  scroll: { flexGrow: 0 },
  scrollBody: { paddingBottom: spacing.xs },
  body: { fontSize: typography.sizes.md, lineHeight: 22 },
  stretch: { alignSelf: 'stretch', marginTop: spacing.xs },
  close: { minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
});
