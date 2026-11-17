import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useAuth } from '../auth/AuthContext';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { useI18n } from '../i18n/I18nContext';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';
import { useDirection } from '../reports/direction';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { openPhoneSettings, readPermission } from './device';
import { minorStatus, readOfferRecord, saveOfferShown, settingsAction, shouldNudgeReminders } from './permission';
import { pressedDim } from '../theme/motion';

/** Hevalo's head, at the size of the line beside him. */
const HEVALO = 40;

/**
 * A slim banner at the top of Learn once reminders have been turned down for
 * good: Hevalo, one line saying what they are for, a button that opens the
 * app's page in the phone's settings, where that answer is changed, and a ✕.
 *
 * It is there only when the phone will not ask again, and it cannot bring up
 * the phone's question itself: it has no way to ask. A banner with a button
 * and a ✕ in front of that question would be the app offering a choice the
 * phone is about to offer, and a way round it; the two places that do lead to
 * the question (the screen after a lesson, the row in Notification settings)
 * each have one button and no other way on. Here no question follows, so the
 * ✕ is only a banner being put away.
 *
 * Whether it shows at all is permission.ts's (`shouldNudgeReminders`): not to
 * minors, and out of the same budget as the screen after a lesson, counted
 * when it is seen. While `hold` is on, another of Learn's moments has this
 * visit, and the banner waits for another.
 */
export function ReminderNudge({ hold, store = deviceStore }: { hold: boolean; store?: DeviceStore }): React.JSX.Element | null {
  const { client, user } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const [phase, setPhase] = useState<'deciding' | 'offer' | 'gone'>('deciding');
  const noted = useRef(false);
  // what the rule reads of the account, one by one, so it is worked out again only when one of them changes
  const minor = user?.minor;
  const guest = user?.guest;
  const birthDateRequired = user?.birthDateRequired;

  useEffect(() => {
    let active = true;
    void (async () => {
      const now = await readPermission();
      // the cheap answer first: most of the time reminders are on, the phone can still ask, or there is no push here
      if (settingsAction(now) !== 'openSettings') {
        if (active) setPhase('gone');
        return;
      }
      const [record, isMinor] = await Promise.all([readOfferRecord(store), minorStatus({ minor, guest, birthDateRequired }, client)]);
      if (!active) return;
      setPhase(shouldNudgeReminders({ permission: now, record, minor: isMinor, now: Date.now() }) ? 'offer' : 'gone');
    })();
    return () => {
      active = false;
    };
  }, [client, minor, guest, birthDateRequired, store]);

  // counted when it is actually seen, not when it was decided on
  const visible = !hold && phase === 'offer';
  useEffect(() => {
    if (!visible || noted.current) return;
    noted.current = true;
    void saveOfferShown(store, Date.now());
  }, [visible, store]);

  if (!visible) return null;

  const close = (
    <Pressable
      onPress={() => setPhase('gone')}
      accessibilityRole="button"
      accessibilityLabel={t('social.close')}
      hitSlop={8}
      style={({ pressed }) => [styles.close, { opacity: pressed ? pressedDim : 1 }]}
    >
      <Icon name="close" size={16} color={colors.textSecondary} />
    </Pressable>
  );

  const toSettings = (): void => {
    openPhoneSettings();
    setPhase('gone');
  };

  return (
    <View style={[styles.banner, { flexDirection: dir.row, backgroundColor: colors.surface }, dir.row === 'row-reverse' && styles.bannerMirrored]} testID="learn-reminders">
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <SpeakingCharacter speaker="hevalo" player={null} playing={false} size={HEVALO} flip={dir.rtl} />
      </View>
      {/* the line over its button, so neither is squeezed by a long word or a large text size */}
      <View style={[styles.words, { alignItems: dir.rtl ? 'flex-end' : 'flex-start' }]}>
        <Text style={[styles.line, dir.text, { color: colors.textPrimary }]}>{t('learn.reminders.line')}</Text>
        <ClayButton label={t('notifications.device.openSettings')} tone="primary" onPress={toSettings} />
      </View>
      {close}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { alignItems: 'center', gap: spacing.sm, borderRadius: radii.lg, paddingVertical: spacing.sm, paddingStart: spacing.sm, paddingEnd: spacing.xs },
  // mirrored by hand, the start and end the padding knows are still left and right: Hevalo's side keeps the wider edge
  bannerMirrored: { paddingStart: spacing.xs, paddingEnd: spacing.sm },
  words: { flex: 1, gap: spacing.xs },
  line: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  // a 16pt ✕ in a 44pt target
  close: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
});
