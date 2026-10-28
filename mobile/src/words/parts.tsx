import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import {
  CALENDAR_MONTHS,
  dayParts,
  easternDigits,
  exampleMeaningLocale,
  wordGloss,
  wordIn,
  type AlphabetScript,
  type AppLocale,
  type DayOfYear,
  type KurdishWord,
  type SetWord,
  type WordDay,
} from '@kurda/shared';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { scriptLanguage, scriptText } from '../alphabet/parts';
import { useDirection } from '../reports/direction';
import { display } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

/**
 * The small parts the word sets are drawn with, on their tiles, their sheet
 * and their practice alike: a colour's swatch, a number's digits (Soranî's
 * own beside the Western ones), a day's name with the number inside it marked
 * in gold — the colour the alphabet keeps for "notice this" — and a word with
 * its Soranî Latin under the script.
 */

/** A colour, as a swatch. Edged, so white shows on white and black on black. */
export function Swatch({ hex, size, style }: { hex: string; size: number; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  return <View style={[{ width: size, height: size, borderRadius: size / 4, backgroundColor: hex, borderColor: colors.separator }, styles.edge, style]} />;
}

/** A number's digits: the Western ones in Kurmancî; in Soranî the ones it is printed in, with the Western ones beside them. */
export function Digits({ value, dialect, size }: { value: number; dialect: AlphabetScript; size: number }): React.JSX.Element {
  const { colors } = useTheme();
  const western = String(value);
  if (dialect === 'kmr') return <Text style={[styles.digits, { fontSize: size, lineHeight: Math.round(size * 1.15), color: colors.textPrimary }]}>{western}</Text>;
  return (
    <Text style={[styles.digits, { fontSize: size, lineHeight: Math.round(size * 1.3), color: colors.textPrimary }]} accessibilityLanguage="ckb">
      {easternDigits(value)}
      <Text style={[styles.digitsSmall, { fontSize: Math.round(size * 0.55), color: colors.textSecondary }]}>{` ${western}`}</Text>
    </Text>
  );
}

/** A day's name with the number inside it marked: Yekşem, the first after Şemî. */
export function DayName({ day, dialect, style }: { day: WordDay; dialect: AlphabetScript; style?: StyleProp<TextStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const parts = dayParts(day, dialect);
  return (
    <Text style={[scriptText(dialect), { color: colors.textPrimary }, style]} accessibilityLanguage={scriptLanguage(dialect)}>
      {parts ? (
        <>
          <Text style={[styles.mark, { color: colors.goldText, textDecorationColor: colors.gold }]}>{parts.number}</Text>
          {parts.rest}
        </>
      ) : (
        wordIn(day, dialect)
      )}
    </Text>
  );
}

/**
 * A Kurdish word in its dialect, and for Soranî the same word in Latin
 * letters under it — the bridge for a reader of the other script.
 */
export function WordText({
  word,
  dialect,
  size,
  align = 'center',
  latin = true,
}: {
  word: KurdishWord;
  dialect: AlphabetScript;
  size: number;
  align?: 'center' | 'start';
  latin?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const at: TextStyle = align === 'center' ? { textAlign: 'center' } : dir.text;
  return (
    <View>
      <Text
        style={[
          dialect === 'ckb' ? { fontSize: size, lineHeight: Math.round(size * 1.5) } : { ...display(size), lineHeight: Math.round(size * 1.2) },
          scriptText(dialect),
          at,
          { color: colors.textPrimary },
        ]}
        accessibilityLanguage={scriptLanguage(dialect)}
      >
        {wordIn(word, dialect)}
      </Text>
      {dialect === 'ckb' && latin ? (
        <Text style={[styles.latin, at, { color: colors.textSecondary }]} accessibilityLanguage="ku">
          {word.ckbLatin}
        </Text>
      ) : null}
    </View>
  );
}

/** How many of this set's words have been opened here, as the alphabet shows its letters. */
export function Progress({ explored, total }: { explored: number; total: number }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const all = explored === total;
  const words = all
    ? t('words.exploredAll', { total: formatNumber(total, locale) })
    : t('words.explored', { n: formatNumber(explored, locale), total: formatNumber(total, locale) });
  return (
    <View style={[styles.progress, { flexDirection: dir.row }]}>
      <View style={[styles.track, { backgroundColor: colors.controlTrack }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.fill, { width: `${Math.round((explored / total) * 100)}%`, backgroundColor: colors.success }, dir.rtl && styles.fillEnd]} />
      </View>
      <Text style={[styles.progressText, { color: all ? colors.success : colors.textSecondary }, all && styles.progressDone]} accessibilityLiveRegion="polite">
        {words}
      </Text>
    </View>
  );
}

/** A day of the year in the reader's words: "21 March", "21. März", "٢١ی ئازار". */
export function dateIn(at: DayOfYear, locale: AppLocale, t: ReturnType<typeof useI18n>['t']): string {
  const month = CALENDAR_MONTHS[at.month - 1]!;
  const name = locale === 'ku' ? month.kmr : locale === 'ckb' ? month.ckb : month.meaning[locale];
  return t('words.months.date', { day: formatNumber(at.day, locale), month: name });
}

/**
 * What a word means for this reader, and the script it is in when it is
 * Kurdish (a Kurdish reader is shown the other dialect's word): a number's
 * digits, a Kurdish month's dates, else its meaning.
 */
export function meaningOf(
  word: SetWord,
  dialect: AlphabetScript,
  locale: AppLocale,
  t: ReturnType<typeof useI18n>['t'],
): { text: string; script: AlphabetScript | null } {
  if (word.set === 'numbers') return { text: formatNumber(word.value, locale), script: null };
  if (word.set === 'months' && word.calendar === 'kurdish') {
    return { text: t('words.months.dates', { from: dateIn(word.from, locale, t), to: dateIn(word.to, locale, t) }), script: null };
  }
  const shown = exampleMeaningLocale(dialect, locale);
  const kurdish = shown === 'ku' || shown === 'ckb';
  return { text: wordGloss(word, shown) ?? '', script: kurdish && shown !== locale ? (shown === 'ckb' ? 'ckb' : 'kmr') : null };
}

const styles = StyleSheet.create({
  edge: { borderWidth: StyleSheet.hairlineWidth },
  digits: { ...display(28), fontVariant: ['tabular-nums'] },
  digitsSmall: { fontWeight: typography.weights.semibold },
  mark: { textDecorationLine: 'underline' },
  latin: { fontSize: typography.sizes.sm, writingDirection: 'ltr' },

  progress: { alignItems: 'center', gap: spacing.sm + 4, marginTop: spacing.xs },
  track: { width: 120, height: 6, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radii.pill },
  fillEnd: { alignSelf: 'flex-end' },
  progressText: { flexShrink: 1, fontSize: typography.sizes.xs },
  progressDone: { fontWeight: typography.weights.semibold },
});
