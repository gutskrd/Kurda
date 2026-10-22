import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { THEME_PREFERENCES, PREFERENCE_LABEL, type ThemePreference } from '../theme/appearance';
import { ClayButton, GlassCard, GradientBackground, Segmented } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { sectionLabel, display } from '../theme/fonts';
import { useI18n } from '../i18n/I18nContext';
import { ScreenHeader } from '../navigation/ScreenHeader';

/**
 * Appearance settings + live design showcase (KUR-268 / KUR-270). Picks
 * light/dark/system and previews the glassmorphism / claymorphism language in
 * the active scheme so the whole system can be judged in one place.
 */
export function AppearanceScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { colors, scheme, preference, setPreference } = useTheme();
  const { t } = useI18n();

  return (
    <GradientBackground>
      <ScreenHeader title={t('appearance.title')} onBack={onExit} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        <GlassCard>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{t('appearance.theme')}</Text>
          <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
            {t('appearance.help')}
          </Text>
          <View style={{ marginTop: spacing.md }}>
            <Segmented<ThemePreference>
              options={THEME_PREFERENCES}
              value={preference}
              onChange={setPreference}
              labelOf={(p) => t(PREFERENCE_LABEL[p])}
            />
          </View>
          <Text style={[styles.activeNote, { color: colors.textSecondary }]}>
            {t('appearance.currentlyScheme', {
              scheme: t(scheme === 'dark' ? 'appearance.scheme.dark' : 'appearance.scheme.light'),
            })}
          </Text>
        </GlassCard>

        <Text style={[styles.section, { color: colors.textSecondary }]}>{t('appearance.preview')}</Text>

        <GlassCard>
          <View style={styles.previewHead}>
            <View style={[styles.dot, { backgroundColor: colors.primary }]} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{t('appearance.glass.name')}</Text>
          </View>
          <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
            {t('appearance.glass.help')}
          </Text>

          <View style={styles.tiles}>
            <GlassCard style={styles.tile}>
              <Text style={[styles.tileNum, { color: colors.primary }]}>7</Text>
              <Text style={[styles.tileLabel, { color: colors.textSecondary }]}>{t('appearance.preview.dayStreak')}</Text>
            </GlassCard>
            <GlassCard style={styles.tile}>
              <Text style={[styles.tileNum, { color: colors.gold }]}>1.2k</Text>
              <Text style={[styles.tileLabel, { color: colors.textSecondary }]}>XP</Text>
            </GlassCard>
          </View>

          {/*
           * What the two kinds of button look like, shown rather than offered:
           * a picture of buttons, not two buttons that do nothing when tapped.
           */}
          <View
            pointerEvents="none"
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${t('appearance.swatch.primary')}, ${t('appearance.swatch.soft')}`}
          >
            <View style={styles.actions} aria-hidden>
              <ClayButton label={t('appearance.swatch.primary')} tone="primary" onPress={() => undefined} style={styles.swatch} />
              <ClayButton label={t('appearance.swatch.soft')} tone="neutral" onPress={() => undefined} style={styles.swatch} />
            </View>
          </View>
        </GlassCard>

        <Text style={[styles.footNote, { color: colors.textSecondary }]}>
          {t('appearance.footNote')}
        </Text>
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  swatch: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  cardTitle: { ...display(typography.sizes.lg) },
  cardHint: { fontSize: typography.sizes.sm, marginTop: 4, lineHeight: 20 },
  activeNote: { fontSize: typography.sizes.sm, marginTop: spacing.md },
  section: { ...sectionLabel, marginTop: spacing.sm, marginLeft: spacing.xs },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: radii.pill },
  tiles: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  tile: { flex: 1, borderRadius: radii.lg },
  tileNum: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold },
  tileLabel: { fontSize: typography.sizes.xs, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  footNote: { fontSize: typography.sizes.xs, textAlign: 'center', marginTop: spacing.sm, lineHeight: 18 },
});
