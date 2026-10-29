import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { openPhoneSettings, readPermission, requestPermission } from './device';
import { readOfferRecord, saveOfferShown, settingsAction, shouldNudgeReminders, type PushPermissionState } from './permission';
import { minorStatus } from './ReminderOffer';

/** Hevalo's head, at the size of the line beside him. */
const HEVALO = 40;

/**
 * A slim banner at the top of Learn while reminders are off: Hevalo, one line
 * saying what they are for, a button that turns them on, and a ✕.
 *
 * The button asks the phone when it still can (the system prompt shows), and
 * otherwise opens the app's page in the phone's settings, where a "no" given
 * before is changed — so it says "Turn on" or "Open phone settings" accordingly,
 * never "Allow", which is the system prompt's own word. Whether it shows at
 * all is permission.ts's (`shouldNudgeReminders`): not to minors, and out of
 * the same budget as the card after a lesson, counted when it is seen. While
 * `hold` is on, another of Learn's moments has this visit, and the banner
 * waits for another.
 */
export function ReminderNudge({ hold, store = deviceStore }: { hold: boolean; store?: DeviceStore }): React.JSX.Element | null {
  const { client, user } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const [permission, setPermission] = useState<PushPermissionState | null>(null);
  const [phase, setPhase] = useState<'deciding' | 'offer' | 'asking' | 'allowed' | 'gone'>('deciding');
  const noted = useRef(false);
  const knownMinor = user?.minor;

  useEffect(() => {
    let active = true;
    void (async () => {
      const now = await readPermission();
      // the cheap answer first: most of the time reminders are on, or there is no push here
      if (now.status === 'granted' || now.status === 'unavailable') {
        if (active) setPhase('gone');
        return;
      }
      const [record, minor] = await Promise.all([readOfferRecord(store), minorStatus(knownMinor, client)]);
      if (!active) return;
      setPermission(now);
      setPhase(shouldNudgeReminders({ permission: now, record, minor, now: Date.now() }) ? 'offer' : 'gone');
    })();
    return () => {
      active = false;
    };
  }, [client, knownMinor, store]);

  // counted when it is actually seen, not when it was decided on
  const visible = !hold && phase !== 'deciding' && phase !== 'gone';
  useEffect(() => {
    if (!visible || noted.current) return;
    noted.current = true;
    void saveOfferShown(store, Date.now());
  }, [visible, store]);

  if (!visible || !permission) return null;

  const close = (
    <Pressable
      onPress={() => setPhase('gone')}
      accessibilityRole="button"
      accessibilityLabel={t('social.close')}
      hitSlop={8}
      style={({ pressed }) => [styles.close, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon name="close" size={16} color={colors.textSecondary} />
    </Pressable>
  );

  if (phase === 'allowed') {
    return (
      <View style={[styles.banner, { flexDirection: dir.row, backgroundColor: colors.successFill }]} testID="learn-reminders">
        <Icon name="check" size={18} color={colors.success} />
        <Text style={[styles.line, styles.grow, dir.text, { color: colors.textPrimary }]}>{t('notifications.device.on')}</Text>
        {close}
      </View>
    );
  }

  const action = settingsAction(permission);
  const turnOn = async () => {
    if (action !== 'request') {
      openPhoneSettings();
      setPhase('gone');
      return;
    }
    setPhase('asking');
    const answer = await requestPermission(t('notifications.title'));
    if (answer.status === 'granted') {
      setPhase('allowed');
      AccessibilityInfo.announceForAccessibility?.(t('notifications.device.on'));
    } else setPhase('gone');
  };

  return (
    <View style={[styles.banner, { flexDirection: dir.row, backgroundColor: colors.surface }]} testID="learn-reminders">
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <SpeakingCharacter speaker="hevalo" player={null} playing={false} size={HEVALO} flip={dir.rtl} />
      </View>
      {/* the line over its button, so neither is squeezed by a long word or a large text size */}
      <View style={[styles.words, { alignItems: dir.rtl ? 'flex-end' : 'flex-start' }]}>
        <Text style={[styles.line, dir.text, { color: colors.textPrimary }]}>{t('learn.reminders.line')}</Text>
        <ClayButton
          label={action === 'request' ? t('learn.reminders.turnOn') : t('notifications.device.openSettings')}
          tone="primary"
          onPress={() => void turnOn()}
          busy={phase === 'asking'}
        />
      </View>
      {close}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { alignItems: 'center', gap: spacing.sm, borderRadius: radii.lg, paddingVertical: spacing.sm, paddingStart: spacing.sm, paddingEnd: spacing.xs },
  words: { flex: 1, gap: spacing.xs },
  grow: { flex: 1 },
  line: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  // a 16pt ✕ in a 44pt target
  close: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
});
