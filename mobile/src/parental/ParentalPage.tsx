import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { MAX_PARENTS_PER_TEEN, MAX_TEENS_PER_PARENT, OPEN_CONTROLS, PARENTAL_SWITCHES, type ParentalSwitch } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { sayNotSaved } from '../api/optimistic';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useDirection } from '../reports/direction';
import { SettingsNote, SettingsNotRead, SettingsRow, SettingsSection, useOnOff } from '../settings/list';
import { BottomSheet } from '../theme/BottomSheet';
import { ClayButton } from '../theme/glass';
import type { IconName } from '../theme/Icon';
import { Loading } from '../theme/Loading';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import { disconnectParent, nameOf, type ConnectedParent, type ParentalNoneReason, type ParentalOverview } from './api';
import { bedtimeLabel, formatDate, lessonsLabel, limitLabel, minutesLabel } from './format';
import { useParentalOverview } from './overview';
import { Hero, PersonRow, ThinBar } from './parts';

/** The six switches' glyphs, in `PARENTAL_SWITCHES` order. */
export const SWITCH_ICON: Record<ParentalSwitch, IconName> = {
  chat: 'chat',
  letters: 'mail',
  posts: 'compose',
  games: 'play',
  friends: 'user-plus',
  purchases: 'cart',
};

/**
 * Settings → Parental controls. What it shows depends on which side of it the account is on (GET /me/parental): a
 * teen connects a parent and reads what was set; a parent adds teens and opens each one's page; anyone else is told
 * in one line why it is not for them yet, with the way on where there is one.
 */
export function ParentalPage(): React.JSX.Element {
  const { overview, failed, reload } = useParentalOverview();
  if (!overview) return failed ? <SettingsNotRead failed={failed} retry={reload} /> : <Loading style={styles.loading} />;
  if (overview.role === 'teen') return overview.parents?.length ? <TeenConnected overview={overview} onChanged={reload} /> : <TeenAlone />;
  if (overview.role === 'parent') return <ParentHome overview={overview} />;
  return <NotForYou reason={overview.reason} />;
}

/** Why parental controls are not open to this account, and the one thing that would open them. */
function NotForYou({ reason }: { reason?: ParentalNoneReason }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { refreshUser, resendVerificationCode } = useAuth();
  const { t } = useI18n();
  const [sent, setSent] = useState<string | null>(null);
  const body =
    reason === 'guest'
      ? t('parental.none.guest')
      : reason === 'birth_month'
        ? t('parental.none.birthMonth')
        : reason === 'email'
          ? t('parental.none.email')
          : t('parental.none.standing');
  return (
    <Hero title={t('parental.title')} body={body}>
      {reason === 'guest' ? (
        <ClayButton label={t('guest.createAccount')} tone="primary" size="large" onPress={() => navigation.navigate('ClaimAccount')} />
      ) : null}
      {/* The account read again says the month is missing, so the app asks for it over everything. */}
      {reason === 'birth_month' ? (
        <ClayButton label={t('letters.refusal.birthMonthAction')} tone="primary" size="large" onPress={() => void refreshUser()} />
      ) : null}
      {reason === 'email' ? (
        <ClayButton
          label={sent ?? t('parental.none.resend')}
          variant="outline"
          disabled={sent !== null}
          onPress={() => void resendVerificationCode().then((failed) => setSent(failed ?? t('parental.none.sent')))}
        />
      ) : null}
    </Hero>
  );
}

/** A teen with no parent yet: what a parent could do and see, said before anything is asked, and the way to connect. */
function TeenAlone(): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  return (
    <Hero title={t('parental.title')} body={t('parental.teen.intro')}>
      <ClayButton
        label={t('parental.teen.connect')}
        tone="primary"
        size="large"
        onPress={() => navigation.navigate('SettingsPage', { page: 'parentalConnect' })}
        testID="parental-connect"
      />
    </Hero>
  );
}

/**
 * A supervised teen's own view: who their parents are, everything set as read-only values, what a parent can and
 * cannot see, and disconnecting a parent, who is told.
 */
