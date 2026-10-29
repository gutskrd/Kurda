import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tileAnswer } from '@kurda/shared';
import { radii, spacing, typography } from '../../theme/tokens';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../theme/Icon';
import type { Exercise } from '../types';
import type { PlaybackClock } from '../../characters/voice';
import { useAudio } from '../useAudio';
import { useI18n } from '../../i18n/I18nContext';
import { useDirection } from '../../reports/direction';
import { knownVoice } from '../../characters/SpeakingCharacter';
import { useAnswerMode } from '../answerModePref';
import { ExerciseHeadline } from './ExerciseHeadline';
import { KurdishAnswerInput } from './KurdishAnswerInput';
import { PromptScene } from './SpeechBubble';
import { AnswerModeSwitch, WordBank } from './WordBank';

interface Props {
  exercise: Exercise;
  text: string;
  onChangeText: (text: string) => void;
  /** put the exercise off when its clip cannot be played: not counted wrong ("can't listen now" is the footer's) */
  onSkip: () => void;
  disabled: boolean;
  /** the course's variety of Kurdish, for the key bar */
  dialect?: string | null;
  /** how the answer was graded, once it has been */
  verdict?: 'right' | 'wrong' | null;
}

/**
 * Listen, and give back what you heard (KUR-035). Whoever says the clip
 * stands beside a speech bubble holding a speaker and a waveform that lights
 * up along the clip as it plays; a tap on the bubble plays it again, and
 * "Slow" under it plays it at 0.75×, as often as wanted. The clip is the
 * question, so it plays by itself a beat after the exercise appears (once it
 * has loaded), as it does on the website. "Can't listen now" sits in the
 * footer, beside Check.
 *
 * When the item comes with word tiles the answer is built from them (unless
 * this device would rather type: the switch under them says which); otherwise
 * it is typed, with the Kurdish key bar.
 */
