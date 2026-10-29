import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  LATIN_LETTERS,
  SORANI_LETTERS,
  formsOf,
  likeFor,
  soraniLikeFor,
  type AlphabetScript,
  type LatinLetter,
  type SoraniLetter,
} from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useDirection } from '../reports/direction';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { display } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import type { AlphabetAudio } from './audio';
import { CardLabel, Like, MarkedWord, Meaning, PlayButton, SpokenStage, scriptLanguage, scriptRow, scriptText } from './parts';
import type { ClipPlayer } from './useClipPlayer';

const FORM: Record<'alone' | 'start' | 'middle' | 'end', TranslationKey> = {
  alone: 'alphabet.form.alone',
  start: 'alphabet.form.start',
  middle: 'alphabet.form.middle',
  end: 'alphabet.form.end',
};

/**
 * One letter, open: the letter large, its sound and the character who says
 * it standing beside it, what it sounds like in the reader's own language, a
 * word to remember it by with its own sound, its partner in the other script —
 * and, for Soranî, the shapes it takes inside a word. The way to the letter
 * before and after is at the foot, so a whole alphabet can be walked through
 * without closing.
 *
 * A sheet from the foot of the screen, as the website's is on a phone; on a
 * tablet it stays a sheet, centred, rather than a band across the screen.
 */
export function LetterSheet({
  script,
  letterId,
  audio,
  player,
  onStep,
  onClose,
}: {
  script: AlphabetScript;
  /** the letter open; null when the sheet is closed */
  letterId: string | null;
  audio: AlphabetAudio;
  player: ClipPlayer;
  onStep: (by: number) => void;
  onClose: () => void;
}): React.JSX.Element {
  // the letter stays on the sheet while it fades away
  const last = useRef<{ script: AlphabetScript; id: string } | null>(null);
  if (letterId) last.current = { script, id: letterId };
  const shown = last.current;
  const latin = shown?.script === 'kmr' ? LATIN_LETTERS.find((l) => l.id === shown.id) : undefined;
  const sorani = shown?.script === 'ckb' ? SORANI_LETTERS.find((l) => l.id === shown.id) : undefined;

  return (
    // no title in the header: the letter itself, large, heads the card
    <BottomSheet visible={letterId !== null} onClose={onClose} contentStyle={styles.scroller}>
      <SheetScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {latin ? <LatinCard letter={latin} audio={audio} player={player} /> : null}
        {sorani ? <SoraniCard letter={sorani} audio={audio} player={player} /> : null}
        <Stepper onStep={onStep} />
      </SheetScrollView>
    </BottomSheet>
  );
}

/**
 * The letter large, and its sound beside it: the head of either card. When
 * the letter's recordings have a character, it stands whole on a stage with
 * the letter beside it, and says the letter and the word below it both;
 * without one, the letter and its button stand on the card as they are.
 */
function Head({
  script,
  glyph,
  small,
  ipa,
  label,
  sound,
  word,
  audio,
  player,
}: {
  script: AlphabetScript;
  glyph: string;
  small?: string;
  ipa: string;
  label: string;
  sound: string | null;
  /** the example word's sound, which the same character says */
  word: string | null;
  audio: AlphabetAudio;
  player: ClipPlayer;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const letter = (big: boolean) => (
    <Text
      style={[
        script === 'ckb' ? styles.glyphArabic : styles.glyph,
        big && (script === 'ckb' ? styles.glyphArabicBig : styles.glyphBig),
        scriptText(script),
        { color: colors.textPrimary },
      ]}
      accessibilityRole="header"
      accessibilityLabel={label}
      accessibilityLanguage={scriptLanguage(script)}
      maxFontSizeMultiplier={1.3}
    >
      {glyph}
      {small ? <Text style={[styles.glyphSmall, { color: colors.textSecondary }]}>{` ${small}`}</Text> : null}
    </Text>
  );
  // the sound in the phonetic alphabet, for whoever reads it; a screen reader has the button
  const phonetic = (
    <View style={[styles.ipa, { backgroundColor: colors.controlTrack }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={[styles.ipaText, { color: colors.textSecondary }]}>{`/${ipa}/`}</Text>
    </View>
  );
  const listen = <PlayButton src={sound} label={t('alphabet.listen')} player={player} size="large" />;
  return (
    <SpokenStage
      srcs={[sound, word]}
      audio={audio}
      player={player}
      fallback={
        <View style={[styles.head, { flexDirection: dir.row }]}>
          <View style={[styles.glyphColumn, startOf(dir.row)]}>
            {letter(false)}
            {phonetic}
          </View>
          <View style={styles.flex} />
          {listen}
        </View>
      }
    >
      <View style={styles.staged}>
        {letter(true)}
        <View style={[styles.stagedTools, { flexDirection: dir.row }]}>
          {listen}
          {phonetic}
        </View>
      </View>
    </SpokenStage>
  );
}

/** A part of the card under its little grey word, with a line above it. */
function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={[styles.row, startOf(dir.row), { borderTopColor: colors.separator }]}>
      <CardLabel>{label}</CardLabel>
      {children}
    </View>
  );
}

/** The example word with its meaning, and the word's own sound beside them (said by the character on the stage above). */
function WordRow({ word, sound, player }: { word: React.ReactNode; sound: string | null; player: ClipPlayer }): React.JSX.Element {
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={[styles.wordRow, { flexDirection: dir.row }]}>
      <View style={[styles.flex, startOf(dir.row)]}>{word}</View>
      <PlayButton src={sound} label={t('alphabet.listenWord')} player={player} />
    </View>
  );
}

