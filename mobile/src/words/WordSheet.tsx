import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import {
  KURDISH_NUMBER_MAX,
  NEWROZ,
  RELATIVE_DAYS,
  SEASONS,
  dayAfter,
  exampleMeaningLocale,
  findWord,
  glossIn,
  kurdishNumber,
  readDigits,
  wordIn,
  type AlphabetScript,
  type KurdishWord,
  type SetWord,
  type WordSetId,
} from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { CardLabel, PlayButton, SpokenStage, scriptLanguage, scriptRow, scriptText } from '../alphabet/parts';
import type { ClipPlayer } from '../alphabet/useClipPlayer';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { useDirection } from '../reports/direction';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { display } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import type { WordsAudio } from './audio';
import { DayName, Digits, Swatch, WordText, dateIn, meaningOf } from './parts';
import { pressedDim } from '../theme/motion';

/**
 * One word, opened like a letter in the alphabet (LetterSheet): the word large (with a colour's swatch or a
 * number's digits), its sound and the speaker when a recording has one, its meaning, the same word in the other
 * dialect, and one small activity (a colour in a phrase, any number spelled out as typed, a day between yesterday
 * and tomorrow, a month's season). Previous and next sit at the foot, so a set can be walked through without
 * closing.
 */
export function WordSheet({
  set,
  dialect,
  wordId,
  audio,
  player,
  onStep,
  onClose,
}: {
  set: WordSetId;
  dialect: AlphabetScript;
  /** The word open; null when the sheet is closed. */
  wordId: string | null;
  audio: WordsAudio;
  player: ClipPlayer;
  onStep: (by: number) => void;
  onClose: () => void;
}): React.JSX.Element {
  // The word stays on the sheet while it fades away.
  const last = useRef<{ dialect: AlphabetScript; id: string } | null>(null);
  if (wordId) last.current = { dialect, id: wordId };
  const shown = last.current;
  const word = shown ? findWord(set, shown.id) : undefined;

  return (
    <BottomSheet visible={wordId !== null} onClose={onClose} contentStyle={styles.scroller}>
      <SheetScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {word && shown ? <Card key={`${shown.dialect}:${word.id}`} word={word} dialect={shown.dialect} audio={audio} player={player} /> : null}
        <Stepper onStep={onStep} />
      </SheetScrollView>
    </BottomSheet>
  );
}

/** A word as the page writes it: a day with its number marked, Soranî with its Latin letters under it. */
function Said({ word, dialect, size, align }: { word: SetWord; dialect: AlphabetScript; size: number; align: 'center' | 'start' }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  if (word.set !== 'days') return <WordText word={word} dialect={dialect} size={size} align={align} />;
  const at = align === 'center' ? styles.centre : dir.text;
  return (
    <View>
      <DayName
        day={word}
        dialect={dialect}
        style={[dialect === 'ckb' ? { fontSize: size, lineHeight: Math.round(size * 1.5) } : { ...display(size), lineHeight: Math.round(size * 1.2) }, at]}
      />
      {dialect === 'ckb' ? <Text style={[styles.latin, at, { color: colors.textSecondary }]}>{word.ckbLatin}</Text> : null}
    </View>
  );
}

