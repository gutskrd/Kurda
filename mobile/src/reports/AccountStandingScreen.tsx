import { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { useNavigation } from '@react-navigation/native';
import { ACCOUNT_CHANGED, type AccountStanding, type AppealView, type PendingPicture, type RestrictionScope, type StandingSanction } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { ApiClient } from '../api/client';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { ScreenHeader } from '../navigation/ScreenHeader';
import type { RootNavigation } from '../navigation/rootStack';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { GlassCard, GlassRow, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { sectionLabel } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { accountStanding } from './api';
import { AppealForm } from './AppealForm';
import { useDirection } from './direction';
import {
  APPEAL_STATUS_LABEL,
  CATEGORY_LABEL,
  SANCTION_LABEL,
  SCOPE_LABEL,
  STANDING_STATUS_LABEL,
  originKey,
} from './labels';
import { formatDay, formatUntil } from './sendErrors';
import { heldDim } from '../theme/MotionParts';
import { pendingOf } from '../pictures/review';
import { useUserEvents } from '../realtime/useUserEvents';
import { isHoldSanction } from './hold';

const SCOPES: readonly RestrictionScope[] = ['account', 'chat', 'post', 'media'];

/**
 * Account standing: what is limited on your account, why, until when, and a way to ask for a review. Each decision
 * carries its statement of reasons (the rule, the reviewer's note, from and until when in your own time, whether it
 * came from a report or was automatic, and whether a person reviewed it), as Art. 17 of the DSA requires, said plainly
 * enough for a child. A review can be asked for once per decision, within six months. A picture taken down is shown
 * to its owner, small, so they know which one a review would be about.
 */
export function AccountStandingScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { t } = useI18n();
  const navigation = useNavigation<RootNavigation>();
  const [standing, setStanding] = useState<AccountStanding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void accountStanding(client).then((res) => {
      setLoading(false);
      if (res.ok) {
        setStanding(res.data);
        setError(null);
      } else setError(res.error);
    });
  }, [client]);

  useEffect(load, [load]);
  // A decision given or lifted while the screen is open shows at once.
  useUserEvents(useCallback((event) => event.type === ACCOUNT_CHANGED && load(), [load]));

  return (
    <GradientBackground>
      <ScreenHeader title={t('standing.title')} onBack={onExit} hairline />
      <AsyncBoundary loading={loading && !standing} error={standing ? null : error} onRetry={load}>
        {standing ? (
          <ScrollView contentContainerStyle={styles.body}>
            <StandingSummary standing={standing} />
            <StandingDecisions standing={standing} client={client} onChanged={load} />
            <GlassCard padding="tight">
              <GlassRow icon="flag" title={t('reports.title')} onPress={() => navigation.navigate('MyReports')} />
            </GlassCard>
          </ScrollView>
        ) : null}
      </AsyncBoundary>
    </GradientBackground>
  );
}

