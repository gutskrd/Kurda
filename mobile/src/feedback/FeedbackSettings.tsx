import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { GlassCard, GlassRow } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { spacing } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { rateUrl } from './appInfo';
import { RatingBox } from './RatingBox';

/**
 * "Send feedback" and "Rate Hevalo", in Settings → About.
 *
 * Send feedback opens the rating box's own form whenever wanted (source
 * `settings`, no once-only rule). Rate Hevalo opens the store page at its
 * reviews — a link somebody chose to follow, which both stores allow, unlike a
 * prompt the app puts up itself — and is only there once the store addresses
 * are in app.json.
 */
export function FeedbackSettingsRows({
  os = Platform.OS,
  storeUrls,
}: {
  os?: string;
  /** the store addresses; app.json's when left out */
  storeUrls?: { ios?: string; android?: string };
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const topInset = useScreenTopInset();
  const [open, setOpen] = useState(false);
  const store = storeUrls ? rateUrl(os, storeUrls) : rateUrl(os);

  return (
    <>
      <GlassCard padding="tight">
        <GlassRow icon="chat" title={t('appFeedback.sendRow')} onPress={() => setOpen(true)} />
        {store ? (
          <GlassRow icon="star" title={t('appFeedback.rateRow')} onPress={() => void Linking.openURL(store).catch(() => undefined)} />
        ) : null}
      </GlassCard>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          style={[styles.sheet, { backgroundColor: colors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.top, { paddingTop: Platform.OS === 'ios' ? spacing.sm : topInset }]}>
            <Pressable
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              style={styles.close}
            >
              <Icon name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {/* a fresh form every time it opens */}
            {open ? <RatingBox source="settings" onClose={() => setOpen(false)} /> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.md },
  close: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 520, width: '100%', alignSelf: 'center' },
});