function Note({ children }: { children: string }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{children}</Text>;
}

/** Said under the card when a sound on it is a computer's: honest about it, and only then. */
function VoiceNote({ srcs, audio }: { srcs: Array<string | null>; audio: AlphabetAudio }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  if (!srcs.some((src) => audio.sounds.isSynthesised(src))) return null;
  return <Text style={[styles.voiceNote, dir.text, { color: colors.textSecondary }]}>{t('alphabet.voiceNote')}</Text>;
}

function LatinCard({ letter, audio, player }: { letter: LatinLetter; audio: AlphabetAudio; player: ClipPlayer }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const like = likeFor(letter.id, locale);
  const sound = audio.sounds.latinSound(letter.id);
  const word = audio.sounds.latinWord(letter.id);
  return (
    <>
      <Head
        script="kmr"
        glyph={letter.upper}
        small={letter.id}
        ipa={letter.ipa}
        label={`${letter.upper} ${letter.id}`}
        sound={sound}
        word={word}
        audio={audio}
        player={player}
      />
      {like ? (
        <Row label={t('alphabet.soundsLike')}>
          <Like like={like} />
        </Row>
      ) : null}
      <Row label={t('alphabet.rememberBy')}>
        <WordRow
          sound={word}
          player={player}
          word={
            <>
              <MarkedWord word={letter.word} letter={letter.id} />
              <Meaning meaning={letter.meaning} script="kmr" />
            </>
          }
        />
      </Row>
      <Row label={t('alphabet.inSorani')}>
        {letter.sorani ? (
          <Text style={[styles.partnerArabic, scriptText('ckb'), { color: colors.textPrimary }]} accessibilityLanguage="ckb">
            {letter.sorani}
          </Text>
        ) : (
          <Note>{t('alphabet.notWritten')}</Note>
        )}
      </Row>
      {letter.note === 'long' ? <Note>{t('alphabet.note.long')}</Note> : null}
      {letter.note === 'rolled' ? <Note>{t('alphabet.note.rolled')}</Note> : null}
      <VoiceNote srcs={[sound, word]} audio={audio} />
    </>
  );
}

