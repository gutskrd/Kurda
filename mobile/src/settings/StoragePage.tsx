import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { formatDay } from '../i18n/format';
import { useDirection } from '../reports/direction';
import { timing, useCountUp } from '../theme/animate';
import { BottomSheet } from '../theme/BottomSheet';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Loading } from '../theme/Loading';
import { duration } from '../theme/motion';
import { Pressable } from '../theme/Pressable';
import { heldDim } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { madeAt, useDataExport } from './dataExport';
import { clearCache, formatBytes, measureCache } from './deviceCache';
import { SettingsRow, SettingsSection } from './list';

/** How long "Cache cleared" stays before it fades. */
const CLEARED_MS = 2600;

/**
 * Storage and data: what Hevalo keeps on this phone to be quick, and the way to clear it; then a copy of everything
 * the account holds, to save. A guest has no copy to make, so sees only the first.
 */
export function StoragePage(): React.JSX.Element {
  const { isGuest } = useAuth();
  return (
    <>
      <CacheSection />
      {isGuest ? null : <ExportSection />}
    </>
  );
}

/** The cache's size, measured whenever the page comes into view, and Clear cache behind a confirming sheet. */
function CacheSection(): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  // From and to, so a size that changes counts to its new value rather than jumping.
  const [size, setSize] = useState<{ from: number; to: number } | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [asking, setAsking] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);
  const shown = useCountUp(size?.to ?? 0, { from: size?.from ?? 0, ms: size && size.from !== size.to ? duration.progress * 2 : 0 });

  const measure = useCallback(async () => {
    const bytes = await measureCache();
    if (bytes === null) setUnknown(true);
    else setSize((was) => ({ from: was?.to ?? bytes, to: bytes }));
  }, []);
  useFocusEffect(
    useCallback(() => {
      void measure();
    }, [measure]),
  );

  // "Cache cleared" fades in under the row and out again by itself.
  const note = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!cleared) return;
    if (reduce) note.setValue(1);
    else timing(note, 1, duration.base).start();
    const hide = setTimeout(() => {
      if (reduce) setCleared(false);
      else timing(note, 0, duration.slow).start(() => setCleared(false));
    }, CLEARED_MS);
    return () => clearTimeout(hide);
  }, [cleared, note, reduce]);

  const clear = (): void => {
    setAsking(false);
    setClearing(true);
    haptic('tap');
    void clearCache(client)
      .then(measure)
      .finally(() => {
        setClearing(false);
        setCleared(true);
      });
  };

  const value = unknown ? undefined : size ? formatBytes(shown, t, locale) : t('storage.measuring');
  return (
    <>
      <SettingsSection title={t('storage.device')} first>
        <SettingsRow icon="image" title={t('storage.cache')} subtitle={t('storage.cacheHint')} value={value} testID="storage-size" />
        <SettingsRow
          icon="trash"
          title={t('storage.clear')}
          opens={false}
          onPress={() => setAsking(true)}
          trailing={clearing ? <Loading label={t('storage.clearing')} /> : undefined}
          testID="storage-clear"
        />
      </SettingsSection>
      {cleared ? (
        <Animated.View style={[styles.cleared, { flexDirection: dir.row, opacity: note }]} accessibilityLiveRegion="polite" testID="storage-cleared">
          <Icon name="check" size={18} color={colors.success} />
          <Text style={[styles.clearedText, dir.text, { color: colors.textSecondary }]}>{t('storage.cleared')}</Text>
        </Animated.View>
      ) : null}

      <BottomSheet visible={asking} onClose={() => setAsking(false)} title={t('storage.clearTitle')} testID="storage-clear-ask">
        <Text style={[styles.sheetBody, dir.text, { color: colors.textSecondary }]}>{t('storage.clearBody')}</Text>
        <View style={styles.sheetActions}>
          <ClayButton label={t('storage.clear')} tone="primary" size="large" onPress={clear} testID="storage-clear-confirm" />
          <ClayButton label={t('common.cancel')} variant="outline" onPress={() => setAsking(false)} />
        </View>
      </BottomSheet>
    </>
  );
}

