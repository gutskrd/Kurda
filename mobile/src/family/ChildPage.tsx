import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AppState, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatPairingCode } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { describeError, isMaintenance } from '../api/errors';
import { sayNotSaved } from '../api/optimistic';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import type { RootNavigation } from '../navigation/rootStack';
import { bedtimeLabel, formatDate, limitLabel, weekSummary } from '../parental/format';
import { SuccessMoment } from '../parental/parts';
import { WeekBars } from '../parental/TeenPage';
import { useTeen } from '../parental/teen';
import { Avatar } from '../profile/Avatar';
import { useDirection } from '../reports/direction';
import { SettingsNote, SettingsNotRead, SettingsPage, SettingsRow, SettingsSection, SettingsSwitch } from '../settings/list';
import { BottomSheet } from '../theme/BottomSheet';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Loading } from '../theme/Loading';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import {
  askChildExport,
  changeChild,
  convertChild,
  deleteChild,
  makePairingCode,
  readChild,
  readChildExport,
  signOutChildDevice,
  type ChildDetail,
  type ChildDevice,
  type TimedCode,
} from './api';
import { forgetFamily, useFamily } from './overview';
import { CodeCard, FormError, useValidLine } from './parts';
import { PinSheet } from './PinSheet';

/** One child, as their parent reads them, again on coming back to the page. */
function useChild(childId: string): { detail: ChildDetail | null; failed: string | null; reload: () => void; set: (d: ChildDetail) => void } {
  const { client } = useAuth();
  const { t } = useI18n();
  const [detail, setDetail] = useState<ChildDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void readChild(client, childId).then((res) => {
        if (!live) return;
        if (res.ok) {
          setFailed(null);
          setDetail(res.data);
        } else if (!isMaintenance(res.error)) setFailed(res.error.status === 404 ? t('family.child.gone') : describeError(res.error, t));
      });
      return () => {
        live = false;
      };
    }, [client, childId, t, round]),
  );
  return { detail, failed, reload: useCallback(() => setRound((r) => r + 1), []), set: setDetail };
}

/**
 * A parent's page for one child: their week of learning, the daily limit and bedtime (parental controls' own pages),
 * the phones the child uses, with this phone handed over behind the family PIN and the child's own phone set up with
 * a code, learning reminders, the child's data to download, and deleting the profile. At 13, the way to give the
 * child an account of their own.
 */
