import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { AccountStanding, AppealView, RestrictionScope, StandingSanction } from '@kurda/shared';
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
  ORIGIN_LABEL,
  SANCTION_LABEL,
  SCOPE_LABEL,
  STANDING_STATUS_LABEL,
} from './labels';
import { formatDay, formatUntil } from './sendErrors';

const SCOPES: readonly RestrictionScope[] = ['account', 'chat', 'post', 'media'];

/**
 * Account standing: what is limited on your account, why, until when, and a
 * way to ask for a review.
 *
 * Each decision carries its statement of reasons — the rule, what the reviewer
 * wrote to you, from when and until when in your own time, whether it came
 * from a report or was automatic, and whether a person has looked at it — the
 * things the DSA's Art. 17 asks a service to say, and that a child deserves to
 * be told plainly. Asking for a review is open for six months, once a decision.
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
export function StandingSummary({ standing }: { standing: AccountStanding }): React.JSX.Element {
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
              // what, then until when under it: side by side, a phone's width folds the name in two
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
export function StandingDecisions({
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
export function SanctionCard({
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

  return (
    <GlassCard>
      <Text style={[styles.kind, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
        {t(SANCTION_LABEL[sanction.kind])}
      </Text>
      <Text style={[styles.meta, dir.text, { color: colors.textSecondary }]}>
        {t('standing.rule', { rule: t(CATEGORY_LABEL[sanction.policy]) })}
      </Text>
      {sanction.statement ? (
        <View style={[styles.statement, { borderColor: colors.separator }, dir.rtl ? styles.statementRtl : styles.statementLtr]}>
          <Text style={[styles.statementText, dir.free, { color: colors.textPrimary }]}>{sanction.statement}</Text>
        </View>
      ) : null}
      <Text style={[styles.meta, dir.text, { color: colors.textSecondary }]}>
        {[
          t('standing.from', { when: formatUntil(sanction.startsAt, locale) }),
          sanction.revokedAt
            ? t('standing.lifted', { when: formatDay(sanction.revokedAt, locale) })
            : sanction.endsAt
              ? t('standing.until', { when: formatUntil(sanction.endsAt, locale) })
              : sanction.kind === 'warning' || sanction.kind === 'content_removal'
                ? null
                : t('standing.noEnd'),
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <Text style={[styles.meta, dir.text, { color: colors.textSecondary }]}>
        {`${t(ORIGIN_LABEL[sanction.origin])} · ${t(sanction.reviewedByPerson ? 'standing.reviewed' : 'standing.notReviewed')}`}
      </Text>

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
            <Pressable onPress={() => setAsking(true)} accessibilityRole="button" style={styles.ask}>
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
  summaryText: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, lineHeight: 22 },
  limits: { marginTop: spacing.md, gap: spacing.xs },
  limitRow: { gap: 2, paddingVertical: spacing.xs },
  limitName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  limitUntil: { fontSize: typography.sizes.sm },
  section: { ...sectionLabel, marginTop: spacing.sm },
  empty: { fontSize: typography.sizes.sm },
  kind: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold },
  meta: { fontSize: typography.sizes.sm, lineHeight: 20, marginTop: spacing.xs },
  statement: { marginTop: spacing.sm, paddingVertical: spacing.xs },
  statementLtr: { borderLeftWidth: 3, paddingLeft: spacing.md },
  statementRtl: { borderRightWidth: 3, paddingRight: spacing.md },
  statementText: { fontSize: typography.sizes.md, lineHeight: 22 },
  askWrap: { marginTop: spacing.xs },
  ask: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  askText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  appeal: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radii.md },
  appealStatus: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
});
