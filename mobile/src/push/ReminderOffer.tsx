import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useCelebrationHold } from '../badges/BadgeCelebrationHost';
import { HevaloWindow } from '../characters/HevaloWindow';
import { useI18n } from '../i18n/I18nContext';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';
import { useHardwareBack } from '../navigation/hardwareBack';
import { useScreenBottomInset, useScreenTopInset } from '../navigation/tabBarLayout';
import { useDirection } from '../reports/direction';
import { display } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { layout, spacing, typography } from '../theme/tokens';
import { readPermission, requestPermission } from './device';
import { minorStatus, readOfferRecord, saveOfferShown, shouldOfferReminders } from './permission';

/** How tall Hevalo's window stands on the screen. */
const WINDOW = 200;

/** How long the phone has to show its prompt before a second press continues without the answer; a sooner press is the same press twice. */
export const ANSWER_WAIT_MS = 1500;

/** Android's back stays on the screen; the one way on is the button, through the system prompt. */
const stay = (): void => undefined;

/**
 * Whether a lesson's results are followed by the screen below (`shouldOfferReminders` in permission.ts): never
 * asked, an adult, not shown too recently. Null while unknown, and false unless `enabled` (practice has no such
 * screen). Worked out as the results open; a way on pressed before that skips the screen without counting it, and
 * anything unreadable is a reason not to ask.
 */
export function useReminderOffer(enabled: boolean, store: DeviceStore = deviceStore): boolean | null {
  const { client, user } = useAuth();
  const [due, setDue] = useState<boolean | null>(enabled ? null : false);
  // The account fields the rule reads, separately, so it is recomputed only when one changes.
  const minor = user?.minor;
  const guest = user?.guest;
  const birthDateRequired = user?.birthDateRequired;

  useEffect(() => {
    if (!enabled) {
      setDue(false);
      return;
    }
    let active = true;
    setDue(null);
    void (async () => {
      let offer = false;
      try {
        const permission = await readPermission();
        // The cheap answer first: most of the time there is nothing to ask about.
        if (permission.status === 'undetermined') {
          const [record, isMinor] = await Promise.all([readOfferRecord(store), minorStatus({ minor, guest, birthDateRequired }, client)]);
          offer = shouldOfferReminders({ permission, record, minor: isMinor, now: Date.now() });
        }
      } catch {
        offer = false;
      }
      if (active) setDue(offer);
    })();
    return () => {
      active = false;
    };
  }, [enabled, client, minor, guest, birthDateRequired, store]);

  return due;
}

/**
 * The screen before the system notification prompt, last of the moments after a lesson's results: Hevalo at his
 * window, what he would send, and one button.
 *
 * The button says "Continue" and raises the system prompt, and nothing else can be pressed. Platform guidelines
 * for a pre-prompt screen ask for one button named for continuing (not "Allow") and no way to leave without
 * seeing the prompt, so there is no "Not now", ✕ or skip, and Android's back stays here.
 *
 * It describes what the server sends an adult with default settings (api
 * notifications/streak-reminder-service.ts, letters/service.ts, badges/service.ts): a streak reminder, a letter
 * notice, a badge notice. Whatever the phone answers, the lesson's way on is taken. Nothing spins while waiting,
 * and after `ANSWER_WAIT_MS` a second press continues without the answer. Counted as shown when seen
 * (permission.ts), which keeps it rare.
 */
export function ReminderOffer({ onDone, store = deviceStore }: { onDone: () => void; store?: DeviceStore }): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const top = useScreenTopInset();
  const bottom = useScreenBottomInset(spacing.lg);
  const title = t('lesson.reminder.title');
  // The Android channel is named in the reader's language before the phone asks (device.ts).
  const channel = t('notifications.title');
  const onward = useRef(onDone);
  onward.current = onDone;
  const noted = useRef(false);
  const left = useRef(false);
  const askedAt = useRef<number | null>(null);

  useEffect(() => {
    if (noted.current) return;
    noted.current = true;
    void saveOfferShown(store, Date.now()).catch(() => undefined);
    AccessibilityInfo.announceForAccessibility?.(title);
    // Once, as it is seen.
  }, []);

  useHardwareBack(stay);
  // A badge earned meanwhile waits its turn: its celebration has its own buttons, and this screen has one.
  useCelebrationHold(true);

  /** The lesson's way on, taken once however many things ask for it. */
  const leave = useCallback(() => {
    if (left.current) return;
    left.current = true;
    onward.current();
  }, []);

  const ask = useCallback(() => {
    if (askedAt.current !== null) {
      // The phone was asked and nothing came back: the button still continues.
      if (Date.now() - askedAt.current >= ANSWER_WAIT_MS) leave();
      return;
    }
    askedAt.current = Date.now();
    // Either way the answer is the phone's to keep; here it only ends the wait.
    void requestPermission(channel).then(leave, leave);
  }, [channel, leave]);

  const reading = { writingDirection: dir.rtl ? 'rtl' : 'ltr' } as const;
  return (
    <View style={[styles.screen, { paddingTop: top }]} testID="lesson-reminders">
      <ScrollView contentContainerStyle={styles.body}>
        {/* He is there already: nothing arrives on this screen but the reader. */}
        <HevaloWindow size={WINDOW} flip={dir.rtl} pop={false} />
        <Text style={[styles.title, reading, { color: colors.textPrimary }]} accessibilityRole="header">
          {title}
        </Text>
        <Text style={[styles.text, reading, { color: colors.textPrimary }]}>{t('lesson.reminder.body')}</Text>
        <Text style={[styles.note, reading, { color: colors.textSecondary }]}>{t('lesson.reminder.note')}</Text>
      </ScrollView>
      <View style={[styles.bar, { paddingBottom: bottom }]}>
        <ClayButton label={t('common.continue')} tone="primary" size="large" onPress={ask} testID="lesson-reminders-continue" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.gutter + spacing.sm,
    paddingVertical: spacing.lg,
    maxWidth: layout.column,
    width: '100%',
    alignSelf: 'center',
  },
  title: { ...display(typography.sizes.xl), textAlign: 'center', marginTop: spacing.sm },
  text: { fontSize: typography.sizes.md, lineHeight: 24, textAlign: 'center' },
  note: { fontSize: typography.sizes.sm, lineHeight: 21, textAlign: 'center' },
  // The way on keeps the foot of the screen, where the lesson's own buttons were.
  bar: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
});
