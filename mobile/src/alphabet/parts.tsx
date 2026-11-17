import { useEffect, useState } from 'react';
import { I18nManager, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Pressable } from '../theme/Pressable';
import {
  ALPHABET_MEANINGS,
  exampleMeaningLocale,
  indexInWord,
  type AlphabetMeaning,
  type AlphabetScript,
  type SoundLikeness,
} from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { CharacterStage } from '../characters/CharacterStage';
import { STAGE_HEIGHT } from '../characters/voice';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { display, sectionLabel } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, typography } from '../theme/tokens';
import type { AlphabetAudio } from './audio';
import type { ClipPlayer } from './useClipPlayer';
import { pressedDim } from '../theme/motion';

/**
 * The small parts the alphabet screen and its practice are made of: a sound's
 * play button, the stage the character who says it stands on, a comparison
 * with its sound picked out, a Kurdish word with its letter picked out, and
 * what the word means.
 *
 * The app's violet is its colour for "look at this", so it marks exactly one
 * thing here: the sound inside a comparison and the letter inside the Kurdish
 * word, underlined as well, so it is never said by colour alone. It was the
 * sun's gold, which the app keeps for what is earned.
 */

/**
 * Which way a row of a script's letters runs: Kurmancî left to right and
 * Soranî right to left, whatever language the app is read in.
 */
export function scriptRow(script: AlphabetScript): 'row' | 'row-reverse' {
  return (script === 'ckb') !== !!I18nManager.isRTL ? 'row-reverse' : 'row';
}

/** A script's text, set and read in its own direction and voice. */
export function scriptText(script: AlphabetScript): TextStyle {
  return script === 'ckb' ? { writingDirection: 'rtl' } : { writingDirection: 'ltr' };
}
export const scriptLanguage = (script: AlphabetScript): string => (script === 'ckb' ? 'ckb' : 'ku');

const BUTTON = { regular: MIN_TOUCH_TARGET, large: 52 } as const;
/** How much of the violet a sounding button is, as the last two digits of its colour: the tab bar's own wash. */
const ON_WASH = '1F';

/**
 * A round button that plays one sound. Nothing at all when there is no clip,
 * or nothing to play it with: a button that does nothing is worse than none.
 * Its style says how big it is drawn, and the Pressable reaches from that to
 * a fingertip's 48: 2 past each edge of the regular one, none past the large.
 */
export function PlayButton({
  src,
  label,
  player,
  size = 'regular',
}: {
  src: string | null;
  label: string;
  player: ClipPlayer;
  size?: keyof typeof BUTTON;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  if (!src || !player.supported) return null;
  // sounding: on, as a switch that is on is, in a wash of the violet with a violet edge
  const on = player.isPlaying(src);
  const side = BUTTON[size];
  return (
    <Pressable
      onPress={() => player.play(src)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.play,
        {
          width: side,
          height: side,
          backgroundColor: on ? `${colors.primary}${ON_WASH}` : colors.controlTrack,
          borderColor: on ? colors.primary : 'transparent',
          opacity: pressed ? pressedDim : 1,
        },
      ]}
    >
      {/* the speaker points the same way in every language */}
      <Icon name="speaker" size={size === 'large' ? 24 : 20} color={colors.primary} />
    </Pressable>
  );
}

/**
 * Whoever says the recordings at `srcs`, standing whole on a stage of their
 * own with `children` — the letter, the button that plays it — beside them:
 * the one sounding now, else the last that sounded, else the first. A tap on
 * them greets you and says it again; `reaction` gets a cheer for a right
 * answer and a curious tilt of the head for one that was not yet.
 *
 * `fallback` instead when none of the recordings has a character (a
 * synthesised clip, or a recording nobody was chosen for), so the place is as
 * it always was without one.
 */
export function SpokenStage({
  srcs,
  audio,
  player,
  reaction = null,
  fallback,
  children,
}: {
  srcs: ReadonlyArray<string | null>;
  /** who says each recording: the alphabet's, or the word sets' (words/audio.ts) */
  audio: Pick<AlphabetAudio, 'voiceOf'>;
  player: ClipPlayer;
  reaction?: 'cheer' | 'hmm' | null;
  fallback: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  const voiced = srcs.filter((src): src is string => !!src && audio.voiceOf(src) !== null);
  const sounding = voiced.find((src) => player.isPlaying(src)) ?? null;
  const [heard, setHeard] = useState<string | null>(null);
  useEffect(() => {
    if (sounding) setHeard(sounding);
  }, [sounding]);
  const src = sounding ?? (heard && voiced.includes(heard) ? heard : (voiced[0] ?? null));
  const spoken = audio.voiceOf(src);
  if (!src || !spoken || !player.supported) return <>{fallback}</>;
  return (
    <CharacterStage
      speaker={spoken.voice.speaker}
      voice={spoken.voice}
      text={spoken.text}
      player={player.clockFor(src)}
      playing={player.isPlaying(src)}
      source={src}
      height={STAGE_HEIGHT.card}
      reaction={reaction}
      onPress={() => player.play(src)}
    >
      {children}
    </CharacterStage>
  );
}

/** A comparison in the reader's language, with the sound itself picked out. */
export function Like({ like, style }: { like: SoundLikeness; style?: StyleProp<TextStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Text style={[styles.like, { color: colors.textPrimary }, style]}>
      {like.before}
      {like.sound ? <Text style={[styles.mark, { color: colors.primary, textDecorationColor: colors.primary }]}>{like.sound}</Text> : null}
      {like.after}
    </Text>
  );
}

/** A Kurmancî word with its letter picked out: the shape and the sound met together. */
export function MarkedWord({ word, letter, style }: { word: string; letter: string; style?: StyleProp<TextStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const at = indexInWord(word, letter);
  return (
    <Text style={[styles.word, scriptText('kmr'), { color: colors.textPrimary }, style]} accessibilityLanguage="ku">
      {at < 0 ? (
        word
      ) : (
        <>
          {word.slice(0, at)}
          <Text style={[styles.mark, { color: colors.primary, textDecorationColor: colors.primary }]}>{word.slice(at, at + letter.length)}</Text>
          {word.slice(at + letter.length)}
        </>
      )}
    </Text>
  );
}

/**
 * What the example word means — or, for a reader who already speaks that
 * dialect, the same word in the other one (`exampleMeaningLocale`).
 */
export function Meaning({ meaning, script, style }: { meaning: AlphabetMeaning; script: AlphabetScript; style?: StyleProp<TextStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
  const dir = useDirection();
  const shown = exampleMeaningLocale(script, locale);
  const other = shown !== locale;
  return (
    <Text
      style={[styles.meaning, other ? scriptText(shown === 'ckb' ? 'ckb' : 'kmr') : dir.text, { color: colors.textSecondary }, style]}
      accessibilityLanguage={other ? shown : undefined}
    >
      {ALPHABET_MEANINGS[meaning][shown]}
    </Text>
  );
}

/** The little grey word over a part of a letter's card. Arabic script keeps its letters joined: no tracking there. */
export function CardLabel({ children, style }: { children: string; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={style}>
      <Text style={[sectionLabel, dir.text, dir.rtl && styles.untracked, { color: colors.textSecondary }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  play: { borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  like: { ...display(typography.sizes.lg), lineHeight: Math.round(typography.sizes.lg * 1.35) },
  mark: { textDecorationLine: 'underline' },
  word: { ...display(typography.sizes.xl), lineHeight: Math.round(typography.sizes.xl * 1.2) },
  meaning: { fontSize: typography.sizes.sm },
  untracked: { letterSpacing: 0 },
});
