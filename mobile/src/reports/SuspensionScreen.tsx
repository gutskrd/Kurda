import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AccountStanding, AppealView, StandingSanction, SuspendedErrorDetails } from '@kurda/shared';
import { ApiClient } from '../api/client';
import type { ApiError, TokenPair, TokenStorage } from '../api/types';
import { describeError } from '../api/errors';
import { useI18n } from '../i18n/I18nContext';
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
 * A client that speaks only with the appeal token, which can read `GET /me/standing` and file `POST /me/appeals` and
 * nothing else. It cannot be refreshed: when it expires (a day) the answer is 401, the screen says to sign in again,
 * and nothing is stored.
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
 * time or that it is permanent, and "Ask for a review" while open, sent with the appeal token from sign-in.
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
});