function Card({ word, dialect, audio, player }: { word: SetWord; dialect: AlphabetScript; audio: WordsAudio; player: ClipPlayer }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const sound = audio.sounds.of(word, dialect);
  const other: AlphabetScript = dialect === 'kmr' ? 'ckb' : 'kmr';
  const meaning = meaningOf(word, dialect, locale, t);
  const glossLocale = exampleMeaningLocale(dialect, locale);
  const kurdishMonth = word.set === 'months' && word.calendar === 'kurdish';
  // A Kurdish reader's meaning is the other dialect's word, which the row after it already gives.
  const showMeaning = locale !== 'ku' && locale !== 'ckb' && word.set !== 'numbers' && !kurdishMonth;

  const head = (big: boolean) => (
    <View style={styles.headWord} accessible accessibilityRole="header" accessibilityLabel={t('words.tileLabel', { word: wordIn(word, dialect), meaning: meaning.text })}>
      {word.set === 'colours' ? <Swatch hex={word.hex} size={big ? SWATCH_STAGED : SWATCH} /> : null}
      {word.set === 'numbers' ? <Digits value={word.value} dialect={dialect} size={big ? DIGITS_STAGED : DIGITS} /> : null}
      <Said word={word} dialect={dialect} size={word.set === 'colours' || word.set === 'numbers' ? typography.sizes.title : big ? WORD_STAGED : WORD} align="center" />
    </View>
  );
  const listen = <PlayButton src={sound} label={t('alphabet.listen')} player={player} size="large" />;

  return (
    <>
      <SpokenStage
        srcs={[sound]}
        audio={audio}
        player={player}
        fallback={
          <View style={[styles.head, { flexDirection: dir.row }]}>
            <View style={styles.flex}>{head(false)}</View>
            {listen}
          </View>
        }
      >
        <View style={styles.staged}>
          {head(true)}
          {listen}
        </View>
      </SpokenStage>

      {showMeaning ? (
        <Row label={t('words.means')}>
          <Text style={[styles.meaning, dir.text, { color: colors.textPrimary }]}>{meaning.text}</Text>
        </Row>
      ) : null}
      {kurdishMonth ? (
        <Row label={t('words.months.when')}>
          <Text style={[styles.meaning, dir.text, { color: colors.textPrimary }]}>{meaning.text}</Text>
        </Row>
      ) : null}

      <Row label={t(other === 'ckb' ? 'alphabet.inSorani' : 'alphabet.inKurmanci')}>
        <Said word={word} dialect={other} size={typography.sizes.title} align="start" />
      </Row>

      {word.set === 'colours' ? (
        <Row label={t('words.inPhrase')}>
          <WordText word={word.example} dialect={dialect} size={typography.sizes.text} align="start" />
          <Text style={[styles.gloss, glossLocale === locale ? dir.text : scriptText(glossLocale === 'ckb' ? 'ckb' : 'kmr'), { color: colors.textSecondary }]}>
            {glossIn(word.example, glossLocale)}
          </Text>
        </Row>
      ) : null}

      {word.set === 'numbers' ? (
        <Row label={t('words.make.label')}>
          <MakeNumber dialect={dialect} />
        </Row>
      ) : null}

      {word.set === 'days' ? (
        <Row label={t('words.days.ifToday', { day: wordIn(word, dialect) })}>
          {(['yesterday', 'today', 'tomorrow'] as const).map((when, i) => {
            const day = dayAfter(word, i - 1);
            const relative = RELATIVE_DAYS[when];
            return (
              <View
                key={when}
                style={[styles.relative, { flexDirection: scriptRow(dialect) }]}
                accessible
                accessibilityLabel={t('words.tileLabel', { word: `${wordIn(relative, dialect)} ${wordIn(day, dialect)}`, meaning: glossIn(relative, glossLocale) })}
              >
                <View style={styles.relativeWhen}>
                  <Text style={[styles.relativeWord, scriptText(dialect), { color: when === 'today' ? colors.primary : colors.textPrimary }]}>
                    {wordIn(relative, dialect)}
                  </Text>
                  <Text style={[styles.relativeGloss, { color: colors.textSecondary }]}>{glossIn(relative, glossLocale)}</Text>
                </View>
                <DayName day={day} dialect={dialect} style={dialect === 'ckb' ? styles.relativeDayArabic : styles.relativeDay} />
              </View>
            );
          })}
        </Row>
      ) : null}

      {word.set === 'months' ? (
        <Row label={t('words.months.season')}>
          <View style={[styles.season, { flexDirection: dir.row }]}>
            <View style={[styles.seasonDot, { backgroundColor: SEASONS[word.season].tint }]} />
            <Text
              style={[dialect === 'ckb' ? styles.seasonWordArabic : styles.seasonWord, scriptText(dialect), { color: colors.textPrimary }]}
              accessibilityLanguage={scriptLanguage(dialect)}
            >
              {wordIn(SEASONS[word.season], dialect)}
            </Text>
            <Text style={[styles.gloss, { color: colors.textSecondary }]}>{glossIn(SEASONS[word.season], glossLocale)}</Text>
          </View>
        </Row>
      ) : null}
      {word.set === 'months' && word.calendar === 'gregorian' && word.also && dialect === 'kmr' ? (
        <Row label={t('words.months.also')}>
          <Text style={[styles.also, scriptText('kmr'), dir.text, { color: colors.textPrimary }]} accessibilityLanguage="ku">
            {word.also}
          </Text>
        </Row>
      ) : null}
      {word.id === 'mar' || word.id === 'xakelewe' ? (
        <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('words.months.newroz', { date: dateIn(NEWROZ, locale, t) })}</Text>
      ) : null}

      {audio.sounds.isSynthesised(sound) ? <Text style={[styles.voiceNote, dir.text, { color: colors.textSecondary }]}>{t('alphabet.voiceNote')}</Text> : null}
    </>
  );
}

