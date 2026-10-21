import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import {
  LATIN_LETTERS,
  SORANI_LETTERS,
  bandOf,
  compareLocaleOf,
  latinLetterGroups,
  latinLetterHint,
  soraniLetterGroups,
  type AlphabetAudioResponse,
  type AlphabetScript,
  type LatinLetter,
  type LetterGroupId,
  type SoraniLetter,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import type { TranslationKey } from '../i18n/translations';
import { ScreenHeader } from '../navigation/ScreenHeader';
import type { RootNavigation } from '../navigation/rootStack';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { useDirection } from '../reports/direction';
import { display } from '../theme/fonts';
import { ClayButton, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { alphabetAudio, type AlphabetAudio } from './audio';
import { TILE_GAP, TILE_HEIGHT, tileGrid } from './grid';
import { LetterSheet } from './LetterSheet';
import { scriptRow, scriptText } from './parts';
import { Practice } from './Practice';
import { useSeen } from './seen';
import { useClipPlayer } from './useClipPlayer';

const SCRIPTS: readonly AlphabetScript[] = ['kmr', 'ckb'];

const GROUP_TITLE: Record<LetterGroupId, TranslationKey> = {
  watch: 'alphabet.group.watch',
  new: 'alphabet.group.new',
  same: 'alphabet.group.same',
  vowels: 'alphabet.group.vowels',
  consonants: 'alphabet.group.consonants',
  throat: 'alphabet.group.throat',
};
const GROUP_BODY: Record<LetterGroupId, TranslationKey> = {
  watch: 'alphabet.group.watchBody',
  new: 'alphabet.group.newBody',
  same: 'alphabet.group.sameBody',
  vowels: 'alphabet.group.vowelsBodyKmr',
  consonants: 'alphabet.group.consonantsBody',
  throat: 'alphabet.group.throatBody',
};
const groupBody = (id: LetterGroupId, script: AlphabetScript): TranslationKey =>
  id === 'vowels' && script === 'ckb' ? 'alphabet.group.vowelsBodyCkb' : GROUP_BODY[id];

/** A letter's tile, as the grid draws it. */
interface TileData {
  id: string;
  glyph: string;
  small?: string;
  /** under the letter: the sound it is like, or its partner in the other script */
  hint: string | null;
  /** a gold dot: a false friend, or a letter Arabic does not have */
  dot: boolean;
}

function latinTile(l: LatinLetter, group: LetterGroupId, hint: string | null): TileData {
  return { id: l.id, glyph: l.upper, small: l.id, hint, dot: group === 'watch' };
}
function soraniTile(l: SoraniLetter, arabicReader: boolean): TileData {
  return { id: l.id, glyph: l.char, hint: l.latin, dot: arabicReader && !!l.kurdishOnly };
}

/**
 * The alphabet: both of them — Kurmancî in Latin letters and Soranî in Arabic
 * script — every letter with its sound, what it is like in the reader's own
 * language, a word to remember it by, and a round of questions to check
 * yourself with. The phone's own telling of the website's page, with the same
 * letters, the same groups and the same practice (alphabet/ in @kurda/shared).
 *
 * It opens on the reader's own dialect: Soranî for someone reading the app in
 * Soranî, Kurmancî for everyone else. Tapping a letter opens it from the foot
 * of the screen and plays it at once, sound and shape together; a recording an
 * editor gave a character is said by Hevalo, Hamo or Xezo beside its button.
 *
 * Nothing here waits on the server. The letters, their clips and where the
 * clips are all ship with the app, so the grid is there at once and every
 * letter plays its generated clip, as on the website. Which sounds an editor
 * has recorded, and who says them, is asked for in the background
 * (GET /alphabet/audio): when the answer comes the recordings take the clips'
 * place and their characters appear; when it does not, the page goes on with
 * the clips and asks once more, quietly, a little later.
 */
export function AlphabetScreen({ script: asked, onExit }: { script?: AlphabetScript; onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const navigation = useNavigation<RootNavigation>();
  const reduceMotion = useReducedMotion();
  const bottom = useScreenBottomInset(spacing.xl);
  const { width } = useWindowDimensions();
  const grid = tileGrid(Math.min(width, layout.column) - layout.gutter * 2);

  // a link may ask for either alphabet; anything else it says is ignored
  const [chosen, setChosen] = useState<AlphabetScript | null>(asked === 'kmr' || asked === 'ckb' ? asked : null);
  const script: AlphabetScript = chosen ?? (locale === 'ckb' ? 'ckb' : 'kmr');

  // the generated clips from the first frame; the recordings in their place once the server names them
  const [audio, setAudio] = useState<AlphabetAudio>(GENERATED);
  useEffect(() => {
    let live = true;
    let again: ReturnType<typeof setTimeout> | null = null;
    const ask = async (tries: number): Promise<void> => {
      const res = await client.get<AlphabetAudioResponse>('/alphabet/audio');
      if (!live) return;
      if (res.ok) setAudio(alphabetAudio(res.data));
      else if (tries > 1) again = setTimeout(() => void ask(tries - 1), ASK_AGAIN_MS);
    };
    void ask(2);
    return () => {
      live = false;
      if (again) clearTimeout(again);
    };
  }, [client]);

  const player = useClipPlayer();
  const [seen, markSeen] = useSeen(script);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => setOpenId(null), [script]);

  const lang = compareLocaleOf(locale);
  const groups = useMemo(
    () =>
      script === 'kmr'
        ? latinLetterGroups(locale).map((g) => ({ id: g.id, tiles: g.letters.map((l) => latinTile(l, g.id, latinLetterHint(l, locale))) }))
        : soraniLetterGroups().map((g) => ({ id: g.id, tiles: g.letters.map((l) => soraniTile(l, locale === 'ar')) })),
    [script, locale],
  );
  const order = useMemo(() => groups.flatMap((g) => g.tiles.map((tile) => tile.id)), [groups]);

  // hearing it the moment it is tapped is the point of tapping: sound and shape, together
  const open = (id: string): void => {
    setOpenId(id);
    markSeen(id);
    const sorani = script === 'ckb' ? SORANI_LETTERS.find((l) => l.id === id) : undefined;
    const src = sorani ? audio.sounds.soraniSound(sorani) : audio.sounds.latinSound(id);
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
  const same = lang ? LATIN_LETTERS.filter((l) => bandOf(l.id, lang) === 'same').length : 0;
  const n = (value: number) => formatNumber(value, locale);
  const summary =
    script === 'ckb'
      ? t('alphabet.summary.ckb')
      : lang
        ? t('alphabet.summary.compare', { same: n(same), total: n(LATIN_LETTERS.length), rest: n(LATIN_LETTERS.length - same) })
        : t('alphabet.summary.bridge');

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader title={t('nav.alphabet')} onBack={onExit} />
        <ScrollView
          ref={scroller}
          style={styles.screen}
          contentContainerStyle={[styles.column, { paddingBottom: bottom }]}
          showsVerticalScrollIndicator={false}
        >
          <Segmented
            options={SCRIPTS}
            value={script}
            onChange={setChosen}
            labelOf={(s) => t(s === 'kmr' ? 'games.race.kurmanci' : 'games.race.sorani')}
            groupLabel={t('alphabet.script.label')}
          />
          <View style={styles.intro}>
            <Text style={[styles.summary, dir.text, { color: colors.textPrimary }]}>{summary}</Text>
            <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('alphabet.lead')}</Text>
            <Progress explored={explored} total={order.length} />
          </View>
          {script === 'kmr' ? <HatRule /> : <JoinDemo />}
          {groups.map((g) => (
            <View key={g.id} style={styles.group}>
              <View style={[styles.groupHead, { flexDirection: dir.row }]}>
                <Text style={[styles.groupTitle, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
                  {t(GROUP_TITLE[g.id])}
                </Text>
                <Text style={[styles.count, { color: colors.textSecondary }]}>{n(g.tiles.length)}</Text>
              </View>
              <Text style={[styles.groupBody, dir.text, { color: colors.textSecondary }]}>{t(groupBody(g.id, script))}</Text>
              <View style={[styles.grid, { flexDirection: scriptRow(script) }]}>
                {g.tiles.map((tile) => (
                  <Tile key={tile.id} tile={tile} script={script} width={grid.tile} seen={seen.has(tile.id)} onPress={() => open(tile.id)} />
                ))}
              </View>
            </View>
          ))}
          <View
            onLayout={(e: LayoutChangeEvent) => {
              practiceY.current = e.nativeEvent.layout.y;
            }}
          >
            <Practice
              key={script}
              script={script}
              audio={audio}
              player={player}
              onOpen={open}
              onBegin={() => scroller.current?.scrollTo({ y: Math.max(0, practiceY.current - spacing.md), animated: !reduceMotion })}
            />
          </View>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.cardTitle, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
              {t('alphabet.next.title')}
            </Text>
            <View style={[styles.links, { flexDirection: dir.row }]}>
              <ClayButton label={t('alphabet.next.dictionary')} icon="text" onPress={() => navigation.navigate('Dictionary')} />
              <ClayButton label={t('alphabet.next.wordle')} icon="grid" onPress={() => navigation.navigate('Wordle')} />
            </View>
          </View>
        </ScrollView>
        <LetterSheet script={script} letterId={openId} audio={audio} player={player} onStep={step} onClose={() => setOpenId(null)} />
      </View>
    </GradientBackground>
  );
}

/**
 * One letter in the grid: the letter (and its small form), what it is like or
 * its partner underneath, a tick once it has been opened, and a gold dot on a
 * false friend. Read out the way the website labels it: "C, like j".
 */
function Tile({
  tile,
  script,
  width,
  seen,
  onPress,
}: {
  tile: TileData;
  script: AlphabetScript;
  width: number;
  seen: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const arabic = script === 'ckb';
  // the tick sits where the script's line starts, the dot where it ends
  const startSide = arabic ? styles.right : styles.left;
  const endSide = arabic ? styles.left : styles.right;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={tile.hint ? t('alphabet.tileLabel', { letter: tile.glyph, hint: tile.hint }) : tile.glyph}
      style={[styles.tile, { width, backgroundColor: colors.surface }]}
    >
      {seen ? <Icon name="check" size={12} color={colors.success} style={[styles.corner, startSide]} /> : null}
      {tile.dot ? <View style={[styles.dot, styles.corner, endSide, { backgroundColor: colors.gold }]} /> : null}
      <Text style={[arabic ? styles.glyphArabic : styles.glyph, scriptText(script), { color: colors.textPrimary }]} maxFontSizeMultiplier={1.4}>
        {tile.glyph}
        {tile.small ? <Text style={[styles.glyphSmall, { color: colors.textSecondary }]}>{` ${tile.small}`}</Text> : null}
      </Text>
      {tile.hint ? (
        <Text style={[styles.hint, { color: colors.goldText }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
          {tile.hint}
        </Text>
      ) : null}
    </PressableScale>
  );
}

/** How many of this alphabet's letters have been opened here: the small, honest kind of progress. */
function Progress({ explored, total }: { explored: number; total: number }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const all = explored === total;
  const words = all
    ? t('alphabet.exploredAll', { total: formatNumber(total, locale) })
    : t('alphabet.explored', { n: formatNumber(explored, locale), total: formatNumber(total, locale) });
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

/** One rule worth more than five letters: the hat. */
function HatRule(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const pair = (from: string, to: string) => (
    <View style={[styles.pair, { flexDirection: scriptRow('kmr') }]}>
      <Text style={[styles.ruleGlyph, { color: colors.textPrimary }]}>{from}</Text>
      <Text style={[styles.arrow, { color: colors.textSecondary }]}>→</Text>
      <Text style={[styles.ruleGlyph, { color: colors.goldText }]}>{to}</Text>
    </View>
  );
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={[styles.ruleDemo, { flexDirection: scriptRow('kmr') }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {pair('i', 'î')}
        {pair('u', 'û')}
      </View>
      <Text style={[styles.cardTitle, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
        {t('alphabet.hat.title')}
      </Text>
      <Text style={[styles.groupBody, dir.text, { color: colors.textSecondary }]}>{t('alphabet.hat.body')}</Text>
    </View>
  );
}

/** A word taken apart and put back together: how Arabic script joins, shown rather than told. */
function JoinDemo(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={[styles.ruleDemo, { flexDirection: dir.row }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.pair, { flexDirection: scriptRow('ckb') }]}>
          {['ک', 'و', 'ر', 'د', 'ی'].map((part, i) => (
            <Text key={i} style={[styles.ruleArabic, { color: colors.textSecondary }]}>
              {part}
            </Text>
          ))}
        </View>
        <Text style={[styles.arrow, { color: colors.textSecondary }, dir.flip]}>→</Text>
        <Text style={[styles.ruleArabic, scriptText('ckb'), { color: colors.goldText }]}>کوردی</Text>
      </View>
      <Text style={[styles.cardTitle, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
        {t('alphabet.join.title')}
      </Text>
      <Text style={[styles.groupBody, dir.text, { color: colors.textSecondary }]}>{t('alphabet.join.body')}</Text>
    </View>
  );
}

const GLYPH = 28;
const RULE_GLYPH = 30;
const RULE_LINE = Math.round(RULE_GLYPH * 1.2);
const TRACK = 120;
/** display(22) at the summary's own leading */
const SUMMARY_LINE = Math.round(typography.sizes.lg * 1.3);
/** How long to wait before asking once more for the recordings, when the first answer did not come. */
const ASK_AGAIN_MS = 20_000;

/** The generated clips alone, from the website: what every letter plays until the recordings are known. */
const GENERATED = alphabetAudio(null);

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { width: '100%', maxWidth: layout.column, alignSelf: 'center', paddingHorizontal: layout.gutter, paddingTop: spacing.xs, gap: spacing.lg },

  intro: { gap: spacing.sm },
  summary: { ...display(typography.sizes.lg), lineHeight: SUMMARY_LINE },
  lead: { fontSize: typography.sizes.sm },
  progress: { alignItems: 'center', gap: spacing.sm + 4, marginTop: spacing.xs },
  track: { width: TRACK, height: 6, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radii.pill },
  fillEnd: { alignSelf: 'flex-end' },
  progressText: { fontSize: typography.sizes.xs },
  progressDone: { fontWeight: typography.weights.semibold },

  card: { borderRadius: radii.lg, padding: spacing.md + 4, gap: spacing.sm },
  cardTitle: { ...display(typography.sizes.lg) },
  ruleDemo: { alignItems: 'center', gap: spacing.md + 4, marginBottom: spacing.xs },
  pair: { alignItems: 'center', gap: spacing.sm },
  ruleGlyph: { ...display(RULE_GLYPH), lineHeight: RULE_LINE },
  ruleArabic: { fontSize: RULE_GLYPH, lineHeight: Math.round(RULE_GLYPH * 1.5) },
  arrow: { fontSize: typography.sizes.md },
  links: { flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },

  group: { gap: spacing.sm },
  groupHead: { alignItems: 'baseline', gap: spacing.sm },
  groupTitle: { flexShrink: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  count: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  groupBody: { fontSize: typography.sizes.sm, lineHeight: 21 },
  grid: { flexWrap: 'wrap', gap: TILE_GAP, marginTop: spacing.xs },

  tile: { minHeight: TILE_HEIGHT, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: spacing.sm },
  glyph: { ...display(GLYPH), lineHeight: Math.round(GLYPH * 1.15) },
  glyphArabic: { fontSize: GLYPH + 2, lineHeight: Math.round((GLYPH + 2) * 1.45) },
  glyphSmall: { fontSize: Math.round(GLYPH * 0.62) },
  hint: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, maxWidth: '100%' },
  corner: { position: 'absolute', top: 7 },
  left: { left: 8 },
  right: { right: 8 },
  dot: { width: 6, height: 6, borderRadius: radii.pill },
});
