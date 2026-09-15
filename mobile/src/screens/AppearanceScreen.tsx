import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { THEME_PREFERENCES, PREFERENCE_LABEL, type ThemePreference } from '../theme/appearance';
import { ClayButton, GlassCard, GradientBackground, Segmented } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';

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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={onExit} accessibilityRole="button" hitSlop={10}>
            <Text style={[styles.back, { color: colors.textSecondary }]}>‹ Back</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Appearance</Text>
          <View style={{ width: 44 }} />
        </View>

        <GlassCard>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Theme</Text>
          <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
            {t('appearance.help')}
          </Text>
          <View style={{ marginTop: spacing.md }}>
            <Segmented<ThemePreference>
              options={THEME_PREFERENCES}
              value={preference}
              onChange={setPreference}
              labelOf={(p) => PREFERENCE_LABEL[p]}
            />
          </View>
          <Text style={[styles.activeNote, { color: colors.textSecondary }]}>
            {t('appearance.currently')} <Text style={{ color: colors.primary, fontWeight: typography.weights.bold }}>{scheme}</Text> theme.
          </Text>
        </GlassCard>

        <Text style={[styles.section, { color: colors.textSecondary }]}>Preview</Text>

        <GlassCard>
          <View style={styles.previewHead}>
            <View style={[styles.dot, { backgroundColor: colors.primary }]} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{t('appearance.glass.name')}</Text>
          </View>
          <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
            {t('appearance.glass.help')}
          </Text>

          <View style={styles.tiles}>
            <GlassCard style={styles.tile} intensity={colors.blurIntensity + 8}>
              <Text style={[styles.tileNum, { color: colors.primary }]}>7</Text>
              <Text style={[styles.tileLabel, { color: colors.textSecondary }]}>day streak</Text>
            </GlassCard>
            <GlassCard style={styles.tile} intensity={colors.blurIntensity + 8}>
              <Text style={[styles.tileNum, { color: colors.gold }]}>1.2k</Text>
              <Text style={[styles.tileLabel, { color: colors.textSecondary }]}>XP</Text>
            </GlassCard>
          </View>

          <View style={styles.actions}>
            <ClayButton label="Primary" tone="primary" onPress={() => {}} style={{ flex: 1 }} />
            <ClayButton label="Soft" tone="neutral" onPress={() => {}} style={{ flex: 1 }} />
          </View>
        </GlassCard>

        <Text style={[styles.footNote, { color: colors.textSecondary }]}>
          Claymorphic buttons + neumorphic tiles, minimalist spacing, depth from layered glass.
        </Text>
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  cardTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  cardHint: { fontSize: typography.sizes.sm, marginTop: 4, lineHeight: 20 },
  activeNote: { fontSize: typography.sizes.sm, marginTop: spacing.md },
  section: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.sm, marginLeft: spacing.xs },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: radii.pill },
  tiles: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  tile: { flex: 1, borderRadius: radii.lg },
  tileNum: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold },
  tileLabel: { fontSize: typography.sizes.xs, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  footNote: { fontSize: typography.sizes.xs, textAlign: 'center', marginTop: spacing.sm, lineHeight: 18 },
});
