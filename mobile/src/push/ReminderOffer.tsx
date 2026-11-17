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

/**
 * How long the phone has to bring its question up before a second press of
 * the button goes on without the answer. A press sooner than this is the
 * same press made twice.
 */
export const ANSWER_WAIT_MS = 1500;

/** Android's back on the screen: it stays. The one way on is the button, by way of the phone's question. */
const stay = (): void => undefined;

/**
 * Whether a lesson's results are to be followed by the screen below
 * (permission.ts's `shouldOfferReminders`): never asked yet, an adult, not
 * shown too recently. Null while that is being found out, and false where
 * `enabled` is not set (practice has no such screen).
 *
 * Found out as the results open, so the answer is there well before a way on
 * is pressed. A way on pressed sooner than that goes without the screen,
 * which is then not counted and follows another lesson: nothing waits on
 * this, and anything that cannot be read is a reason not to ask.
 */
export function useReminderOffer(enabled: boolean, store: DeviceStore = deviceStore): boolean | null {
  const { client, user } = useAuth();
  const [due, setDue] = useState<boolean | null>(enabled ? null : false);
  // what the rule reads of the account, one by one, so it is worked out again only when one of them changes
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
        // the cheap answer first: most of the time there is nothing to ask about
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
 * The screen that comes before the phone's question about notifications
 * (KUR-094), last of the moments that follow a lesson's results: Hevalo at
 * his window, what he would send, and one button.
 *
 * The button says "Continue" and brings up the phone's own question, and
 * that is all there is to press. The platform's guidelines for a screen
 * shown before a system prompt ask for exactly this: one button, named for
 * going on rather than for an answer ("Allow" is the prompt's word, and an
 * app that uses it is steering the choice), and no way to leave without
 * having seen the prompt, so no "Not now", no ✕ and no skip. Android's back
 * stays on the screen for the same reason. The yes and the no are given to
 * the phone, where they belong.
 *
 * What it says is what the server sends an adult who has changed no setting
 * (api notifications/streak-reminder-service.ts, letters/service.ts,
 * badges/service.ts): a reminder on a day the streak is still waiting, word
 * of a letter, word of a badge. It promises nothing else, shows no picture
 * of the prompt and points at neither of its buttons.
 *
 * Whatever the phone answers, the lesson's way on is taken: allowed, turned
 * down, an error, or a phone that turns out not to ask at all. Nothing spins
 * while the answer is awaited, and the wait cannot hold anybody here: once
 * the phone has had time to ask (`ANSWER_WAIT_MS`), pressing the button
 * again goes on without the answer. Counted as shown when it is seen
 * (permission.ts keeps the record), which is what makes it rare.
 */
export function ReminderOffer({ onDone, store = deviceStore }: { onDone: () => void; store?: DeviceStore }): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const top = useScreenTopInset();
  const bottom = useScreenBottomInset(spacing.lg);
  const title = t('lesson.reminder.title');
  // the Android channel is named in the reader's language before the phone asks (device.ts)
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
    // once, as it is seen
  }, []);

  useHardwareBack(stay);
  // a badge earned meanwhile waits its turn: its celebration comes over the screen with buttons of its own, and this screen has one
  useCelebrationHold(true);

  /** The lesson's way on, taken once however many things ask for it. */
  const leave = useCallback(() => {
    if (left.current) return;
    left.current = true;
    onward.current();
  }, []);

  const ask = useCallback(() => {
    if (askedAt.current !== null) {
      // the phone was asked and nothing has come back: the button still goes on
      if (Date.now() - askedAt.current >= ANSWER_WAIT_MS) leave();
      return;
    }
    askedAt.current = Date.now();
    // either way the answer is the phone's to keep; here it only ends the wait
    void requestPermission(channel).then(leave, leave);
  }, [channel, leave]);

  const reading = { writingDirection: dir.rtl ? 'rtl' : 'ltr' } as const;
  return (
    <View style={[styles.screen, { paddingTop: top }]} testID="lesson-reminders">
      <ScrollView contentContainerStyle={styles.body}>
        {/* he is there already: nothing arrives on this screen but the reader */}
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
  // the way on keeps the foot of the screen, where the lesson's own buttons were
  bar: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
});
