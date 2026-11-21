import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import type { ProverbView } from '@kurda/shared';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { HeaderButton } from '../navigation/HeaderButton';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useHardwareBack } from '../navigation/hardwareBack';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { useDirection } from '../reports/direction';
import { COLUMN, Note, Pill } from '../stories/ui';
import { display } from '../theme/fonts';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { getProverb, proverbUrl } from './api';
import { THEME_KEY, centred, kurdishIn, proverbTranslation, traditionLine, traditionMark } from './labels';
import { EnglishNote, InLanguage, Section, SourcesList } from './parts';
import { dialectNameKey } from '../i18n/dialectName';

/**
 * One proverb (`app/learn/proverbs/<slug>`), set like a line of poetry between two short gold rules, in its own Kurdish
 * and direction with its translation under it. Then whatever the proverb has: the literal sense, the meaning and when
 * it is said, a scene with its translation, the background, other ways it is said, an equivalent saying in the reader's
 * language, its origin and its sources. Missing translations show in English, said once; a part with nothing is left
 * out. Sharing sends the saying, its translation and its address.
 */
export function ProverbScreen({ slug, onExit }: { slug: string; onExit: () => void }): React.JSX.Element {
  useHardwareBack(onExit);
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const bottom = useScreenBottomInset(spacing.lg);
  const [proverb, setProverb] = useState<ProverbView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(() => {
    setError(null);
    void getProverb(client, slug).then((res) => {
      if (res.ok) setProverb(res.data.proverb);
      else setError(res.error);
    });
  }, [client, slug]);
  useEffect(load, [load]);

  if (error || !proverb) {
    return (
      <GradientBackground>
        <ScreenHeader title={t('lore.proverbs.name')} onBack={onExit} />
        {error ? (
          error.status === 404 ? (
            <View style={styles.content}>
              <Note icon="quotes">{t('lore.proverb.unavailable')}</Note>
            </View>
          ) : (
            <ErrorRetry message={describeError(error, t)} onRetry={load} />
          )
        ) : (
          <View style={[styles.content, styles.skeleton]} accessibilityLabel={t('common.loading')}>
            <SkeletonText size={typography.sizes.title} width="80%" />
            <SkeletonText size={typography.sizes.text} width="60%" />
          </View>
        )}
      </GradientBackground>
    );
  }

  const ku = kurdishIn(proverb.dialect);
  const tr = proverbTranslation(proverb, locale);
  const v = tr?.value;
  const lang = tr?.lang ?? 'en';
  const share = (): void => {
    const lines = [proverb.text, v?.translation, proverbUrl(proverb.slug)].filter(Boolean).join('\n');
    void Share.share({ message: lines }).catch(() => undefined);
  };

  return (
    <GradientBackground>
      <ScreenHeader title={t('lore.proverbs.name')} onBack={onExit} right={<HeaderButton icon="share" label={t('lore.proverb.share')} onPress={share} />} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom + spacing.lg }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.facts, { flexDirection: dir.row }]}>
          {/* Where a proverb comes from is information, not a prize: the quiet pill, as its themes are. */}
          <Pill label={traditionMark(proverb.tradition, proverb.region, t)} />
          {proverb.themes.map((th) => (
            <Pill key={th} label={t(THEME_KEY[th])} />
          ))}
        </View>

        <View style={styles.verse}>
          <View style={[styles.rule, { backgroundColor: colors.textSecondary }]} />
          <Text {...ku.props} style={[styles.proverb, { color: colors.textPrimary }, centred(ku.style)]} accessibilityRole="header" testID="proverb-text">
            {proverb.text}
          </Text>
          {v ? <InLanguage text={v.translation} lang={lang} align="center" style={[styles.translation, { color: colors.textSecondary }]} /> : null}
          <View style={[styles.rule, { backgroundColor: colors.textSecondary }]} />
        </View>

        {v?.literal ? (
          <Section label={t('lore.proverb.literal')}>
            <InLanguage text={v.literal} lang={lang} style={[styles.body, { color: colors.textPrimary }]} />
          </Section>
        ) : null}

        {v ? (
          <Section label={t('lore.proverb.meaning')}>
            <InLanguage text={v.meaning} lang={lang} style={[styles.lead, { color: colors.textPrimary }]} />
            <InLanguage text={v.explanation} lang={lang} style={[styles.body, { color: colors.textPrimary }]} />
          </Section>
        ) : null}

        <Section label={t('lore.proverb.example')}>
          <View style={[styles.scene, { backgroundColor: colors.surface }]}>
            <Text {...ku.props} style={[styles.body, { color: colors.textPrimary }, ku.style]}>
              {proverb.exampleKu}
            </Text>
            {v ? <InLanguage text={v.example} lang={lang} style={[styles.sceneTranslation, { color: colors.textSecondary }]} /> : null}
          </View>
        </Section>

        {v?.context ? (
          <Section label={t('lore.proverb.context')}>
            <InLanguage text={v.context} lang={lang} style={[styles.body, { color: colors.textPrimary }]} />
          </Section>
        ) : null}

        {proverb.variants.length > 0 ? (
          <Section label={t('lore.proverb.variants')}>
            <View style={styles.variants}>
              {proverb.variants.map((variant, i) => {
                const vku = kurdishIn(variant.dialect);
                return (
                  <View key={`${variant.text}-${i}`} style={styles.variant}>
                    <Text {...vku.props} style={[styles.variantText, { color: colors.textPrimary }, vku.style]}>
                      {variant.text}
                    </Text>
                    <Text style={[styles.meta, dir.text, { color: colors.textSecondary }]}>{[t(dialectNameKey(variant.dialect)), variant.region].filter(Boolean).join(' · ')}</Text>
                    {variant.note ? <Text style={[styles.meta, dir.free, { color: colors.textSecondary }]}>{variant.note}</Text> : null}
                  </View>
                );
              })}
            </View>
          </Section>
        ) : null}

        {v?.equivalent ? (
          <Section label={t('lore.proverb.equivalent')}>
            <InLanguage text={v.equivalent} lang={lang} style={[styles.lead, { color: colors.textPrimary }]} />
          </Section>
        ) : null}

        <Section label={t('lore.answer.origin')}>
          <Text style={[styles.body, dir.text, { color: colors.textPrimary }]}>{traditionLine('proverb', proverb.tradition, proverb.region, t)}</Text>
        </Section>

        <SourcesList sources={proverb.sources} />
        {tr ? <EnglishNote lang={tr.lang} dialect={proverb.dialect} /> : null}
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  content: { ...COLUMN, padding: spacing.lg, gap: spacing.lg },
  skeleton: { alignItems: 'center', paddingTop: spacing.xxl },
  facts: { flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs },
  verse: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  // A quiet rule above and below the verse, in the page's secondary ink softened, as a story's chapter rule is.
  rule: { width: 32, height: 2, borderRadius: radii.pill, opacity: 0.4 },
  proverb: { ...display(typography.sizes.title), lineHeight: Math.round(typography.sizes.title * 1.4) },
  translation: { fontSize: typography.sizes.text, lineHeight: 30 },
  lead: { fontSize: typography.sizes.text, lineHeight: 24, fontWeight: typography.weights.semibold },
  body: { fontSize: typography.sizes.text, lineHeight: 26 },
  scene: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  sceneTranslation: { fontSize: typography.sizes.text, lineHeight: 22 },
  variants: { gap: spacing.md },
  variant: { gap: 2 },
  variantText: { fontSize: typography.sizes.text, lineHeight: 24, fontWeight: typography.weights.medium },
  meta: { fontSize: typography.sizes.text, lineHeight: 18 },
});