export function ListeningExercise({ exercise, text, onChangeText, onSkip, disabled, dialect, verdict = null }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const audio = useAudio(exercise.audioUrl);
  const skippedRef = useRef(false);
  const voice = knownVoice(exercise.audioVoice);
  const bank = exercise.bank && exercise.bank.length > 0 ? exercise.bank : null;
  const [mode, setMode] = useAnswerMode();
  const tiles = !!bank && mode === 'tiles';
  const [placed, setPlaced] = useState<number[]>([]);

  // played once by itself: AUTOPLAY_MS after the exercise appears, or as soon after as the clip has loaded
  const shownAt = useRef(Date.now());
  const autoplayed = useRef(false);
  const loaded = audio.clock !== null;
  const { play } = audio;
  useEffect(() => {
    if (!loaded || disabled || autoplayed.current) return;
    const id = setTimeout(() => {
      autoplayed.current = true;
      play(1);
    }, Math.max(0, AUTOPLAY_MS - (Date.now() - shownAt.current)));
    return () => clearTimeout(id);
  }, [loaded, disabled, play]);

  // audio download/playback failure → auto-skip once (KUR-035 edge case)
  const cannotPlay = !audio.supported || audio.error;
  useEffect(() => {
    if (audio.error && !skippedRef.current) {
      skippedRef.current = true;
      onSkip();
    }
  }, [audio.error, onSkip]);

  // back on the tiles, the answer is what they say again
  useEffect(() => {
    if (tiles && bank) onChangeText(tileAnswer(bank, placed));
    // only as the way of answering changes; laying a tile says it itself
  }, [tiles]);

  const lay = (next: number[]): void => {
    setPlaced(next);
    if (bank) onChangeText(tileAnswer(bank, next));
  };

  const playable = !disabled && !cannotPlay;
  return (
    <View style={styles.container}>
      <ExerciseHeadline>{t(tiles ? 'lesson.listen.tapPrompt' : 'lesson.listen.prompt')}</ExerciseHeadline>

      <PromptScene
        voice={voice}
        audio={audio}
        reaction={verdict === 'right' ? 'cheer' : verdict === 'wrong' ? 'hmm' : null}
        onReplay={playable ? () => audio.play(1) : undefined}
        bubble={playable ? { onPress: () => audio.play(1), label: t('lesson.listen.play') } : null}
        below={
          <Pressable
            onPress={() => audio.play(0.75)}
            disabled={!playable}
            accessibilityRole="button"
            accessibilityLabel={t('lesson.listen.playSlow')}
            accessibilityState={{ disabled: !playable }}
            style={({ pressed }) => [styles.slow, (pressed || !playable) && styles.pressed]}
          >
            <Text style={[styles.slowText, { color: colors.textPrimary }]}>{t('lesson.listen.slow')}</Text>
          </Pressable>
        }
      >
        <View style={[styles.clip, { flexDirection: dir.row }]}>
          {/* sounding into the waveform, whichever side of it it stands */}
          <Icon name="speaker-high" size={28} color={audio.playing ? colors.goldText : colors.primary} style={dir.flip} />
          <Waveform clock={audio.clock} playing={audio.playing} />
        </View>
      </PromptScene>

      {exercise.prompt ? <Text style={[styles.prompt, dir.free, { color: colors.textSecondary }]}>{exercise.prompt}</Text> : null}

      {tiles && bank ? (
        <WordBank bank={bank} placed={placed} onChange={lay} disabled={disabled} verdict={verdict} lineLabel={t('lesson.listen.answerLabel')} />
      ) : (
        <KurdishAnswerInput
          text={text}
          onChangeText={onChangeText}
          dialect={dialect}
          disabled={disabled}
          verdict={verdict}
          placeholder={t('lesson.listen.placeholder')}
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.controlTrack }, disabled && styles.dim]}
          accessibilityLabel={t('lesson.listen.answerLabel')}
        />
      )}
      {bank && !disabled ? <AnswerModeSwitch mode={mode} onChange={setMode} end={dir.rtl ? 'left' : 'right'} /> : null}
    </View>
  );
}

/** How long after the exercise appears its clip plays by itself: long enough to see what is being asked. */
const AUTOPLAY_MS = 250;

/** The waveform's bars, as shares of its height: a made-up shape, the same for every clip. */
const BARS = [0.25, 0.4, 0.6, 0.35, 0.8, 1, 0.55, 0.75, 0.4, 0.9, 0.65, 0.3, 0.7, 0.95, 0.5, 0.35, 0.6, 0.25];

/**
 * The clip's waveform: its bars light up in gold along the clip while it
 * plays, read from the player itself on every frame, and stand in the brand's
 * ink when it is still. Colour, not motion, so it is the same under Reduce
 * Motion.
 */
function Waveform({ clock, playing }: { clock: PlaybackClock | null; playing: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const [lit, setLit] = useState(-1);
  useEffect(() => {
    if (!playing || !clock) {
      setLit(-1);
      return;
    }
    let frame: number | null = null;
    const tick = (): void => {
      const share = clock.duration > 0 ? clock.currentTime / clock.duration : 0;
      setLit(Math.floor(share * BARS.length));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [playing, clock]);
  return (
    <View style={styles.wave} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="listening-waveform">
      {BARS.map((h, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            { height: Math.max(4, h * WAVE), backgroundColor: !playing ? colors.primary : i <= lit ? colors.goldText : colors.textSecondary },
          ]}
        />
      ))}
    </View>
  );
}

/** The waveform's height. */
const WAVE = 30;

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  clip: { alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  wave: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: WAVE },
  bar: { width: 3, borderRadius: radii.pill },
  slow: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.sm },
  slowText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, letterSpacing: 0.4 },
  pressed: { opacity: 0.5 },
  prompt: { fontSize: typography.sizes.md },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: typography.sizes.lg,
  },
  dim: { opacity: 0.4 },
});