function SoraniCard({ letter, audio, player }: { letter: SoraniLetter; audio: AlphabetAudio; player: ClipPlayer }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const like = locale === 'ckb' ? null : soraniLikeFor(letter, locale);
  const forms = formsOf(letter);
  const sound = audio.sounds.soraniSound(letter);
  const word = audio.sounds.soraniWord(letter);
  return (
    <>
      <Head script="ckb" glyph={letter.char} ipa={letter.ipa} label={letter.char} sound={sound} word={word} audio={audio} player={player} />
      {locale === 'ar' && letter.kurdishOnly ? (
        <View style={[styles.badge, startOf(dir.row), { backgroundColor: colors.controlTrack }]}>
          <Text style={[styles.badgeText, { color: colors.goldText }]}>{t('alphabet.notInArabic')}</Text>
        </View>
      ) : null}
      {like ? (
        <Row label={t('alphabet.soundsLike')}>
          <Like like={like} />
        </Row>
      ) : null}
      {letter.latin ? (
        <Row label={t('alphabet.inKurmanci')}>
          <Text style={[styles.partner, scriptText('kmr'), { color: colors.textPrimary }]} accessibilityLanguage="ku">
            {letter.latin}
          </Text>
        </Row>
      ) : null}
      <Row label={t('alphabet.forms')}>
        <View style={[styles.forms, { flexDirection: scriptRow('ckb') }]}>
          {(['alone', 'start', 'middle', 'end'] as const).map((k) => (
            <View key={k} style={[styles.form, { backgroundColor: colors.controlTrack }]} accessible accessibilityLabel={`${t(FORM[k])}: ${letter.char}`}>
              <Text style={[styles.formGlyph, scriptText('ckb'), { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
                {forms[k]}
              </Text>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                {t(FORM[k])}
              </Text>
            </View>
          ))}
        </View>
        {!letter.joins ? <Note>{t('alphabet.noJoin')}</Note> : null}
      </Row>
      <Row label={t('alphabet.rememberBy')}>
        <WordRow
          sound={word}
          player={player}
          word={
            <>
              <Text style={[styles.wordArabic, scriptText('ckb'), { color: colors.textPrimary }]} accessibilityLanguage="ckb">
                {letter.word}
              </Text>
              <Meaning meaning={letter.meaning} script="ckb" />
            </>
          }
        />
      </Row>
      {letter.alsoVowel ? <Note>{t('alphabet.alsoVowel', { letter: letter.alsoVowel.latin, word: letter.alsoVowel.word })}</Note> : null}
      <VoiceNote srcs={[sound, word]} audio={audio} />
    </>
  );
}

/** The letter before and the letter after, at either end of the foot, pointing the way the reader reads. */
function Stepper({ onStep }: { onStep: (by: number) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const step = (by: number, label: string, icon: 'chevron-left' | 'chevron-right') => (
    <Pressable
      onPress={() => onStep(by)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.step, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 }]}
    >
      <Icon name={icon} size={20} color={colors.primary} style={dir.flip ?? undefined} />
    </Pressable>
  );
  return (
    <View style={[styles.stepper, { flexDirection: dir.row }]}>
      {step(-1, t('alphabet.prevLetter'), 'chevron-left')}
      {step(1, t('alphabet.nextLetter'), 'chevron-right')}
    </View>
  );
}

/** A column starts on the reading side: the right, in Soranî and Arabic. */
function startOf(row: string | undefined): { alignItems: 'flex-start' | 'flex-end' } {
  return { alignItems: row === 'row-reverse' ? 'flex-end' : 'flex-start' };
}

const GLYPH = 64;
const GLYPH_STAGED = 84;

const styles = StyleSheet.create({
  // the gutter is the scroll view's own, so the card scrolls edge to edge
  scroller: { paddingHorizontal: 0 },
  body: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm, gap: spacing.md },
  flex: { flex: 1 },

  head: { alignItems: 'center', gap: spacing.md },
  glyphColumn: { gap: spacing.sm },
  glyph: { ...display(GLYPH), lineHeight: Math.round(GLYPH * 1.1) },
  glyphArabic: { fontSize: GLYPH, lineHeight: Math.round(GLYPH * 1.5) },
  // beside the character on its stage the letter is bigger still: the thing to look at
  glyphBig: { ...display(GLYPH_STAGED), lineHeight: Math.round(GLYPH_STAGED * 1.1) },
  glyphArabicBig: { fontSize: GLYPH_STAGED, lineHeight: Math.round(GLYPH_STAGED * 1.4) },
  glyphSmall: { fontSize: Math.round(GLYPH * 0.55) },
  ipa: { borderRadius: radii.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 3 },
  ipaText: { fontSize: typography.sizes.xs },
  staged: { alignItems: 'center', gap: spacing.sm },
  stagedTools: { alignItems: 'center', gap: spacing.sm + 2 },

  badge: { alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 3, marginTop: -spacing.xs },
  badgeText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },

  row: { gap: spacing.xs + 2, paddingTop: spacing.md - 2, borderTopWidth: StyleSheet.hairlineWidth },
  wordRow: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.md },
  partner: { ...display(typography.sizes.xxl), lineHeight: Math.round(typography.sizes.xxl * 1.2) },
  partnerArabic: { fontSize: typography.sizes.xxl, lineHeight: Math.round(typography.sizes.xxl * 1.5) },
  wordArabic: { fontSize: typography.sizes.xl, lineHeight: Math.round(typography.sizes.xl * 1.5) },
  note: { fontSize: typography.sizes.sm, lineHeight: 21 },
  voiceNote: { fontSize: typography.sizes.xs },

  forms: { alignSelf: 'stretch', gap: spacing.sm },
  form: { flex: 1, alignItems: 'center', gap: 2, borderRadius: radii.md, paddingTop: spacing.sm, paddingBottom: spacing.sm - 2 },
  formGlyph: { fontSize: typography.sizes.xl, lineHeight: Math.round(typography.sizes.xl * 1.5) },
  formLabel: { fontSize: typography.sizes.xs },

  stepper: { justifyContent: 'space-between', marginTop: spacing.xs },
  step: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