export function ChildPage({ teenId: childId }: { teenId: string }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client, switchToChild } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const { detail, failed, reload, set } = useChild(childId);
  const week = useTeen(childId);
  const { overview, reload: reloadFamily } = useFamily();
  const [pinSheet, setPinSheet] = useState(false);
  const [handing, setHanding] = useState<'ask' | 'busy' | null>(null);
  const [deleting, setDeleting] = useState<'ask' | 'busy' | null>(null);
  const [exporting, setExporting] = useState<'asked' | 'ready' | null>(null);
  const [converting, setConverting] = useState(false);

  if (!detail) return failed ? <SettingsNotRead failed={failed} retry={reload} /> : <Loading style={styles.loading} />;
  const child = detail.child;
  const controls = week.controls;

  const handOver = (): void => {
    if (!overview?.pinSet) {
      setPinSheet(true);
      return;
    }
    setHanding('ask');
  };
  const confirmHandOver = (): void => {
    setHanding('busy');
    void switchToChild(childId).then((failedSwitch) => {
      setHanding(null);
      if (failedSwitch) {
        haptic('error');
        sayNotSaved({ kind: 'client', message: failedSwitch.message, code: failedSwitch.code }, t);
      }
    });
  };
  const reminders = (on: boolean): void => {
    void changeChild(client, childId, { remindersAllowed: on }).then((res) => {
      if (res.ok) set(res.data);
      else sayNotSaved(res.error, t);
    });
  };
  const signOut = (device: ChildDevice): void => {
    haptic('tap');
    void signOutChildDevice(client, childId, device.id).then((res) => {
      if (!res.ok) sayNotSaved(res.error, t);
      reload();
    });
  };
  const download = async (): Promise<void> => {
    const status = await readChildExport(client, childId);
    if (status.ok && status.data.status === 'ready' && status.data.downloadUrl) {
      void Linking.openURL(status.data.downloadUrl);
      return;
    }
    const res = await askChildExport(client, childId);
    if (!res.ok) {
      sayNotSaved(res.error, t);
      return;
    }
    setExporting('asked');
    // A copy is made in moments; it opens from here once it is.
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const again = await readChildExport(client, childId);
      if (again.ok && again.data.status === 'ready' && again.data.downloadUrl) {
        setExporting('ready');
        void Linking.openURL(again.data.downloadUrl);
        return;
      }
    }
  };
  const remove = (): void => {
    setDeleting('busy');
    void deleteChild(client, childId).then((res) => {
      if (!res.ok) {
        setDeleting('ask');
        haptic('error');
        sayNotSaved(res.error, t);
        return;
      }
      forgetFamily();
      navigation.goBack();
    });
  };

  return (
    <>
      <View style={styles.head}>
        <Avatar name={child.name} photoUrl={child.avatarUrl} size={72} />
        <Text style={[styles.name, styles.center, { color: colors.textPrimary }]} accessibilityRole="header">
          {child.name}
        </Text>
        <Text style={[styles.sub, styles.center, { color: colors.textSecondary }]}>{t('family.child.age', { age: formatNumber(child.age, locale) })}</Text>
      </View>

      {week.detail && controls ? (
        <SettingsSection title={t('parental.week')} first>
          <View style={styles.week}>
            <WeekBars week={week.detail.week} limit={controls.dailyLimitMinutes} locale={locale} />
            <Text style={[styles.summary, dir.text, { color: colors.textPrimary }]}>{weekSummary(week.detail.week, t)}</Text>
          </View>
        </SettingsSection>
      ) : null}

      {child.canConvert ? (
        <SettingsSection title={t('family.convert.title', { name: child.name })} footer={t('family.convert.footer', { name: child.name })}>
          <SettingsRow icon="user-plus" title={t('family.convert.action', { name: child.name })} onPress={() => setConverting(true)} testID="child-convert" />
        </SettingsSection>
      ) : null}

      {controls ? (
        <SettingsSection title={t('parental.time')}>
          <SettingsRow
            icon="timer"
            title={t('parental.dailyLimit')}
            value={limitLabel(controls.dailyLimitMinutes, t)}
            onPress={() => navigation.navigate('SettingsPage', { page: 'parentalLimit', teenId: childId })}
            testID="child-limit"
          />
          <SettingsRow
            icon="moon"
            title={t('parental.bedtime')}
            value={bedtimeLabel(controls.bedtime, t, locale)}
            onPress={() => navigation.navigate('SettingsPage', { page: 'parentalBedtime', teenId: childId })}
            testID="child-bedtime"
          />
        </SettingsSection>
      ) : null}

      <SettingsSection title={t('family.phones')} footer={t('family.phones.footer', { name: child.name })}>
        <SettingsRow icon="device-phone" title={t('family.handOver', { name: child.name })} subtitle={t('family.handOver.hint')} onPress={handOver} testID="child-hand-over" />
        <SettingsRow
          icon="link"
          title={t('family.pair', { name: child.name })}
          subtitle={t('family.pair.hint')}
          onPress={() => navigation.navigate('SettingsPage', { page: 'familyPairing', teenId: childId })}
          testID="child-pair"
        />
        {detail.devices.map((d) => (
          <SettingsRow
            key={d.id}
            icon={d.onParentPhone ? 'device-phone' : 'devices'}
            title={d.onParentPhone ? t('family.device.yours') : t('family.device.theirs')}
            subtitle={t('family.device.used', { date: formatDate(d.lastUsedAt, locale, t) })}
            opens={false}
            trailing={<ClayButton label={t('family.device.signOut')} variant="outline" onPress={() => signOut(d)} />}
          />
        ))}
      </SettingsSection>

      <SettingsSection footer={t('family.reminders.footer')}>
        <SettingsSwitch icon="bell" title={t('family.reminders')} value={detail.remindersAllowed} onValueChange={reminders} />
      </SettingsSection>

      <SettingsSection title={t('family.data')} footer={t('family.data.footer', { date: formatDate(detail.consentedAt, locale, t) })}>
        <SettingsRow
          icon="download"
          title={t('family.data.download', { name: child.name })}
          subtitle={exporting === 'asked' ? t('family.data.making') : undefined}
          opens={false}
          onPress={() => void download()}
          testID="child-download"
        />
        <SettingsRow icon="trash" title={t('family.delete', { name: child.name })} destructive opens={false} onPress={() => setDeleting('ask')} testID="child-delete" />
      </SettingsSection>
      <SettingsNote>{t('family.child.private')}</SettingsNote>

      <BottomSheet visible={handing !== null} onClose={() => setHanding(null)} dismissible={handing !== 'busy'} title={t('family.handOver', { name: child.name })} testID="child-hand-over-sheet">
        <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('family.handOver.body', { name: child.name })}</Text>
        <View style={styles.actions}>
          <ClayButton label={t('family.handOver.confirm')} tone="primary" size="large" busy={handing === 'busy'} onPress={confirmHandOver} testID="child-hand-over-confirm" />
          <ClayButton label={t('common.cancel')} variant="outline" disabled={handing === 'busy'} onPress={() => setHanding(null)} />
        </View>
      </BottomSheet>

      <BottomSheet visible={deleting !== null} onClose={() => setDeleting(null)} dismissible={deleting !== 'busy'} title={t('family.delete', { name: child.name })} testID="child-delete-sheet">
        <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('family.delete.body', { name: child.name })}</Text>
        <View style={styles.actions}>
          <ClayButton label={t('family.delete.confirm')} tone="danger" size="large" busy={deleting === 'busy'} onPress={remove} testID="child-delete-confirm" />
          <ClayButton label={t('common.cancel')} variant="outline" disabled={deleting === 'busy'} onPress={() => setDeleting(null)} />
        </View>
      </BottomSheet>

      <PinSheet
        visible={pinSheet}
        hasPin={false}
        onClose={() => setPinSheet(false)}
        onSet={() => {
          setPinSheet(false);
          reloadFamily();
          setHanding('ask');
        }}
      />
      <ConvertSheet visible={converting} childId={childId} name={child.name} onClose={() => setConverting(false)} />
    </>
  );
}

