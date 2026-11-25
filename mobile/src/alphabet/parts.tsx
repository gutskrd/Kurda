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
import { radii, typography, wash } from '../theme/tokens';
import type { AlphabetAudio } from './audio';
import type { ClipPlayer } from './useClipPlayer';
import { pressedDim } from '../theme/motion';

/**
 * The small parts of the alphabet screen and its practice: a play button, the speaker's stage, a comparison with
 * its sound highlighted, a Kurdish word with its letter highlighted, and the word's meaning. Violet marks exactly
 * one thing here, the sound in a comparison and the letter in the word, also underlined so colour is not the only
 * cue.
 */

/** Which way a row of a script's letters runs: Kurmancî left to right, Soranî right to left, whatever the app's language. */
export function scriptRow(script: AlphabetScript): 'row' | 'row-reverse' {
  return (script === 'ckb') !== !!I18nManager.isRTL ? 'row-reverse' : 'row';
}

/** A script's text, set and read in its own direction and voice. */
export function scriptText(script: AlphabetScript): TextStyle {
  return script === 'ckb' ? { writingDirection: 'rtl' } : { writingDirection: 'ltr' };
}
export const scriptLanguage = (script: AlphabetScript): string => (script === 'ckb' ? 'ckb' : 'ku');

const BUTTON = { regular: MIN_TOUCH_TARGET, large: 52 } as const;

/**
 * A round button that plays one sound, or nothing when there is no clip or nothing to play it with. Its style
 * sets the drawn size, and the Pressable reaches from that to 48: 2 past each edge of the regular one, none for
 * the large.
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
  // Sounding: on, as a switch that is on is, in a wash of the ink with an ink edge.
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
          backgroundColor: on ? wash(colors.primary) : colors.controlTrack,
          borderColor: on ? colors.primary : 'transparent',
          opacity: pressed ? pressedDim : 1,
        },
      ]}
    >
      {/* The speaker points the same way in every language. */}
      <Icon name="speaker" size={size === 'large' ? 24 : 20} color={colors.primary} />
    </Pressable>
  );
}

/**
 * The speaker of the recordings at `srcs` on a stage of their own, with `children` (the letter and its play
 * button) beside them: the one sounding now, else the last that sounded, else the first. A tap greets and
 * replays; `reaction` cheers a right answer and tilts the head at a wrong one. `fallback` renders instead when no
 * recording has a speaker.
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
  /** Who says each recording: the alphabet's, or the word sets' (words/audio.ts). */
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

/** The example word's meaning, or for a reader who speaks that dialect the same word in the other one (`exampleMeaningLocale`). */
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

/** The small grey label over part of a letter's card; Arabic script keeps its letters joined, so no letter spacing there. */
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
  like: { ...display(typography.sizes.text), lineHeight: Math.round(typography.sizes.text * 1.35) },
  mark: { textDecorationLine: 'underline' },
  word: { ...display(typography.sizes.title), lineHeight: Math.round(typography.sizes.title * 1.2) },
  meaning: { fontSize: typography.sizes.text },
  untracked: { letterSpacing: 0 },
});