function TeenConnected({ overview, onChanged }: { overview: ParentalOverview; onChanged: () => void }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const onOff = useOnOff();
  const parents = overview.parents ?? [];
  // The first parent, as the server marks them, or else the one connected longest.
  const firstId = (parents.find((p) => p.first) ?? [...parents].sort((a, b) => a.since.localeCompare(b.since))[0])?.userId;
  const supervision = overview.supervision ?? null;
  const controls = supervision?.controls ?? OPEN_CONTROLS;
  const minutes = supervision?.minutesToday ?? 0;
  const limit = controls.dailyLimitMinutes;

  // Choosing which parent, when there are two, then confirming.
  const [leaving, setLeaving] = useState<{ choosing: true } | { parent: ConnectedParent } | null>(null);
  const [ending, setEnding] = useState(false);
  const askToDisconnect = (): void => {
    haptic('select');
    setLeaving(parents.length > 1 ? { choosing: true } : { parent: parents[0]! });
  };
  const disconnect = (parent: ConnectedParent): void => {
    setEnding(true);
    haptic('tap');
    void disconnectParent(client, parent.userId).then((res) => {
      setEnding(false);
      setLeaving(null);
      // Already gone (the parent stopped first) is as good as done.
      if (res.ok || res.error.status === 404) onChanged();
      else {
        haptic('error');
        sayNotSaved(res.error, t);
      }
    });
  };
  const chosen = leaving && 'parent' in leaving ? leaving.parent : null;

  return (
    <>
      <SettingsSection title={t('parental.parents')} first>
        {parents.map((p) => (
          <PersonRow
            key={p.userId}
            person={p}
            // With two parents, the first is the one who can loosen what is set.
            detail={[parents.length > 1 && p.userId === firstId ? t('parental.firstParent') : null, t('parental.since', { date: formatDate(p.since, locale) })]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
        {parents.length < MAX_PARENTS_PER_TEEN ? (
          <SettingsRow icon="user-plus" title={t('parental.addParent')} onPress={() => navigation.navigate('SettingsPage', { page: 'parentalConnect' })} />
        ) : null}
      </SettingsSection>

      <SettingsSection title={t('parental.setBy')} footer={t('parental.privacy.teen')}>
        <SettingsRow icon="timer" title={t('parental.dailyLimit')} value={limitLabel(limit, t)} />
        <SettingsRow
          icon="clock"
          title={t('parental.today')}
          value={limit != null ? t('parental.today.of', { used: Math.min(minutes, limit), limit }) : minutesLabel(minutes, t)}
        />
        {limit != null ? (
          // Under the row's words, past its icon, on the side reading starts from.
          <View style={[styles.used, dir.row === 'row-reverse' ? styles.usedRtl : null]}>
            <ThinBar share={minutes / limit} />
          </View>
        ) : null}
        <SettingsRow icon="moon" title={t('parental.bedtime')} value={bedtimeLabel(controls.bedtime, t, locale)} />
        {PARENTAL_SWITCHES.map((s) => (
          <SettingsRow key={s} icon={SWITCH_ICON[s]} title={t(`parental.switch.${s}`)} subtitle={t(`parental.switch.${s}.hint`)} value={onOff(controls[s])} />
        ))}
      </SettingsSection>

      <SettingsSection>
        <SettingsRow icon="sign-out" title={t('parental.disconnect')} destructive opens={false} onPress={askToDisconnect} testID="parental-disconnect" />
      </SettingsSection>

      <BottomSheet
        visible={leaving !== null}
        onClose={() => setLeaving(null)}
        onBack={chosen && parents.length > 1 ? () => setLeaving({ choosing: true }) : undefined}
        dismissible={!ending}
        title={chosen ? t('parental.disconnect.title', { name: nameOf(chosen) }) : t('parental.disconnect')}
        testID="parental-disconnect-sheet"
      >
        {chosen ? (
          <>
            <Text style={[styles.sheetBody, dir.text, { color: colors.textSecondary }]}>{t('parental.willBeTold', { name: nameOf(chosen) })}</Text>
            <View style={styles.sheetActions}>
              <ClayButton label={t('parental.disconnect.confirm')} tone="danger" size="large" busy={ending} onPress={() => disconnect(chosen)} />
              <ClayButton label={t('common.cancel')} variant="outline" disabled={ending} onPress={() => setLeaving(null)} />
            </View>
          </>
        ) : (
          parents.map((p) => <PersonRow key={p.userId} person={p} onPress={() => setLeaving({ parent: p })} />)
        )}
      </BottomSheet>
    </>
  );
}

/** A parent's list of teens with today's numbers, each opening their page, and the way to add another. */
function ParentHome({ overview }: { overview: ParentalOverview }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  const teens = overview.teens ?? [];
  const full = teens.length >= MAX_TEENS_PER_PARENT;
  const addTeen = (): void => navigation.navigate('SettingsPage', { page: 'parentalCode' });
  if (teens.length === 0) {
    return (
      <Hero title={t('parental.title')} body={t('parental.parent.intro')}>
        <ClayButton label={t('parental.addTeen')} icon="user-plus" tone="primary" size="large" onPress={addTeen} testID="parental-add-teen" />
      </Hero>
    );
  }
  return (
    <>
      <SettingsSection title={t('parental.teens')} first footer={t('parental.privacy.parent')}>
        {teens.map((w) => (
          <PersonRow
            key={w.teen.userId}
            person={w.teen}
            detail={t('parental.todayLine', { minutes: w.today.minutes, lessons: lessonsLabel(w.today.lessons, t) })}
            onPress={() => navigation.navigate('SettingsPage', { page: 'parentalTeen', teenId: w.teen.userId })}
            testID={`parental-teen-${w.teen.userId}`}
          />
        ))}
        {full ? null : <SettingsRow icon="user-plus" title={t('parental.addTeen')} onPress={addTeen} testID="parental-add-teen" />}
      </SettingsSection>
      {full ? <SettingsNote>{t('parental.full')}</SettingsNote> : null}
    </>
  );
}

const styles = StyleSheet.create({
  loading: { paddingTop: spacing.xl },
  sheetBody: { fontSize: typography.sizes.text, lineHeight: 22 },
  sheetActions: { gap: spacing.sm, marginTop: spacing.sm },
  // A row's inset (12), its icon (24) and the gap after it (12): the bar starts where the row's words do.
  used: { paddingLeft: 48, paddingRight: spacing.sm + 4, paddingBottom: spacing.sm + 4, marginTop: -spacing.xs },
  usedRtl: { paddingLeft: spacing.sm + 4, paddingRight: 48 },
});
