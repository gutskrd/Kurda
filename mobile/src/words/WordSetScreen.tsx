import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import {
  NEWROZ,
  RELATIVE_DAYS,
  SEASONS,
  SEASON_ORDER,
  exampleMeaningLocale,
  findWord,
  glossIn,
  kurdishNumber,
  kurdishWeekday,
  wordGroups,
  wordIn,
  type AlphabetScript,
  type SetWord,
  type WordGroupId,
  type WordSetId,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useFontScale } from '../a11y/useFontScale';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { scriptRow, scriptText } from '../alphabet/parts';
import { useClipPlayer } from '../alphabet/useClipPlayer';
import { TILE_GAP, TILE_HEIGHT } from '../alphabet/grid';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import type { TranslationKey } from '../i18n/translations';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { useDirection } from '../reports/direction';
import { display } from '../theme/fonts';
import { GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { useWordsAudio } from './audio';
import { wordGrid } from './grid';
import { DayName, Digits, Progress, dateIn, meaningOf } from './parts';
import { useWordsSeen } from './seen';
import { WordPractice } from './WordPractice';
import { WordSheet } from './WordSheet';

const DIALECTS: readonly AlphabetScript[] = ['kmr', 'ckb'];

export const SET_TITLE: Record<WordSetId, TranslationKey> = {
  colours: 'words.set.colours',
  numbers: 'words.set.numbers',
  days: 'words.set.days',
  months: 'words.set.months',
};

/** A group's heading; the sets with one group need none. */
const GROUP_TITLE: Partial<Record<WordGroupId, TranslationKey>> = {
  units: 'words.group.units',
  teens: 'words.group.teens',
  tens: 'words.group.tens',
  big: 'words.group.big',
  gregorian: 'words.group.gregorian',
  kurdish: 'words.group.kurdish',
};

/** A season's tint over a month's tile: faint enough that its words keep their contrast in either theme. */
const TINT = '2E';

/**
 * One word set — the colours, the numbers, the days or the months — taught
 * the way the alphabet is (AlphabetScreen): Kurmancî or Soranî at the switch,
 * the words as tiles drawn to fit the set, each opening from the foot of the
 * screen and saying itself at once, and a round of questions to check
 * yourself with. The colours are swatches with their names on a label that
 * reads on any of them; the numbers show their digits, Soranî's own beside
 * the Western ones; the days run from Saturday with the number inside each
 * name marked, and today's says so; the months carry their season's tint, the
 * calendar's first and then the Kurdish year from Newroz.
 *
 * Nothing waits on the server: the words and their synthesised clips ship
 * with the app, and the recordings take the clips' place when they arrive.
 */
export function WordSetScreen({ set, script: asked, onExit }: { set: WordSetId; script?: AlphabetScript; onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduceMotion = useReducedMotion();
  const bottom = useScreenBottomInset(spacing.xl);
  const { width } = useWindowDimensions();
  const fontScale = useFontScale();
  const grid = wordGrid(Math.min(width, layout.column) - layout.gutter * 2, set, fontScale);

  // a link may ask for either dialect; anything else it says is ignored
  const [chosen, setChosen] = useState<AlphabetScript | null>(asked === 'kmr' || asked === 'ckb' ? asked : null);
  const dialect: AlphabetScript = chosen ?? (locale === 'ckb' ? 'ckb' : 'kmr');

  const audio = useWordsAudio(client);
  const player = useClipPlayer();
  const [seen, markSeen] = useWordsSeen(set, dialect);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => setOpenId(null), [dialect]);

  const groups = useMemo(() => wordGroups(set), [set]);
  const order = useMemo(() => groups.flatMap((g) => g.words.map((w) => w.id)), [groups]);
  const today = set === 'days' ? kurdishWeekday(new Date()) : null;

  // hearing it the moment it is tapped is the point of tapping: the word and its sound, together
  const open = (id: string): void => {
    setOpenId(id);
    markSeen(id);
    const word = findWord(set, id);
    const src = word ? audio.sounds.of(word, dialect) : null;
    if (src) player.play(src);
  };
  const step = (by: number): void => {
    if (!openId) return;
    const i = order.indexOf(openId);
    open(order[(i + by + order.length) % order.length]!);
  };

  const scroller = useRef<ScrollView>(null);
  const practiceY = useRef(0);
  const explored = order.filter((id) => seen.has(id)).length;

  const summary =
    set === 'numbers'
      ? t('words.numbers.summary', { n: formatNumber(21, locale), example: kurdishNumber(21, dialect) })
      : t(set === 'colours' ? 'words.colours.summary' : set === 'days' ? 'words.days.summary' : 'words.months.summary');

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader title={t(SET_TITLE[set])} onBack={onExit} />
        <ScrollView ref={scroller} style={styles.screen} contentContainerStyle={[styles.column, { paddingBottom: bottom }]} showsVerticalScrollIndicator={false}>
          <Segmented
            options={DIALECTS}
            value={dialect}
            onChange={setChosen}
            labelOf={(s) => t(s === 'kmr' ? 'games.race.kurmanci' : 'games.race.sorani')}
            groupLabel={t('alphabet.script.label')}
          />
          <View style={styles.intro}>
            <Text style={[styles.summary, dir.text, { color: colors.textPrimary }]}>{summary}</Text>
            <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('words.lead')}</Text>
            <Progress explored={explored} total={order.length} />
          </View>
          {set === 'months' ? <SeasonLegend dialect={dialect} /> : null}
          {groups.map((g) => {
            const title = GROUP_TITLE[g.id];
            return (
              <View key={g.id} style={styles.group}>
                {title ? (
                  <View style={[styles.groupHead, { flexDirection: dir.row }]}>
                    <Text style={[styles.groupTitle, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
                      {t(title)}
                    </Text>
                    <Text style={[styles.count, { color: colors.textSecondary }]}>{formatNumber(g.words.length, locale)}</Text>
                  </View>
                ) : null}
                {g.id === 'kurdish' ? (
                  <Text style={[styles.groupBody, dir.text, { color: colors.textSecondary }]}>
                    {t('words.group.kurdishBody', { date: dateIn(NEWROZ, locale, t) })}
                  </Text>
                ) : null}
                <View style={[styles.grid, { flexDirection: scriptRow(dialect) }]}>
                  {g.words.map((word) => (
                    <WordTile
                      key={word.id}
                      word={word}
                      dialect={dialect}
                      width={grid.tile}
                      seen={seen.has(word.id)}
                      today={word.set === 'days' && word.order === today}
                      onPress={() => open(word.id)}
                    />
                  ))}
                </View>
              </View>
            );
          })}
          <View
            onLayout={(e: LayoutChangeEvent) => {
              practiceY.current = e.nativeEvent.layout.y;
            }}
          >
            <WordPractice
              key={`${set}:${dialect}`}
              set={set}
              dialect={dialect}
              audio={audio}
              player={player}
              onOpen={open}
              onBegin={() => scroller.current?.scrollTo({ y: Math.max(0, practiceY.current - spacing.md), animated: !reduceMotion })}
            />
          </View>
        </ScrollView>
        <WordSheet set={set} dialect={dialect} wordId={openId} audio={audio} player={player} onStep={step} onClose={() => setOpenId(null)} />
      </View>
    </GradientBackground>
  );
}

/**
 * One word in the grid, drawn to fit its set, with a tick once it has been
 * opened. Read out as the word and then what it means: "sor, red".
 */
function WordTile({
  word,
  dialect,
  width,
  seen,
  today,
  onPress,
}: {
  word: SetWord;
  dialect: AlphabetScript;
  width: number;
  seen: boolean;
  today: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const meaning = meaningOf(word, dialect, locale, t);
  const said = t('words.tileLabel', { word: wordIn(word, dialect), meaning: meaning.text });
  const label = today ? t('words.tileLabel', { word: said, meaning: glossIn(RELATIVE_DAYS.today, locale) }) : said;
  const arabic = dialect === 'ckb';
  // the tick sits where the script's line starts
  const tick = seen ? <Icon name="check" size={12} color={colors.success} style={[styles.corner, arabic ? styles.right : styles.left]} /> : null;
  const press = { onPress, accessibilityRole: 'button' as const, accessibilityLabel: label };

  if (word.set === 'colours') {
    // the name sits on a label of its own, so it reads the same on white, on yellow and on black
    return (
      <PressableScale {...press} style={[styles.colourTile, { width, backgroundColor: word.hex, borderColor: colors.separator }]}>
        <View style={[styles.chip, { backgroundColor: colors.surface, flexDirection: scriptRow(dialect) }]}>
          <Text style={[styles.chipText, scriptText(dialect), { color: colors.textPrimary }]} maxFontSizeMultiplier={1.6}>
            {wordIn(word, dialect)}
          </Text>
          {seen ? <Icon name="check" size={12} color={colors.success} /> : null}
        </View>
      </PressableScale>
    );
  }

  if (word.set === 'numbers') {
    return (
      <PressableScale {...press} style={[styles.tile, { width, backgroundColor: colors.surface }]}>
        {tick}
        <Digits value={word.value} dialect={dialect} size={DIGITS} />
        <Text style={[styles.tileWord, scriptText(dialect), { color: colors.textSecondary }]} maxFontSizeMultiplier={1.6}>
          {wordIn(word, dialect)}
        </Text>
      </PressableScale>
    );
  }

  if (word.set === 'days') {
    return (
      <PressableScale {...press} style={[styles.tile, styles.dayTile, { width, backgroundColor: colors.surface }]}>
        {tick}
        {today ? (
          <View style={[styles.today, { backgroundColor: colors.primary }]}>
            <Text style={[styles.todayText, scriptText(dialect), { color: colors.textOnPrimary }]}>{wordIn(RELATIVE_DAYS.today, dialect)}</Text>
          </View>
        ) : null}
        <DayName day={word} dialect={dialect} style={arabic ? styles.dayNameArabic : styles.dayName} />
        <Meaning text={meaning.text} script={meaning.script} />
      </PressableScale>
    );
  }

  const tint = SEASONS[word.season].tint;
  return (
    <PressableScale {...press} style={[styles.tile, { width, backgroundColor: colors.surface }]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.tint, { backgroundColor: `${tint}${TINT}` }]} />
      {tick}
      <Text style={[styles.monthNumber, arabic ? styles.left : styles.right, { color: colors.textSecondary }]}>{formatNumber(word.number, locale)}</Text>
      <Text style={[arabic ? styles.monthArabic : styles.month, scriptText(dialect), { color: colors.textPrimary }]} maxFontSizeMultiplier={1.6}>
        {wordIn(word, dialect)}
      </Text>
      <Meaning text={word.calendar === 'kurdish' ? dateIn(word.from, locale, t) : meaning.text} script={meaning.script} />
    </PressableScale>
  );
}

function Meaning({ text, script }: { text: string; script: AlphabetScript | null }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Text style={[styles.tileMeaning, script ? scriptText(script) : null, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.6}>
      {text}
    </Text>
  );
}

/** Which tint is which season: each with its Kurdish name and what it means. */
function SeasonLegend({ dialect }: { dialect: AlphabetScript }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const shown = exampleMeaningLocale(dialect, locale);
  return (
    <View style={[styles.legend, { flexDirection: dir.row }]}>
      {SEASON_ORDER.map((id) => {
        const season = SEASONS[id];
        const gloss = glossIn(season, shown);
        return (
          <View
            key={id}
            style={[styles.legendItem, { flexDirection: dir.row, backgroundColor: `${season.tint}${TINT}` }]}
            accessible
            accessibilityLabel={t('words.tileLabel', { word: wordIn(season, dialect), meaning: gloss })}
          >
            <View style={[styles.legendDot, { backgroundColor: season.tint }]} />
            <Text style={[styles.legendWord, scriptText(dialect), { color: colors.textPrimary }]}>{wordIn(season, dialect)}</Text>
            <Text style={[styles.legendGloss, { color: colors.textSecondary }]}>{gloss}</Text>
          </View>
        );
      })}
    </View>
  );
}

const DIGITS = 28;
/** display(22) at the summary's own leading */
const SUMMARY_LINE = Math.round(typography.sizes.lg * 1.3);

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { width: '100%', maxWidth: layout.column, alignSelf: 'center', paddingHorizontal: layout.gutter, paddingTop: spacing.xs, gap: spacing.lg },

  intro: { gap: spacing.sm },
  summary: { ...display(typography.sizes.lg), lineHeight: SUMMARY_LINE },
  lead: { fontSize: typography.sizes.sm },

  group: { gap: spacing.sm },
  groupHead: { alignItems: 'baseline', gap: spacing.sm },
  groupTitle: { flexShrink: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  count: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  groupBody: { fontSize: typography.sizes.sm, lineHeight: 21 },
  grid: { flexWrap: 'wrap', gap: TILE_GAP, marginTop: spacing.xs },

  tile: { minHeight: TILE_HEIGHT, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: spacing.sm + 2, overflow: 'hidden' },
  tileWord: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center' },
  tileMeaning: { fontSize: typography.sizes.xs, textAlign: 'center' },
  corner: { position: 'absolute', top: 7 },
  left: { left: 8 },
  right: { right: 8 },

  colourTile: { minHeight: 96, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'flex-end', padding: 6 },
  chip: { alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  chipText: { flexShrink: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center' },

  dayTile: { minHeight: 84, gap: 4 },
  dayName: { ...display(typography.sizes.lg), lineHeight: Math.round(typography.sizes.lg * 1.2), textAlign: 'center' },
  dayNameArabic: { fontSize: typography.sizes.lg, lineHeight: Math.round(typography.sizes.lg * 1.5), textAlign: 'center' },
  today: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  todayText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },

  tint: { borderRadius: radii.md },
  monthNumber: { position: 'absolute', top: 6, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  month: { ...display(typography.sizes.md), lineHeight: Math.round(typography.sizes.md * 1.25), textAlign: 'center', marginTop: spacing.sm },
  monthArabic: { fontSize: typography.sizes.md, lineHeight: Math.round(typography.sizes.md * 1.6), textAlign: 'center', marginTop: spacing.sm },

  legend: { flexWrap: 'wrap', gap: spacing.sm },
  legendItem: { alignItems: 'center', gap: 6, borderRadius: radii.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 5 },
  legendDot: { width: 8, height: 8, borderRadius: radii.pill },
  legendWord: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  legendGloss: { fontSize: typography.sizes.xs },
});
