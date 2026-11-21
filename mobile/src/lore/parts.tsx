import type { ReactNode } from 'react';
import { Linking, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
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
import { collectionName, textIn } from './labels';
import { openableSourceUrl } from './sourceLink';
import { dialectNameKey } from '../i18n/dialectName';

/**
 * Small pieces the riddle and proverb screens share: a collection's title, the variety switch, a labelled section, a
 * translation set in its own language, and the list of sources.
 */

/** "Metelok · Riddles": the Kurdish name in the display face, the reader's own word after it (`collectionName`). */
export function CollectionTitle({ kurmanci, localized, line }: { kurmanci: string; localized: string; line?: string | null }): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
  const dir = useDirection();
  const { name, beside, lang } = collectionName(kurmanci, localized, locale);
  return (
    <View style={styles.title} accessible accessibilityRole="header" accessibilityLabel={beside ? `${name}, ${beside}` : name}>
      <View style={[styles.titleRow, { flexDirection: dir.row }]}>
        <Text style={[styles.titleKu, { color: colors.textPrimary }]} accessibilityLanguage={lang}>
          {name}
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
  return <Segmented<GameDialect> options={['kmr', 'ckb']} value={value} onChange={onChange} labelOf={(d) => t(dialectNameKey(d))} groupLabel={t('stories.variety')} />;
}

/** A labelled part of a page: the small grey word, then what it is about. */
export function Section({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={styles.section}>
      <Text style={[sectionLabel, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
        {label}
      </Text>
      {children}
    </View>
  );
}

/**
 * Text in one of the app's languages (a translation, an explanation), set and read in that language's direction
 * whatever the interface is in. `align` centres it under a centred original.
 */
export function InLanguage({
  text,
  lang,
  style,
  align,
}: {
  text: string;
  lang: AppLocale;
  style?: StyleProp<TextStyle>;
  align?: 'center';
}): React.JSX.Element {
  const set = textIn(lang);
  return (
    <Text {...set.props} style={[style, set.style, align === 'center' ? styles.centre : null]}>
      {text}
    </Text>
  );
}

/**
 * The one line that says a translation is the English one because the reader's language has none yet, and only then.
 */
export function EnglishNote({ lang, dialect }: { lang: AppLocale; dialect: GameDialect }): React.JSX.Element | null {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  if (lang !== 'en' || locale === 'en' || locale === originalLocale(dialect)) return null;
  return <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('stories.reader.inEnglish')}</Text>;
}

/**
 * Where a riddle or proverb was found: each source's title, author, what it gives, and a link where it is online.
 * Titles and authors are written as printed, in their own language.
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
          // Only an https address is a link (sourceLink.ts); any other source reads as plain text.
          const url = openableSourceUrl(s.url);
          const body = (
            <>
              <Text style={[styles.sourceTitle, dir.free, { color: url ? colors.primary : colors.textPrimary }]}>{s.title}</Text>
              {s.author ? <Text style={[styles.sourceMeta, dir.free, { color: colors.textSecondary }]}>{s.author}</Text> : null}
              {s.note ? <Text style={[styles.sourceMeta, dir.free, { color: colors.textSecondary }]}>{s.note}</Text> : null}
            </>
          );
          return url ? (
            <Pressable
              key={`${s.title}-${i}`}
              onPress={() => void Linking.openURL(url).catch(() => undefined)}
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
  titleKu: { ...display(typography.sizes.title) },
  titleBeside: { fontSize: typography.sizes.text, fontWeight: typography.weights.regular },
  titleLine: { fontSize: typography.sizes.text, lineHeight: 20 },
  section: { gap: spacing.sm },
  centre: { textAlign: 'center' },
  note: { fontSize: typography.sizes.text, lineHeight: 18 },
  sources: { gap: spacing.xs },
  source: { alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET, borderRadius: radii.sm },
  sourceBody: { flex: 1, gap: 2, paddingVertical: spacing.xs },
  sourceTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, lineHeight: 20 },
  sourceMeta: { fontSize: typography.sizes.text, lineHeight: 18 },
});
