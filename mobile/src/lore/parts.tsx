import type { ReactNode } from 'react';
import { Linking, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { originalLocale, type AppLocale, type GameDialect, type LoreSource } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { display, sectionLabel } from '../theme/fonts';
import { Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { heldDim } from '../theme/MotionParts';
import { Pressable } from '../theme/Pressable';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { besideName, textIn, varietyName } from './labels';

/**
 * Small pieces the riddle and proverb screens share: a collection's title
 * (its Kurmancî name, and the reader's word for it beside), the switch
 * between the two varieties, a labelled section, a translation set in its
 * own language, and the list of sources a riddle or a proverb was found in.
 */

/** "Metelok · Riddles": the Kurmancî name in the display face, the reader's own word after it. */
export function CollectionTitle({ kurmanci, localized, line }: { kurmanci: string; localized: string; line?: string | null }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const beside = besideName(kurmanci, localized);
  return (
    <View style={styles.title} accessible accessibilityRole="header" accessibilityLabel={beside ? `${kurmanci}, ${beside}` : kurmanci}>
      <View style={[styles.titleRow, { flexDirection: dir.row }]}>
        <Text style={[styles.titleKu, { color: colors.textPrimary }]} accessibilityLanguage="ku">
          {kurmanci}
        </Text>
        {beside ? <Text style={[styles.titleBeside, dir.text, { color: colors.textSecondary }]}>{beside}</Text> : null}
      </View>
      {line ? <Text style={[styles.titleLine, dir.text, { color: colors.textSecondary }]}>{line}</Text> : null}
    </View>
  );
}

/** Kurmancî or Soranî: which variety's riddles (or proverbs) the list holds. */
export function VarietySwitch({ value, onChange }: { value: GameDialect; onChange: (d: GameDialect) => void }): React.JSX.Element {
  const { t } = useI18n();
  return <Segmented<GameDialect> options={['kmr', 'ckb']} value={value} onChange={onChange} labelOf={varietyName} groupLabel={t('stories.variety')} />;
}

/** A labelled part of a page: the small grey word, then what it is about. */
export function Section({ label, children, style }: { label: string; children: ReactNode; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={[styles.section, style]}>
      <Text style={[sectionLabel, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
        {label}
      </Text>
      {children}
    </View>
  );
}

/**
 * A text in one of the app's languages — a translation, an explanation —
 * set in that language's direction and read in it, whatever the interface
 * is in. `align` centres it under a centred original.
 */
export function InLanguage({
  text,
  lang,
  style,
  align,
  numberOfLines,
}: {
  text: string;
  lang: AppLocale;
  style?: StyleProp<TextStyle>;
  align?: 'center';
  numberOfLines?: number;
}): React.JSX.Element {
  const set = textIn(lang);
  return (
    <Text {...set.props} style={[style, set.style, align === 'center' ? styles.centre : null]} numberOfLines={numberOfLines}>
      {text}
    </Text>
  );
}

/**
 * The one line that says a translation is the English one because the
 * reader's language has none yet — and only then: a Kurmancî reader of a
 * Kurmancî riddle is reading their own language already, and is told nothing.
 */
export function EnglishNote({ lang, dialect }: { lang: AppLocale; dialect: GameDialect }): React.JSX.Element | null {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  if (lang !== 'en' || locale === 'en' || locale === originalLocale(dialect)) return null;
  return <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('stories.reader.inEnglish')}</Text>;
}

/**
 * Where a riddle or a proverb was found: each source's title, who wrote it,
 * what it gives, and a link where it is online (opened in the browser).
 * Titles and authors are written as they were printed, in their own language.
 */
export function SourcesList({ sources }: { sources: readonly LoreSource[] }): React.JSX.Element | null {
  const { t } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  if (sources.length === 0) return null;
  return (
    <Section label={t('lore.sources')}>
      <View style={styles.sources}>
        {sources.map((s, i) => {
          const body = (
            <>
              <Text style={[styles.sourceTitle, dir.free, { color: s.url ? colors.primary : colors.textPrimary }]}>{s.title}</Text>
              {s.author ? <Text style={[styles.sourceMeta, dir.free, { color: colors.textSecondary }]}>{s.author}</Text> : null}
              {s.note ? <Text style={[styles.sourceMeta, dir.free, { color: colors.textSecondary }]}>{s.note}</Text> : null}
            </>
          );
          return s.url ? (
            <Pressable
              key={`${s.title}-${i}`}
              onPress={() => void Linking.openURL(s.url!).catch(() => undefined)}
              accessibilityRole="link"
              accessibilityLabel={s.title}
              accessibilityHint={t('lore.source.open')}
              style={({ pressed }) => [styles.source, { flexDirection: dir.row }, pressed && heldDim]}
            >
              <View style={styles.sourceBody}>{body}</View>
              <Icon name="link" size={16} color={colors.primary} />
            </Pressable>
          ) : (
            <View key={`${s.title}-${i}`} style={[styles.source, { flexDirection: dir.row }]}>
              <View style={styles.sourceBody}>{body}</View>
            </View>
          );
        })}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  title: { gap: spacing.xs },
  titleRow: { alignItems: 'baseline', flexWrap: 'wrap', columnGap: spacing.sm },
  titleKu: { ...display(typography.sizes.xl) },
  titleBeside: { fontSize: typography.sizes.lg, fontWeight: typography.weights.regular },
  titleLine: { fontSize: typography.sizes.sm, lineHeight: 20 },
  section: { gap: spacing.sm },
  centre: { textAlign: 'center' },
  note: { fontSize: typography.sizes.xs, lineHeight: 18 },
  sources: { gap: spacing.xs },
  source: { alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET, borderRadius: radii.sm },
  sourceBody: { flex: 1, gap: 2, paddingVertical: spacing.xs },
  sourceTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, lineHeight: 20 },
  sourceMeta: { fontSize: typography.sizes.xs, lineHeight: 18 },
});
