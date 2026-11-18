import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable, ReachReset } from '../theme/Pressable';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { SettingsRow } from '../settings/list';
import { Icon } from '../theme/Icon';
import { spacing } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { rateUrl } from './appInfo';
import { RatingBox } from './RatingBox';
import { heldDim } from '../theme/MotionParts';
import { useDirection } from '../reports/direction';

/**
 * "Send feedback" and "Rate Hevalo" in Settings → About. Send feedback opens the rating box's form (source
 * `settings`, no once-only rule). Rate Hevalo opens the store's review page, a link the user chose to follow,
 * which both stores allow, and only appears once the store addresses are in app.json.
 */
export function FeedbackSettingsRows({
  os = Platform.OS,
  storeUrls,
}: {
  os?: string;
  /** The store addresses; app.json's when left out. */
  storeUrls?: { ios?: string; android?: string };
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  // The close at the end of the line the language reads along, where a sheet's own close is.
  const dir = useDirection();
  const topInset = useScreenTopInset();
  const [open, setOpen] = useState(false);
  const store = storeUrls ? rateUrl(os, storeUrls) : rateUrl(os);

  return (
    <>
      <SettingsRow icon="chat" title={t('appFeedback.sendRow')} onPress={() => setOpen(true)} />
      {store ? (
        <SettingsRow icon="star" title={t('appFeedback.rateRow')} opens={false} onPress={() => void Linking.openURL(store).catch(() => undefined)} />
      ) : null}
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        {/* A sheet of its own, not beside the settings' controls: their groups' caps stop here. */}
        <ReachReset>
          <KeyboardAvoidingView
            style={[styles.sheet, { backgroundColor: colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={[styles.top, { flexDirection: dir.row, paddingTop: Platform.OS === 'ios' ? spacing.sm : topInset }]}>
              <Pressable
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                // Alone on its line, as a sheet's own close is: it reaches past every edge.
                reach="open"
                style={({ pressed }) => [styles.close, pressed && heldDim]}
              >
                <Icon name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {/* A fresh form every time it opens. */}
              {open ? <RatingBox source="settings" onClose={() => setOpen(false)} /> : null}
            </ScrollView>
          </KeyboardAvoidingView>
        </ReachReset>
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
