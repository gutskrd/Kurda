import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../../theme/tokens';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { useTheme } from '../../theme/ThemeProvider';
import { ClayButton } from '../../theme/glass';
import type { Exercise } from '../types';
import { useAudio } from '../useAudio';
import { useI18n } from '../../i18n/I18nContext';
import { knownVoice } from '../../characters/SpeakingCharacter';
import { CharacterStage } from '../../characters/CharacterStage';
import { KurdishAnswerInput } from './KurdishAnswerInput';

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
 * Listen and type what you hear (KUR-035): the clip at full speed and at
 * 0.75×, as often as wanted. The clip is the question, so it plays by itself a
 * beat after the exercise appears (once it has loaded), as it does on the
 * website. "Can't listen now" sits in the footer, beside Check.
 */
export function ListeningExercise({ exercise, text, onChangeText, onSkip, disabled, dialect, verdict = null }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const audio = useAudio(exercise.audioUrl);
  const skippedRef = useRef(false);
  // who says the clip, when an editor has chosen somebody; the buttons alone otherwise
  const voice = knownVoice(exercise.audioVoice);

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

  const controls = (
    <>
      <ClayButton
        label={t('lesson.listen.playShort')}
        icon="speaker"
        tone="primary"
        disabled={disabled || cannotPlay}
        onPress={() => audio.play(1)}
      />
      {/* the same sound, slower; quieter than the button beside it */}
      <ClayButton
        label="0.75×"
        tone="primary"
        variant="outline"
        disabled={disabled || cannotPlay}
        onPress={() => audio.play(0.75)}
      />
    </>
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{t('lesson.listen.prompt')}</Text>

      {voice ? (
        // head to waist on its stage, the buttons standing beside it; a tap on it says it again too
        <CharacterStage
          key={exercise.id}
          speaker={voice.speaker}
          voice={voice}
          player={audio.clock}
          playing={audio.playing}
          source={exercise.audioUrl}
          onPress={disabled || cannotPlay ? undefined : () => audio.play(1)}
          // it is pleased with a right answer, and thinks a wrong one over with you
          reaction={verdict === 'right' ? 'cheer' : verdict === 'wrong' ? 'hmm' : null}
        >
          {controls}
        </CharacterStage>
      ) : (
        <View style={styles.controls}>{controls}</View>
      )}

      {exercise.prompt ? <Text style={[styles.prompt, { color: colors.textSecondary }]}>{exercise.prompt}</Text> : null}

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
    </View>
  );
}

/** How long after the exercise appears its clip plays by itself: long enough to see what is being asked. */
const AUTOPLAY_MS = 250;

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  label: { fontSize: typography.sizes.sm, textTransform: 'uppercase' },
  controls: { flexDirection: 'row', gap: spacing.sm },
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