/**
 * Giving a child of 13 an account of their own: the address and password the parent and teen choose together, and a
 * username. The teen then signs in with them, confirms the address and agrees to the terms themselves.
 */
function ConvertSheet({ visible, childId, name, onClose }: { visible: boolean; childId: string; name: string; onClose: () => void }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = [styles.input, dir.text, { color: colors.textPrimary, backgroundColor: colors.controlTrack }];
  const go = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const res = await convertChild(client, childId, { email: email.trim(), password, username: username.trim() });
    setBusy(false);
    if (!res.ok) {
      haptic('error');
      setError(describeError(res.error, t));
      return;
    }
    haptic('celebrate');
    forgetFamily();
    onClose();
    navigation.goBack();
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} dismissible={!busy} title={t('family.convert.action', { name })} testID="child-convert-sheet">
      <View style={styles.sheet}>
        <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('family.convert.lead', { name })}</Text>
        <TextInput value={email} onChangeText={setEmail} placeholder={t('auth.email')} autoCapitalize="none" keyboardType="email-address" autoComplete="off" accessibilityLabel={t('auth.email')} style={field} />
        <TextInput value={username} onChangeText={setUsername} placeholder={t('auth.username')} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t('auth.username')} style={field} />
        <TextInput value={password} onChangeText={setPassword} placeholder={t('auth.password')} secureTextEntry autoComplete="new-password" accessibilityLabel={t('auth.password')} style={field} />
        {error ? <FormError text={error} /> : null}
        <ClayButton label={t('family.convert.go')} tone="primary" size="large" busy={busy} disabled={!email || !password || !username} onPress={() => void go()} />
      </View>
    </BottomSheet>
  );
}

/** How often the pairing page asks whether the child's phone has used the code. */
export const PAIR_POLL_MS = 4000;

