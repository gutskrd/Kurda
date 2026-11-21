import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import { radii, spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { ClayButton } from '../../theme/glass';
import { Icon } from '../../theme/Icon';
import { haptic } from '../../feedback/haptics';
import { MAX_TAKE_MS, recordingRejection, type Take } from '../recording';
import type { Exercise, SelfRating } from '../types';
import { useAudio } from '../useAudio';
import { useRecorder } from '../useRecorder';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/translations';
import { useDirection } from '../../reports/direction';
import { knownVoice } from '../../characters/SpeakingCharacter';
import { CharacterStage } from '../../characters/CharacterStage';
import { askHeadline } from '../asks';
import { ExerciseHeadline } from './ExerciseHeadline';
import { ModelButton } from './ModelButton';
import { saidStyle } from './SpeechBubble';
import { heldDim } from '../../theme/MotionParts';

interface Props {
  exercise: Exercise;
  /** Reports whether there is a take to rate (it stays on the device). */
  onSetRecorded: (recorded: boolean) => void;
  /** The learner's own rating of the recording, once given. */
  selfRating: SelfRating | null;
  onRate: (rating: SelfRating | null) => void;
  disabled: boolean;
}

const RATINGS: Array<{ rating: SelfRating; label: TranslationKey }> = [
  { rating: 'good', label: 'lesson.speak.rateGood' },
  { rating: 'close', label: 'lesson.speak.rateClose' },
  { rating: 'retry', label: 'lesson.speak.rateRetry' },
];

const FAILED: Record<'start' | 'save', TranslationKey> = {
  start: 'recorder.couldNotStart',
  save: 'recorder.couldNotSave',
};

/**
 * Speaking: record, hear it beside the native speaker, and rate how close it was ("Sounded right / Close / Try
 * again"). The server cannot judge a recording, so the rating is what is submitted, and the take never leaves the
 * phone, since storing learners' voices would serve no purpose.
 *
 * The microphone is requested at the first press of record. If refused, the exercise says so and offers the
 * phone's settings, and "Can't speak now" in the footer skips speaking without a mistake. A 'repeat' item is headed
 * "Repeat after Hamo" (whoever says its recording), or "Say it aloud" when nobody does.
 */
export function SpeakingExercise({ exercise, onSetRecorded, selfRating, onRate, disabled }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const recorder = useRecorder();
  const [status, setStatus] = useState<'idle' | 'ready' | 'rejected'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const processed = useRef<Take | null>(null);
  // The learner's own press ended the take, rather than the time limit or the app leaving the front.
  const stoppedByHand = useRef(false);
  const ownAudio = useAudio(recorder.result?.uri || undefined);
  const model = useAudio(exercise.modelAudioUrl);
  const dir = useDirection();
  // Who says the native model, when an editor chose someone.
  const voice = knownVoice(exercise.modelAudioVoice);
  const headline = askHeadline(exercise);

  // A fresh recording is validated, then ready to rate.
  const { result, reset } = recorder;
  useEffect(() => {
    if (!result || processed.current === result) return;
    processed.current = result;
    const byHand = stoppedByHand.current;
    stoppedByHand.current = false;
    onRate(null);

    const reject = recordingRejection({ durationMs: result.durationMs, byteSize: result.byteSize });
    if (reject) {
      setStatus('rejected');
      setMessage(t(reject));
      onSetRecorded(false);
      reset();
      return;
    }
    onSetRecorded(true);
    setStatus('ready');
    setMessage(null);
    // A take kept by the learner's Stop gets a haptic; one that stopped by itself does not.
    if (byHand) haptic('tap');
  }, [result, reset, onSetRecorded, onRate, t]);

  // A take that could not be started or kept is reported.
  useEffect(() => {
    if (recorder.failed) haptic('error');
  }, [recorder.failed]);

  const record = (): void => {
    // Whatever was shown concerned the take this one replaces.
    stoppedByHand.current = false;
    setStatus('idle');
    setMessage(null);
    onRate(null);
    onSetRecorded(false);
    void recorder.start();
  };

  const finish = (): void => {
    stoppedByHand.current = true;
    recorder.stop();
  };

  const micOff = recorder.permission === 'denied';
  const note = message ?? (recorder.failed ? t(FAILED[recorder.failed]) : null);
  // How much of the take's time is used; it stops by itself at the end.
  const used = Math.min(1, recorder.durationMs / MAX_TAKE_MS);

  return (
    <View style={styles.container}>
      <ExerciseHeadline>{headline ? t(headline.key, headline.params) : t('lesson.speak.prompt')}</ExerciseHeadline>
      {exercise.prompt ? <Text style={[saidStyle(exercise.prompt), dir.free, { color: colors.textPrimary }]}>{exercise.prompt}</Text> : null}

      {model.supported && voice ? (
        // Head to waist on its stage, saying the sentence; a tap on it replays it too.
        <CharacterStage
          key={exercise.id}
          speaker={voice.speaker}
          voice={voice}
          text={exercise.prompt}
          player={model.clock}
          playing={model.playing}
          source={exercise.modelAudioUrl}
          onPress={() => model.play(1)}
          // Pleased when the learner rates it good; a near miss is theirs to judge.
          reaction={selfRating === 'good' ? 'cheer' : null}
        >
          <ModelButton playing={model.playing} onPress={() => model.play(1)} />
        </CharacterStage>
      ) : model.supported ? (
        <ModelButton playing={model.playing} onPress={() => model.play(1)} />
      ) : null}

      {!recorder.supported ? (
        <Text style={[styles.detail, { color: colors.textSecondary }]}>{t('lesson.speak.unavailable')}</Text>
      ) : micOff ? (
        <View style={styles.recordingBox}>
          <Text style={[styles.detail, { color: colors.textSecondary }]}>{t('lesson.speak.micOff')}</Text>
          {recorder.openSettings ? (
            <ClayButton label={t('lesson.speak.openSettings')} icon="gear" variant="outline" tone="primary" onPress={recorder.openSettings} />
          ) : null}
        </View>
      ) : recorder.recording ? (
        <View style={styles.recordingBox}>
          <View style={styles.waveform}>
            {[10, 20, 32, 18, 26, 14, 24].map((h, i) => (
              <View key={i} style={[styles.bar, { height: h, backgroundColor: colors.danger }]} />
            ))}
          </View>
          <Text style={[styles.dur, { color: colors.textPrimary }]}>{(recorder.durationMs / 1000).toFixed(1)}s</Text>
          <View
            style={[styles.track, { backgroundColor: colors.controlTrack, flexDirection: dir.row }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View style={[styles.used, { width: `${used * 100}%`, backgroundColor: colors.danger }]} />
          </View>
          <Pressable
            onPress={finish}
            // The only control while recording, with nothing near it, so it answers 8 past every edge.
            reach="open"
            style={({ pressed }) => [styles.stop, { backgroundColor: colors.textPrimary }, pressed && heldDim]}
            accessibilityRole="button"
            accessibilityLabel={t('lesson.speak.stop')}
          >
            <Icon name="stop" size={14} color={colors.background} />
            <Text style={[styles.stopText, { color: colors.background }]}>{t('lesson.speak.stop')}</Text>
          </Pressable>
        </View>
      ) : status === 'ready' ? (
        <View style={styles.recordingBox}>
          <View style={styles.row}>
            {ownAudio.supported ? (
              <ClayButton label={t('lesson.speak.playOwn')} icon="play" variant="outline" tone="primary" onPress={() => ownAudio.play(1)} />
            ) : null}
            <ClayButton label={t('lesson.speak.reRecord')} icon="record" variant="outline" disabled={disabled} onPress={record} />
          </View>
          <Text style={[styles.detail, { color: colors.textPrimary }]}>{t('lesson.speak.rateQuestion')}</Text>
          <View style={styles.row}>
            {RATINGS.map(({ rating, label }) => (
              <ClayButton
                key={rating}
                label={t(label)}
                icon={selfRating === rating ? 'check' : undefined}
                tone={selfRating === rating ? 'primary' : 'neutral'}
                disabled={disabled}
                onPress={() => onRate(rating)}
              />
            ))}
          </View>
        </View>
      ) : (
        <ClayButton label={t('lesson.speak.start')} icon="record" tone="danger" disabled={disabled} busy={recorder.busy} onPress={record} />
      )}

      {note ? <Text style={[styles.detail, { color: colors.textSecondary }]}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  detail: { fontSize: typography.sizes.text, textAlign: 'center' },
  recordingBox: { alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36 },
  bar: { width: 4, borderRadius: radii.pill },
  dur: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  track: { width: 160, height: 4, borderRadius: radii.pill, overflow: 'hidden' },
  used: { height: '100%', borderRadius: radii.pill },
  stop: { paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: radii.md },
  stopText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
});