/** Any number typed, spelled out at once in the page's dialect. Digits from any keyboard are read: Western, Arabic or Persian. */
function MakeNumber({ dialect }: { dialect: AlphabetScript }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [text, setText] = useState('');
  const n = readDigits(text);
  const spelled: KurdishWord | null =
    n === null || n > KURDISH_NUMBER_MAX
      ? null
      : { kmr: kurdishNumber(n, 'kmr'), ckb: kurdishNumber(n, 'ckb'), ckbLatin: kurdishNumber(n, 'ckb', { latin: true }) };
  const hint = t('words.make.hint', { max: formatNumber(KURDISH_NUMBER_MAX, locale) });
  return (
    <View style={styles.make}>
      <TextInput
        value={text}
        // `v`, not `t`: the translator is in scope.
        onChangeText={(v) => setText(v.replace(/[^0-9٠-٩۰-۹]/g, '').slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        accessibilityLabel={t('words.make.label')}
        accessibilityHint={hint}
        style={[styles.input, { backgroundColor: colors.controlTrack, color: colors.textPrimary }]}
        testID="make-number"
      />
      <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{hint}</Text>
      {spelled ? (
        <View accessibilityLiveRegion="polite">
          <WordText word={spelled} dialect={dialect} size={typography.sizes.text} align="start" />
        </View>
      ) : null}
    </View>
  );
}

/** A part of the card under its little grey word, with a line above it. */
function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={[styles.row, { alignItems: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start', borderTopColor: colors.separator }]}>
      <CardLabel>{label}</CardLabel>
      {children}
    </View>
  );
}

/** Previous and next words at either end of the foot, with a tick for each step like a picker. */
function Stepper({ onStep }: { onStep: (by: number) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const step = (by: number, label: string, icon: 'chevron-left' | 'chevron-right') => (
    <Pressable
      onPress={() => {
        haptic('select');
        onStep(by);
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      // Each is alone at its end of the foot, with nothing near: it answers 8 past every edge.
      reach="open"
      style={({ pressed }) => [styles.step, { backgroundColor: colors.controlTrack, opacity: pressed ? pressedDim : 1 }]}
    >
      <Icon name={icon} size={20} color={colors.primary} style={dir.flip ?? undefined} />
    </Pressable>
  );
  return (
    <View style={[styles.stepper, { flexDirection: dir.row }]}>
      {step(-1, t('words.prev'), 'chevron-left')}
      {step(1, t('words.next'), 'chevron-right')}
    </View>
  );
}

const SWATCH = 72;
const SWATCH_STAGED = 96;
const DIGITS = typography.sizes.title;
const DIGITS_STAGED = typography.sizes.title;
const WORD = typography.sizes.title;
const WORD_STAGED = typography.sizes.title;

const styles = StyleSheet.create({
  // The gutter is the scroll view's own, so the card scrolls edge to edge.
  scroller: { paddingHorizontal: 0 },
  body: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm, gap: spacing.md },
  flex: { flex: 1 },
  centre: { textAlign: 'center' },

  head: { alignItems: 'center', gap: spacing.md },
  headWord: { alignItems: 'center', gap: spacing.sm },
  staged: { alignItems: 'center', gap: spacing.sm },
  latin: { fontSize: typography.sizes.text, writingDirection: 'ltr' },

  row: { gap: spacing.xs + 2, paddingTop: spacing.md - 2, borderTopWidth: StyleSheet.hairlineWidth },
  meaning: { ...display(typography.sizes.text), lineHeight: Math.round(typography.sizes.text * 1.3) },
  gloss: { fontSize: typography.sizes.text },
  note: { fontSize: typography.sizes.text, lineHeight: 21 },
  voiceNote: { fontSize: typography.sizes.text },
  also: { ...display(typography.sizes.title), lineHeight: Math.round(typography.sizes.title * 1.2) },

  make: { alignSelf: 'stretch', gap: spacing.xs + 2 },
  input: {
    minHeight: MIN_TOUCH_TARGET + 4,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    fontSize: typography.sizes.title,
    fontVariant: ['tabular-nums'],
  },
  hint: { fontSize: typography.sizes.text },

  relative: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 2 },
  relativeWhen: { flexShrink: 1 },
  relativeWord: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  relativeGloss: { fontSize: typography.sizes.text },
  relativeDay: { ...display(typography.sizes.text), lineHeight: Math.round(typography.sizes.text * 1.2) },
  relativeDayArabic: { fontSize: typography.sizes.text, lineHeight: Math.round(typography.sizes.text * 1.5) },

  season: { alignItems: 'center', gap: spacing.sm },
  seasonDot: { width: 12, height: 12, borderRadius: radii.pill },
  seasonWord: { ...display(typography.sizes.text), lineHeight: Math.round(typography.sizes.text * 1.3) },
  seasonWordArabic: { fontSize: typography.sizes.text, lineHeight: Math.round(typography.sizes.text * 1.5) },

  stepper: { justifyContent: 'space-between', marginTop: spacing.xs },
  step: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