/**
 * Setting up a child's own phone: eight digits in two groups of four, large, for ten minutes and once, and what to do on
 * the child's phone. The page watches for a new phone among the child's devices, then says so and goes back to the child's page.
 */
export function PairingPage({ teenId: childId, onExit }: { teenId: string; onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [code, setCode] = useState<TimedCode | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [paired, setPaired] = useState(false);
  const { left, line } = useValidLine(code?.expiresAt ?? null);

  const make = useCallback(async () => {
    setFailed(null);
    const res = await makePairingCode(client, childId);
    if (res.ok) setCode(res.data);
    else if (!isMaintenance(res.error)) setFailed(describeError(res.error, t));
  }, [client, childId, t]);
  useEffect(() => {
    void make();
  }, [make]);

  useFocusEffect(
    useCallback(() => {
      if (paired) return;
      let live = true;
      let known: Set<string> | null = null;
      const look = async (): Promise<void> => {
        if (AppState.currentState === 'background') return;
        const res = await readChild(client, childId);
        if (!live || !res.ok) return;
        setName(res.data.child.name);
        const ids = res.data.devices.filter((d) => !d.onParentPhone).map((d) => d.id);
        if (known === null) {
          known = new Set(ids);
          return;
        }
        if (ids.some((id) => !known!.has(id))) {
          haptic('celebrate');
          setPaired(true);
        }
      };
      void look();
      const timer = setInterval(() => void look(), PAIR_POLL_MS);
      return () => {
        live = false;
        clearInterval(timer);
      };
    }, [client, childId, paired]),
  );

  return (
    <SettingsPage
      title={t('family.pair.title')}
      onExit={onExit}
      overlay={paired ? <SuccessMoment text={t('family.pair.done', { name })} onDone={onExit} /> : null}
    >
      <View style={styles.page}>
        <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('family.pair.lead', { name })}</Text>
        {code ? <CodeCard code={formatPairingCode(code.code)} label={t('family.pair.title')} valid={line} testID="pairing-code" /> : failed ? null : <Loading style={styles.loading} />}
        {failed ? <FormError text={failed} /> : null}
        <View style={styles.steps}>
          {(['family.pair.step1', 'family.pair.step2', 'family.pair.step3'] as const).map((key, i) => (
            <View key={key} style={[styles.step, { flexDirection: dir.row }]}>
              <View style={[styles.stepNumber, { backgroundColor: colors.controlTrack }]}>
                <Text style={[styles.stepDigit, { color: colors.textPrimary }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.lead, styles.stepText, dir.text, { color: colors.textPrimary }]}>{t(key)}</Text>
            </View>
          ))}
        </View>
        {code && left === 0 ? <ClayButton label={t('family.pair.again')} tone="primary" size="large" onPress={() => void make()} /> : null}
        <View style={[styles.waiting, { flexDirection: dir.row }]} accessibilityLiveRegion="polite">
          <Icon name="lock" size={18} color={colors.textSecondary} />
          <Text style={[styles.lead, styles.stepText, dir.text, { color: colors.textSecondary }]}>{t('family.pair.once')}</Text>
        </View>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  loading: { paddingTop: spacing.xl },
  head: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.md, paddingHorizontal: layout.gutter },
  name: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, marginTop: spacing.sm },
  sub: { fontSize: typography.sizes.text },
  center: { textAlign: 'center' },
  week: { padding: spacing.md, gap: spacing.sm + 4 },
  summary: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  lead: { fontSize: typography.sizes.text, lineHeight: 22 },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  sheet: { gap: spacing.sm + 4, paddingTop: spacing.xs },
  input: { minHeight: MIN_TOUCH_TARGET + 8, borderRadius: radii.md, paddingHorizontal: spacing.md, fontSize: typography.sizes.text },
  page: { paddingHorizontal: layout.gutter, paddingTop: spacing.md, gap: spacing.md },
  steps: { gap: spacing.sm + 4 },
  step: { alignItems: 'center', gap: spacing.sm + 4 },
  stepNumber: { width: 32, height: 32, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  stepDigit: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  stepText: { flex: 1 },
  waiting: { alignItems: 'center', gap: spacing.sm },
});