/** How the account stands, in one line, and what is limited until when. */
function StandingSummary({ standing }: { standing: AccountStanding }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const good = standing.status === 'good';
  const scopes = SCOPES.filter((s) => standing.restrictions[s]);
  return (
    <GlassCard>
      <View style={[styles.summary, { flexDirection: dir.row }]}>
        <View style={[styles.badge, { backgroundColor: good ? colors.successFill : colors.controlTrack }]}>
          <Icon name="shield" size={26} color={good ? colors.success : colors.textPrimary} />
        </View>
        <Text style={[styles.summaryText, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
          {t(STANDING_STATUS_LABEL[standing.status])}
        </Text>
      </View>
      {scopes.length > 0 ? (
        <View style={styles.limits}>
          <Text style={[styles.section, dir.text, { color: colors.textSecondary }]}>{t('standing.limits')}</Text>
          {scopes.map((scope) => {
            const until = standing.restrictions[scope]?.until ?? null;
            return (
              // What, then until when under it: side by side, a phone's width would fold the name in two.
              <View key={scope} style={styles.limitRow}>
                <Text style={[styles.limitName, dir.text, { color: colors.textPrimary }]}>{t(SCOPE_LABEL[scope])}</Text>
                <Text style={[styles.limitUntil, dir.text, { color: colors.textSecondary }]}>
                  {until ? t('standing.until', { when: formatUntil(until, locale) }) : t('standing.noEnd')}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </GlassCard>
  );
}

/** The decisions in force, the earlier ones, and requests about reports. */
function StandingDecisions({
  standing,
  client,
  onChanged,
}: {
  standing: AccountStanding;
  client: ApiClient;
  onChanged: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const nothing = standing.active.length === 0 && standing.past.length === 0;
  return (
    <>
      {standing.active.length > 0 ? (
        <>
          <Text style={[styles.section, dir.text, { color: colors.textSecondary }]}>{t('standing.active')}</Text>
          {standing.active.map((s) => (
            <SanctionCard key={s.id} sanction={s} client={client} onChanged={onChanged} />
          ))}
        </>
      ) : null}
      {standing.past.length > 0 ? (
        <>
          <Text style={[styles.section, dir.text, { color: colors.textSecondary }]}>{t('standing.past')}</Text>
          {standing.past.map((s) => (
            <SanctionCard key={s.id} sanction={s} client={client} onChanged={onChanged} />
          ))}
        </>
      ) : null}
      {nothing ? <Text style={[styles.empty, dir.text, { color: colors.textSecondary }]}>{t('standing.none')}</Text> : null}
      {standing.reportAppeals.length > 0 ? (
        <>
          <Text style={[styles.section, dir.text, { color: colors.textSecondary }]}>{t('standing.reportAppeals')}</Text>
          {standing.reportAppeals.map((a) => (
            <GlassCard key={a.id}>
              <AppealStatusLine appeal={a} />
            </GlassCard>
          ))}
        </>
      ) : null}
    </>
  );
}

/** One decision with its statement of reasons, and the review it allows. */
function SanctionCard({
  sanction,
  client,
  onChanged,
}: {
  sanction: StandingSanction;
  client: ApiClient;
  onChanged: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [asking, setAsking] = useState(false);
  const [filed, setFiled] = useState<AppealView | null>(null);
  const appeal = filed ?? sanction.appeal.current;
  // A hold is a check, not a finding: it says so in the reader's language, with no rule and no "found by" line.
  const hold = isHoldSanction(sanction);

  return (
    <GlassCard>
      <Text style={[styles.kind, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
        {hold ? t('hold.heading') : t(SANCTION_LABEL[sanction.kind])}
      </Text>
      {hold ? null : (
        <Text style={[styles.meta, dir.text, { color: colors.textSecondary }]}>
          {t('standing.rule', { rule: t(CATEGORY_LABEL[sanction.policy]) })}
        </Text>
      )}
      {hold ? (
        <Text style={[styles.holdText, dir.text, { color: colors.textPrimary }]}>{t('hold.statement')}</Text>
      ) : sanction.statement ? (
        <View style={[styles.statement, { borderColor: colors.separator }, dir.rtl ? styles.statementRtl : styles.statementLtr]}>
          <Text style={[styles.statementText, dir.free, { color: colors.textPrimary }]}>{sanction.statement}</Text>
        </View>
      ) : null}
      {sanction.kind === 'content_removal' ? <RemovedPicture picture={pendingOf((sanction as StandingSanction & { picture?: unknown }).picture)} /> : null}
      <Text style={[styles.meta, dir.text, { color: colors.textSecondary }]}>
        {[
          t('standing.from', { when: formatUntil(sanction.startsAt, locale) }),
          sanction.revokedAt
            ? t('standing.lifted', { when: formatDay(sanction.revokedAt, locale) })
            : sanction.endsAt
              ? t('standing.until', { when: formatUntil(sanction.endsAt, locale) })
              : hold || sanction.kind === 'warning' || sanction.kind === 'content_removal'
                ? null
                : t('standing.noEnd'),
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {hold ? null : (
        <Text style={[styles.meta, dir.text, { color: colors.textSecondary }]}>
          {t(originKey(sanction))}
        </Text>
      )}

      {appeal ? (
        <AppealStatusLine appeal={appeal} />
      ) : sanction.appeal.allowed ? (
        asking ? (
          <AppealForm
            client={client}
            subject={{ sanctionId: sanction.id }}
            onFiled={(a) => {
              setFiled(a);
              onChanged();
            }}
          />
        ) : (
          <View style={styles.askWrap}>
            <Pressable onPress={() => setAsking(true)} accessibilityRole="button" style={({ pressed }) => [styles.ask, pressed && heldDim]}>
              <Text style={[styles.askText, dir.text, { color: colors.primary }]}>{t('appeal.title')}</Text>
            </Pressable>
            <Text style={[styles.meta, dir.text, { color: colors.textSecondary }]}>
              {t('standing.reviewBy', { when: formatDay(sanction.appeal.deadline, locale) })}
            </Text>
          </View>
        )
      ) : null}
    </GlassCard>
  );
}

/**
 * The picture a removal is about, small, from a private link only its owner can open. The link lasts minutes, so one
 * that no longer opens says so rather than leaving an empty box.
 */
function RemovedPicture({ picture }: { picture: PendingPicture | null }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [broken, setBroken] = useState(false);
  if (!picture) return null;
  return (
    <View style={[styles.picture, { alignItems: dir.rtl ? 'flex-end' : 'flex-start' }]} testID="standing-picture">
      <Text style={[styles.meta, dir.text, { color: colors.textSecondary }]}>{t('standing.picture')}</Text>
      {broken ? (
        <Text style={[styles.meta, dir.text, { color: colors.textSecondary }]} testID="standing-picture-gone">
          {t('standing.pictureUnavailable')}
        </Text>
      ) : (
        <Image
          source={{ uri: picture.url }}
          onError={() => setBroken(true)}
          style={[styles.pictureImage, { backgroundColor: colors.controlTrack }]}
          resizeMode="cover"
          accessible
          accessibilityRole="image"
          accessibilityLabel={t('standing.picture')}
          accessibilityIgnoresInvertColors
        />
      )}
    </View>
  );
}

/** Where a request for a review stands, with the reviewer's answer once there is one. */
export function AppealStatusLine({ appeal }: { appeal: AppealView }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={[styles.appeal, { backgroundColor: colors.controlTrack }]} accessibilityLiveRegion="polite">
      <Text style={[styles.appealStatus, dir.text, { color: colors.textPrimary }]}>{t(APPEAL_STATUS_LABEL[appeal.status])}</Text>
      {appeal.decisionNote ? (
        <Text style={[styles.meta, dir.free, { color: colors.textSecondary }]}>{appeal.decisionNote}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  summary: { alignItems: 'center', gap: spacing.md },
  badge: { width: 52, height: 52, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  summaryText: { flex: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, lineHeight: 22 },
  limits: { marginTop: spacing.md, gap: spacing.xs },
  limitRow: { gap: 2, paddingVertical: spacing.xs },
  limitName: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  limitUntil: { fontSize: typography.sizes.text },
  section: { ...sectionLabel, marginTop: spacing.sm },
  empty: { fontSize: typography.sizes.text },
  kind: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  meta: { fontSize: typography.sizes.text, lineHeight: 20, marginTop: spacing.xs },
  statement: { marginTop: spacing.sm, paddingVertical: spacing.xs },
  statementLtr: { borderLeftWidth: 3, paddingLeft: spacing.md },
  statementRtl: { borderRightWidth: 3, paddingRight: spacing.md },
  statementText: { fontSize: typography.sizes.text, lineHeight: 22 },
  // A hold's own words, plain rather than quoted: nobody wrote them about something the person did.
  holdText: { fontSize: typography.sizes.text, lineHeight: 22, marginTop: spacing.xs },
  picture: { gap: spacing.xs },
  pictureImage: { width: 96, height: 96, borderRadius: radii.md, marginTop: spacing.xs },
  askWrap: { marginTop: spacing.xs },
  ask: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  askText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  appeal: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radii.md },
  appealStatus: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
});
