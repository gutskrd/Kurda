import { useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { KURDISH_NUMBER_MAX, WORD_SET_IDS, wordSet, wordSetSvg, type AlphabetScript, type WordSetId, type WordsCardId } from '@kurda/shared';
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
import { useLettersSeen, useSeenCounts } from './seen';
import { SET_TITLE } from './WordSetScreen';

const SET_BODY: Record<WordSetId, TranslationKey> = {
  colours: 'words.set.coloursBody',
  numbers: 'words.set.numbersBody',
  days: 'words.set.daysBody',
  months: 'words.set.monthsBody',
};

/**
 * Letters and words: the alphabet first, then the colours, the numbers, the
 * days of the week and the months, each a set taught the way the alphabet is.
 * One big card each, with a picture of what is in it and how much of it has
 * been opened on this phone; the letters' card opens the alphabet
 * (AlphabetScreen), a set's card opens the set (WordSetScreen).
 *
 * The letters stood on their own tile in Learn's tools beside this one; they
 * are the first of the same steps, so they sit at the top of the same list.
 */
export function WordsScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const navigation = useNavigation<RootNavigation>();
  const bottom = useScreenBottomInset(spacing.xl);
  const counts = useSeenCounts();
  // the alphabet opens in the reader's own script, so its card counts that one
  const script: AlphabetScript = locale === 'ckb' ? 'ckb' : 'kmr';
  const letters = useLettersSeen(script);

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader title={t('words.title')} onBack={onExit} />
        <ScrollView style={styles.screen} contentContainerStyle={[styles.column, { paddingBottom: bottom }]} showsVerticalScrollIndicator={false}>
          <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('words.lead')}</Text>
          <Card
            id="letters"
            script={script}
            title={t('nav.alphabet')}
            body={t('learn.tools.alphabetHint')}
            seen={letters.seen}
            total={letters.total}
            onPress={() => navigation.navigate('Alphabet')}
          />
          {WORD_SET_IDS.map((set) => (
            <Card
              key={set}
              id={set}
              script={script}
              title={t(SET_TITLE[set])}
              body={t(SET_BODY[set], { max: formatNumber(KURDISH_NUMBER_MAX, locale) })}
              seen={counts[set] ?? 0}
              total={wordSet(set).length}
              onPress={() => navigation.navigate('WordSet', { set })}
            />
          ))}
        </ScrollView>
      </View>
    </GradientBackground>
  );
}

interface CardProps {
  id: WordsCardId;
  script: AlphabetScript;
  title: string;
  body: string;
  seen: number;
  total: number;
  onPress: () => void;
}

function Card({ id, script, title, body, seen, total, onPress }: CardProps): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const all = total > 0 && seen >= total;
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
      <Teaser id={id} script={script} />
      <View style={styles.text}>
        <Text style={[styles.title, dir.text, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.body, dir.text, { color: colors.textSecondary }]}>{body}</Text>
        <View style={[styles.progress, { flexDirection: dir.row }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[styles.track, { backgroundColor: colors.controlTrack }]}>
            <View style={[styles.fill, { width: `${total > 0 ? Math.round((Math.min(seen, total) / total) * 100) : 0}%`, backgroundColor: colors.success }, dir.rtl && styles.fillEnd]} />
          </View>
          <Text style={[styles.count, { color: all ? colors.success : colors.textSecondary }]}>{progress}</Text>
        </View>
      </View>
      <Icon name="chevron-right" size={18} color={colors.textSecondary} style={dir.flip ?? undefined} />
    </PressableScale>
  );
}

/**
 * A picture of what a card holds, in place of an icon: toy blocks with the
 * first letters (in the script the alphabet opens in), a paint palette, an
 * abacus, the sun (roj, the day) and a wall calendar, drawn in the shared art
 * so the browser shows the same five.
 */
function Teaser({ id, script }: { id: WordsCardId; script: AlphabetScript }): React.JSX.Element {
  const { colors } = useTheme();
  const xml = useMemo(() => wordSetSvg({ set: id, size: PICTURE, script: script === 'ckb' ? 'arabic' : 'latin' }), [id, script]);
  return (
    <View style={[styles.teaser, { backgroundColor: colors.controlTrack }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SvgXml xml={xml} width={PICTURE} height={PICTURE} />
    </View>
  );
}

const TEASER = 56;
const PICTURE = 44;

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
});