/** A copy of your data: asked for, prepared while you wait or come back, then saved from a fresh link. */
function ExportSection(): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const data = useDataExport(true);
  const state = data.status?.status;
  const madeOn = madeAt(data.status);
  const made = madeOn ? formatDay(new Date(madeOn), locale) : null;

  return (
    <SettingsSection title={t('settings.data.title')} footer={t('storage.dataHint')}>
      {state === 'ready' ? (
        <View style={styles.ready}>
          <ClayButton
            label={t('storage.download')}
            icon="download"
            tone="primary"
            size="large"
            busy={data.busy === 'download'}
            onPress={data.download}
            testID="export-download"
          />
          {made ? <Text style={[styles.made, styles.center, { color: colors.textSecondary }]}>{t('storage.madeOn', { date: made })}</Text> : null}
          <Pressable
            onPress={data.request}
            disabled={data.busy !== null}
            accessibilityRole="button"
            style={({ pressed }) => [styles.again, pressed && heldDim]}
            testID="export-again"
          >
            {data.busy === 'request' ? <Loading /> : <Text style={[styles.againText, { color: colors.primary }]}>{t('storage.again')}</Text>}
          </Pressable>
          {data.onceADay ? <Text style={[styles.made, styles.center, { color: colors.textSecondary }]}>{t('storage.onceADay')}</Text> : null}
        </View>
      ) : state === 'pending' ? (
        <View style={[styles.preparing, { flexDirection: dir.row }]} accessibilityLiveRegion="polite" testID="export-pending">
          <Loading label={t('storage.preparing')} />
          <View style={styles.words}>
            <Text style={[styles.title, dir.text, { color: colors.textPrimary }]}>{t('storage.preparing')}</Text>
            <Text style={[styles.made, dir.text, { color: colors.textSecondary }]}>{t('storage.preparingHint')}</Text>
          </View>
        </View>
      ) : state === 'none' ? (
        <SettingsRow
          icon="download"
          title={t('settings.data.download')}
          opens={false}
          onPress={data.request}
          trailing={data.busy === 'request' ? <Loading /> : undefined}
          testID="export-request"
        />
      ) : (
        <View style={styles.preparing}>
          <Loading />
        </View>
      )}
      {data.failed ? (
        <View style={[styles.failed, { flexDirection: dir.row, backgroundColor: colors.dangerFill }]} accessibilityLiveRegion="polite" testID="export-failed">
          <Icon name="alert" size={16} color={colors.danger} />
          <Text style={[styles.failedText, dir.text, { color: colors.danger }]}>{data.failed}</Text>
        </View>
      ) : null}
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  cleared: { alignItems: 'center', gap: spacing.xs + 2, paddingHorizontal: spacing.md + 4, paddingTop: spacing.sm },
  clearedText: { fontSize: typography.sizes.text },
  sheetBody: { fontSize: typography.sizes.text, lineHeight: 22 },
  sheetActions: { gap: spacing.sm, marginTop: spacing.sm },
  ready: { padding: spacing.md, gap: spacing.sm },
  made: { fontSize: typography.sizes.text, lineHeight: 20 },
  center: { textAlign: 'center' },
  again: { minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  againText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  preparing: { alignItems: 'center', gap: spacing.sm + 4, minHeight: 64, paddingHorizontal: spacing.sm + 4, paddingVertical: spacing.sm + 2 },
  words: { flex: 1, gap: 2 },
  title: { fontSize: typography.sizes.text },
  failed: { alignItems: 'flex-start', gap: spacing.sm, margin: spacing.sm, marginTop: 0, padding: spacing.sm, borderRadius: radii.sm },
  failedText: { flex: 1, fontSize: typography.sizes.text, lineHeight: 20 },
});
