import { useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { KURDISH_NUMBER_MAX, SEASONS, SEASON_ORDER, WORD_COLOURS, WORD_SET_IDS, easternDigits, wordSet, type WordSetId } from '@kurda/shared';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import type { TranslationKey } from '../i18n/translations';
import { ScreenHeader } from '../navigation/ScreenHeader';
import type { RootNavigation } from '../navigation/rootStack';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { useDirection } from '../reports/direction';
import { display } from '../theme/fonts';
import { GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { useSeenCounts } from './seen';
import { SET_TITLE } from './WordSetScreen';

const SET_BODY: Record<WordSetId, TranslationKey> = {
  colours: 'words.set.coloursBody',
  numbers: 'words.set.numbersBody',
  days: 'words.set.daysBody',
  months: 'words.set.monthsBody',
};

/** The first four colours, for the colours' card. */
const TEASER_COLOURS = ['red', 'yellow', 'green', 'blue'].map((id) => WORD_COLOURS.find((c) => c.id === id)!.hex);

/**
 * Words to know: the colours, the numbers, the days of the week and the
 * months, each a set taught the way the alphabet is — one big card a set, with
 * a picture of what is in it and how many of its words have been opened on
 * this phone. A card opens its set (WordSetScreen).
 */
export function WordsScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const navigation = useNavigation<RootNavigation>();
  const bottom = useScreenBottomInset(spacing.xl);
  const counts = useSeenCounts();

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader title={t('words.title')} onBack={onExit} />
        <ScrollView style={styles.screen} contentContainerStyle={[styles.column, { paddingBottom: bottom }]} showsVerticalScrollIndicator={false}>
          <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('words.lead')}</Text>
          {WORD_SET_IDS.map((set) => (
            <SetCard key={set} set={set} seen={counts[set] ?? 0} onPress={() => navigation.navigate('WordSet', { set })} />
          ))}
        </ScrollView>
      </View>
    </GradientBackground>
  );
}

function SetCard({ set, seen, onPress }: { set: WordSetId; seen: number; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const total = wordSet(set).length;
  const title = t(SET_TITLE[set]);
  const body = t(SET_BODY[set], { max: formatNumber(KURDISH_NUMBER_MAX, locale) });
  const all = seen === total;
  const progress = all
    ? t('words.exploredAll', { total: formatNumber(total, locale) })
    : t('words.explored', { n: formatNumber(seen, locale), total: formatNumber(total, locale) });
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('words.tileLabel', { word: title, meaning: progress })}
      accessibilityHint={body}
      style={[styles.card, { backgroundColor: colors.surface, flexDirection: dir.row }]}
    >
      <Teaser set={set} />
      <View style={styles.text}>
        <Text style={[styles.title, dir.text, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.body, dir.text, { color: colors.textSecondary }]}>{body}</Text>
        <View style={[styles.progress, { flexDirection: dir.row }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[styles.track, { backgroundColor: colors.controlTrack }]}>
            <View style={[styles.fill, { width: `${Math.round((seen / total) * 100)}%`, backgroundColor: colors.success }, dir.rtl && styles.fillEnd]} />
          </View>
          <Text style={[styles.count, { color: all ? colors.success : colors.textSecondary }]}>{progress}</Text>
        </View>
      </View>
      <Icon name="chevron-right" size={18} color={colors.textSecondary} style={dir.flip ?? undefined} />
    </PressableScale>
  );
}

/** A picture of what a set holds, in place of an icon, as the alphabet's tool shows its letters. */
function Teaser({ set }: { set: WordSetId }): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
  const box = [styles.teaser, { backgroundColor: colors.controlTrack }];
  if (set === 'colours' || set === 'months') {
    const dots = set === 'colours' ? TEASER_COLOURS : SEASON_ORDER.map((s) => SEASONS[s].tint);
    return (
      <View style={[box, styles.dots]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {dots.map((hex) => (
          <View key={hex} style={[styles.dot, set === 'months' && styles.round, { backgroundColor: hex }]} />
        ))}
      </View>
    );
  }
  if (set === 'numbers') {
    return (
      <View style={box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[styles.teaserText, { color: colors.goldText }]} maxFontSizeMultiplier={1.2}>
          {locale === 'ckb' || locale === 'ar' ? easternDigits(123) : '123'}
        </Text>
      </View>
    );
  }
  return (
    <View style={box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Icon name="calendar" size={26} color={colors.goldText} />
    </View>
  );
}

const TEASER = 56;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { width: '100%', maxWidth: layout.column, alignSelf: 'center', paddingHorizontal: layout.gutter, paddingTop: spacing.xs, gap: layout.rowGap },
  lead: { fontSize: typography.sizes.sm, marginBottom: spacing.xs },

  card: { alignItems: 'center', gap: spacing.md, borderRadius: radii.lg, padding: spacing.md, minHeight: 96 },
  text: { flex: 1, gap: 4 },
  title: { ...display(typography.sizes.lg), lineHeight: Math.round(typography.sizes.lg * 1.2) },
  body: { fontSize: typography.sizes.sm, lineHeight: 20 },
  progress: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  track: { width: 72, height: 6, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radii.pill },
  fillEnd: { alignSelf: 'flex-end' },
  count: { flexShrink: 1, fontSize: typography.sizes.xs },

  teaser: { width: TEASER, height: TEASER, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', gap: 4, padding: 10 },
  dot: { width: 16, height: 16, borderRadius: radii.xs },
  round: { borderRadius: radii.pill },
  teaserText: { ...display(typography.sizes.lg) },
});
