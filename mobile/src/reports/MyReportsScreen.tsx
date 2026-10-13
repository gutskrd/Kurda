import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MyReport } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { GlassCard, GradientBackground } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { myReports } from './api';
import { AppealForm } from './AppealForm';
import { useDirection } from './direction';
import { CATEGORY_LABEL, REPORT_STATUS_LABEL, TARGET_LABEL } from './labels';
import { formatDay } from './sendErrors';

/**
 * My reports: everything you reported and what became of it.
 *
 * A report used to vanish into a thank-you: nothing on the phone said it had
 * been looked at. The receipt is here at once ("Waiting for review"), and the
 * outcome when there is one — "We took action" with no word about what, since
 * what happened to someone else is theirs; or "it doesn't break our rules",
 * with a way to ask for a second look, once.
 */
export function MyReportsScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { t } = useI18n();
  const [reports, setReports] = useState<MyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void myReports(client).then((res) => {
      setLoading(false);
      if (res.ok) {
        setReports(res.data.reports);
        setError(null);
      } else setError(res.error);
    });
  }, [client]);

  useEffect(load, [load]);

  return (
    <GradientBackground>
      <ScreenHeader title={t('reports.title')} onBack={onExit} hairline />
      <AsyncBoundary
        loading={loading && reports.length === 0}
        error={reports.length === 0 ? error : null}
        isEmpty={reports.length === 0}
        emptyText={t('reports.empty')}
        onRetry={load}
      >
        <FlatList
          data={reports}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <ReportRow report={item} />}
        />
      </AsyncBoundary>
    </GradientBackground>
  );
}

const STATUS_ICON: Record<MyReport['status'], IconName> = {
  open: 'flag',
  actioned: 'check',
  no_violation: 'shield',
};

function ReportRow({ report }: { report: MyReport }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [asking, setAsking] = useState(false);
  const [filed, setFiled] = useState(false);
  const what = report.targetLabel ?? t(TARGET_LABEL[report.targetType]);
  const statusColor = report.status === 'actioned' ? colors.success : colors.textSecondary;

  return (
    <GlassCard style={styles.card}>
      <View style={[styles.head, { flexDirection: dir.row }]}>
        <Text style={[styles.what, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
          {what}
        </Text>
        <Text style={[styles.date, { color: colors.textSecondary }]}>
          {t('reports.reported', { date: formatDay(report.createdAt, locale) })}
        </Text>
      </View>
      <Text style={[styles.category, dir.text, { color: colors.textSecondary }]}>{t(CATEGORY_LABEL[report.category])}</Text>
      <View style={[styles.status, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}>
        <Icon name={STATUS_ICON[report.status]} size={18} color={statusColor} />
        <Text style={[styles.statusText, dir.text, { color: colors.textPrimary }]}>{t(REPORT_STATUS_LABEL[report.status])}</Text>
      </View>
      {filed ? (
        <Text style={[styles.note, dir.text, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
          {t('appeal.sent')}
        </Text>
      ) : report.canAppeal && report.caseId ? (
        asking ? (
          <AppealForm client={client} subject={{ caseId: report.caseId }} onFiled={() => setFiled(true)} />
        ) : (
          <Pressable onPress={() => setAsking(true)} accessibilityRole="button" style={styles.ask}>
            <Text style={[styles.askText, dir.text, { color: colors.primary }]}>{t('reports.askSecondLook')}</Text>
          </Pressable>
        )
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.md },
  card: {},
  head: { alignItems: 'baseline', gap: spacing.sm },
  what: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  date: { fontSize: typography.sizes.xs },
  category: { fontSize: typography.sizes.sm, marginTop: 2 },
  status: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  statusText: { flex: 1, fontSize: typography.sizes.sm, lineHeight: 20 },
  note: { fontSize: typography.sizes.sm, marginTop: spacing.sm },
  ask: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  askText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
});
