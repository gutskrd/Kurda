import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AccountStanding, AppealView, StandingSanction, SuspendedErrorDetails } from '@kurda/shared';
import { ApiClient } from '../api/client';
import type { ApiError, TokenPair, TokenStorage } from '../api/types';
import { describeError } from '../api/errors';
import { useI18n } from '../i18n/I18nContext';
import { formatDay } from '../i18n/format';
import { useTheme } from '../theme/ThemeProvider';
import { ClayButton, GlassCard, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { display } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { showMaintenance } from '../maintenance/maintenance';
import { accountStanding } from './api';
import { AppealForm } from './AppealForm';
import { AppealStatusLine } from './AccountStandingScreen';
import { useDirection } from './direction';
import { CATEGORY_LABEL } from './labels';
import { formatUntil } from './sendErrors';

/**
 * A client that speaks only with the appeal token, which reaches the standing, appeals, the data export and deleting the
 * account, and nothing else (shared APPEAL_TOKEN_EXTRA_PATHS). It cannot be refreshed: when it expires (a day) the
 * answer is 401, the screen says to sign in again, and nothing is stored.
 */
function appealClient(baseUrl: string, appealToken: string): ApiClient {
  const storage: TokenStorage = {
    get: async (): Promise<TokenPair> => ({ accessToken: appealToken, refreshToken: '' }),
    set: async () => undefined,
    clear: async () => undefined,
  };
  // Hevalo offline for a while is said over this screen as over any other.
  return new ApiClient({ baseUrl, storage, onLogout: () => undefined, onMaintenance: showMaintenance });
}

/**
 * The ban the suspension screen is about: the account-wide one in force, as the server picks it at sign-in
 * (`currentBan`): a permanent ban first, then the one ending last, then the newest. With two in force, the review is
 * asked of the one keeping the person out.
 */
export function accountSanction(standing: AccountStanding | null): StandingSanction | null {
  const bans = (standing?.active ?? []).filter((s) => s.kind === 'suspension' || s.kind === 'permanent_ban');
  const end = (s: StandingSanction): number => (s.endsAt === null ? Infinity : Date.parse(s.endsAt));
  return (
    [...bans].sort(
      (a, b) =>
        Number(b.kind === 'permanent_ban') - Number(a.kind === 'permanent_ban') ||
        end(b) - end(a) ||
        Date.parse(b.startsAt) - Date.parse(a.startsAt),
    )[0] ?? null
  );
}

/**
 * Signing in to a suspended or banned account: why (the rule and the reviewer's note), until when in the person's own
 * time or that it is permanent, "Ask for a review" while open, and a copy of one's data or deleting the account, which
 * a ban does not take away, all sent with the appeal token from sign-in.
 */
export function SuspensionScreen({
  details,
  baseUrl,
  onBack,
}: {
  details: SuspendedErrorDetails;
  baseUrl: string;
  onBack: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const top = useScreenTopInset();
  const client = useMemo(() => appealClient(baseUrl, details.appealToken), [baseUrl, details.appealToken]);
  const [standing, setStanding] = useState<AccountStanding | null>(null);
  const [expired, setExpired] = useState(false);
  const [asking, setAsking] = useState(false);
  const [filed, setFiled] = useState<AppealView | null>(null);
  // Offline, or the server down: the review waits on the standing, so say so and offer to try again.
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    void accountStanding(client).then((res) => {
      if (!alive) return;
      if (res.ok) setStanding(res.data);
      // The token lasts a day; past that it is refused, and only signing in again gives a new one.
      else if (res.error.status === 401 || res.error.kind === 'unauthorized') setExpired(true);
      else setLoadError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [client, round]);

  const sanction = accountSanction(standing);
  const appeal = filed ?? sanction?.appeal.current ?? null;
  // The standing knows best once loaded; until then, what sign-in said.
  const canAsk = sanction ? sanction.appeal.allowed : details.appealable;

  return (
    <GradientBackground>
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: top + spacing.xl }]}>
        <View style={[styles.mark, { backgroundColor: colors.controlTrack }]}>
          <Icon name="shield" size={34} color={colors.textPrimary} />
        </View>
        <Text style={[styles.title, styles.center, { color: colors.textPrimary }]} accessibilityRole="header">
          {t('suspension.title')}
        </Text>
        <Text style={[styles.lead, styles.center, { color: colors.textSecondary }]}>
          {details.until ? t('suspension.until', { when: formatUntil(details.until, locale) }) : t('suspension.permanent')}
        </Text>

        <GlassCard style={styles.card}>
          <Text style={[styles.label, dir.text, { color: colors.textSecondary }]}>{t('suspension.why')}</Text>
          {details.policy ? (
            <Text style={[styles.rule, dir.text, { color: colors.textPrimary }]}>
              {t('standing.rule', { rule: t(CATEGORY_LABEL[details.policy]) })}
            </Text>
          ) : null}
          {details.statement ? (
            <Text style={[styles.statement, dir.free, { color: colors.textPrimary }]}>{details.statement}</Text>
          ) : null}

          {appeal ? (
            <>
              <AppealStatusLine appeal={appeal} />
              {filed ? (
                <Text style={[styles.note, dir.text, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
                  {t('suspension.sent')}
                </Text>
              ) : null}
            </>
          ) : expired ? (
            <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('suspension.expired')}</Text>
          ) : canAsk ? (
            asking ? (
              <AppealForm client={client} subject={{ sanctionId: sanction?.id }} onFiled={setFiled} />
            ) : loadError && !sanction ? (
              <>
                <Text style={[styles.note, dir.text, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
                  {describeError(loadError, t)}
                </Text>
                <ClayButton label={t('common.retry')} variant="outline" onPress={() => setRound((n) => n + 1)} style={styles.ask} />
              </>
            ) : (
              <ClayButton
                label={t('appeal.title')}
                tone="primary"
                onPress={() => setAsking(true)}
                // The request names the decision, which only the standing says.
                disabled={!sanction}
                style={styles.ask}
              />
            )
          ) : (
            <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('suspension.notAppealable')}</Text>
          )}
        </GlassCard>

        <YourData client={client} scheduledFor={details.deletionScheduledFor ?? null} />

        <ClayButton label={t('suspension.back')} variant="outline" onPress={onBack} style={styles.back} />
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md, alignItems: 'stretch', paddingBottom: spacing.xxl },
  mark: { alignSelf: 'center', width: 72, height: 72, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  title: { ...display(typography.sizes.xl) },
  lead: { fontSize: typography.sizes.md, lineHeight: 22 },
  center: { textAlign: 'center' },
  card: { marginTop: spacing.sm },
  label: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  rule: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, marginTop: spacing.xs },
  statement: { fontSize: typography.sizes.md, lineHeight: 22, marginTop: spacing.sm },
  note: { fontSize: typography.sizes.sm, lineHeight: 20, marginTop: spacing.sm },
  ask: { marginTop: spacing.md },
  back: { marginTop: spacing.sm },
  action: { marginTop: spacing.sm },
});

/** The data export as `GET /me/export` reports it; a ready one comes with a fresh link that lasts minutes. */
interface ExportStatus {
  status: 'none' | 'pending' | 'ready';
  downloadUrl?: string;
  requestedAt?: string;
}

/** Where deleting the account stands on this screen: waiting out its grace period, or closed at once. */
export type Deletion = { kind: 'scheduled'; days: number } | { kind: 'gone' };

/** A deletion asked for on an earlier visit, as whole days left, so the screen can offer to keep the account again. */
export function scheduledDeletion(at: string | null, now = Date.now()): Deletion | null {
  if (!at) return null;
  const left = Date.parse(at) - now;
  return Number.isFinite(left) && left > 0 ? { kind: 'scheduled', days: Math.ceil(left / 86_400_000) } : null;
}

/**
 * A copy of one's data and deleting the account, sent with the appeal token. The copy is asked for and fetched as in
 * Settings, with a fresh link each time it is opened; deleting asks first, in the words Settings uses, and says which
 * records are kept. A suspended person cannot sign in to change their mind, so a deletion waiting out its grace period
 * can be undone here (`POST /me/deletion/cancel`).
 */
function YourData({ client, scheduledFor }: { client: ApiClient; scheduledFor: string | null }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [exported, setExported] = useState<ExportStatus | null>(null);
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [deletion, setDeletion] = useState<Deletion | null>(() => scheduledDeletion(scheduledFor));
  const [keeping, setKeeping] = useState(false);
  const [kept, setKept] = useState(false);

  // The token lasts a day; past that only signing in again gives a new one.
  const said = useCallback(
    (error: ApiError, otherwise: string): string => (error.status === 401 || error.kind === 'unauthorized' ? t('suspension.signInAgain') : otherwise),
    [t],
  );

  const read = useCallback(async (): Promise<ExportStatus | null> => {
    const res = await client.get<ExportStatus>('/me/export');
    if (!res.ok || typeof res.data?.status !== 'string') return null;
    setExported(res.data);
    return res.data;
  }, [client]);
  useEffect(() => {
    void read();
  }, [read]);

  const prepare = async (): Promise<void> => {
    if (asking) return;
    setAsking(true);
    setNote(null);
    const res = await client.post('/me/export');
    setAsking(false);
    if (res.ok) setExported({ status: 'pending' });
    // With nowhere private to keep a copy the server makes none, which is said as that rather than as a failure.
    else setNote(said(res.error, res.error.code === 'EXPORT_NOT_AVAILABLE' ? t('error.code.exportNotAvailable') : t('settings.data.failed')));
  };

  const download = async (): Promise<void> => {
    setNote(null);
    const status = await read();
    if (status?.status === 'ready' && status.downloadUrl) {
      const url = status.downloadUrl;
      Alert.alert(t('settings.data.title'), readyText(status), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.data.again'), onPress: () => void prepare() },
        { text: t('settings.data.download'), onPress: () => void Linking.openURL(url) },
      ]);
    } else if (status?.status !== 'pending') await prepare();
  };

  const remove = async (): Promise<void> => {
    setDeleting(true);
    setKept(false);
    const res = await client.delete<{ deletionScheduled?: boolean; graceDays?: number }>('/me');
    setDeleting(false);
    if (!res.ok) {
      Alert.alert(t('settings.delete.failed'), said(res.error, describeError(res.error, t)));
      return;
    }
    const days = res.data?.deletionScheduled ? (res.data.graceDays ?? 0) : 0;
    setDeletion(days > 0 ? { kind: 'scheduled', days } : { kind: 'gone' });
  };

  const keep = async (): Promise<void> => {
    setKeeping(true);
    const res = await client.post<{ cancelled: boolean }>('/me/deletion/cancel');
    setKeeping(false);
    if (!res.ok) {
      Alert.alert(t('settings.delete.failed'), said(res.error, describeError(res.error, t)));
      return;
    }
    setDeletion(null);
    setKept(true);
  };

  const confirmDelete = (): void => {
    Alert.alert(t('settings.delete.confirmTitle'), t('suspension.delete.warning'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.delete.confirm'), style: 'destructive', onPress: () => void remove() },
    ]);
  };

  const readyText = (status: ExportStatus): string =>
    t('settings.data.ready', { date: status.requestedAt ? formatDay(new Date(status.requestedAt), locale) : '' });

  return (
    <GlassCard style={styles.card}>
      <Text style={[styles.label, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
        {t('settings.data.title')}
      </Text>
      {deletion?.kind === 'gone' ? (
        <Text style={[styles.note, dir.text, { color: colors.textPrimary }]} accessibilityLiveRegion="polite">
          {t('settings.delete.doneNow')}
        </Text>
      ) : deletion?.kind === 'scheduled' ? (
        <>
          <Text style={[styles.note, dir.text, { color: colors.textPrimary }]} accessibilityLiveRegion="polite">
            {t('suspension.delete.scheduled', { days: deletion.days })}
          </Text>
          <ClayButton label={t('suspension.delete.keep')} tone="primary" busy={keeping} onPress={() => void keep()} style={styles.ask} />
        </>
      ) : (
        <>
          {kept ? (
            <Text style={[styles.note, dir.text, { color: colors.textPrimary }]} accessibilityLiveRegion="polite">
              {t('suspension.delete.kept')}
            </Text>
          ) : null}
          <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('suspension.data.help')}</Text>
          {exported?.status === 'pending' ? (
            <Text style={[styles.note, dir.text, { color: colors.textPrimary }]} accessibilityLiveRegion="polite">
              {t('suspension.data.preparing')}
            </Text>
          ) : (
            <>
              {exported?.status === 'ready' ? <Text style={[styles.note, dir.text, { color: colors.textPrimary }]}>{readyText(exported)}</Text> : null}
              <ClayButton
                label={asking ? t('settings.data.requesting') : t('suspension.data.download')}
                variant="outline"
                busy={asking}
                onPress={() => void download()}
                style={styles.ask}
              />
            </>
          )}
          {note ? (
            <Text style={[styles.note, dir.text, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
              {note}
            </Text>
          ) : null}
          <ClayButton
            label={t('suspension.delete.button')}
            tone="danger"
            variant="outline"
            busy={deleting}
            onPress={confirmDelete}
            style={styles.action}
          />
        </>
      )}
    </GlassCard>
  );
}
