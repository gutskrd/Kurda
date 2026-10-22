import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

interface Props {
  exercise: Exercise;
  /** report whether there is a take to rate (it stays on the device) */
  onSetRecorded: (recorded: boolean) => void;
  /** the learner's own rating of the recording, once they have given one */
  selfRating: SelfRating | null;
  onRate: (rating: SelfRating | null) => void;
  /** "can't do this now" defer */
  onSkip: () => void;
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
 * Speaking (KUR-036): record, hear your recording beside the native speaker,
 * and say how close it was — "Sounded right / Close / Try again". The server
 * cannot check a recording, so the learner's ear is the judge, and the rating
 * is what is submitted. The take itself never leaves the phone: nothing on the
 * server would listen to it, and a stored copy of every learner's voice was
 * data kept for no use. Comparing your own attempt with a model is the
 * practice.
 *
 * The microphone is asked for at the first press of record, not before. A
 * refused one used to switch speaking off for the whole course, with no way
 * to turn it back on; it now says so, offers the phone's settings where it
 * can be allowed again, and the skip below puts this one off without a
 * mistake.
 */
export function SpeakingExercise({ exercise, onSetRecorded, selfRating, onRate, onSkip, disabled }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const recorder = useRecorder();
  const [status, setStatus] = useState<'idle' | 'ready' | 'rejected'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const processed = useRef<Take | null>(null);
  // the learner's own press ended the take, rather than its time running out or the app leaving the front
  const stoppedByHand = useRef(false);
  const ownAudio = useAudio(recorder.result?.uri || undefined);
  const model = useAudio(exercise.modelAudioUrl);
  const dir = useDirection();
  // who says the native model, when an editor has chosen somebody
  const voice = knownVoice(exercise.modelAudioVoice);

  // a fresh recording arrived → validate it, then it is ready to rate
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
    // a take kept is something taken, felt as the learner's Stop lands; one
    // that stopped by itself is not a buzz anybody asked for
    if (byHand) haptic('tap');
  }, [result, reset, onSetRecorded, onRate, t]);

  // a take that could not be started or kept is in the learner's way
  useEffect(() => {
    if (recorder.failed) haptic('error');
  }, [recorder.failed]);

  const record = (): void => {
    // whatever was on screen was about the take this one replaces
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
  // how much of a take's time has gone; it stops by itself at the end
  const used = Math.min(1, recorder.durationMs / MAX_TAKE_MS);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{t('lesson.speak.prompt')}</Text>
      {exercise.prompt ? <Text style={[styles.prompt, { color: colors.textPrimary }]}>{exercise.prompt}</Text> : null}

      {model.supported && voice ? (
        // head to waist on its stage, saying the sentence; a tap on it says it again too
        <CharacterStage
          key={exercise.id}
          speaker={voice.speaker}
          voice={voice}
          text={exercise.prompt}
          player={model.clock}
          playing={model.playing}
          source={exercise.modelAudioUrl}
          onPress={() => model.play(1)}
          // pleased when the learner says they said it well; their own judgement of a near miss is theirs to make
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
          <Pressable onPress={finish} style={[styles.stop, { backgroundColor: colors.textPrimary }]} accessibilityRole="button" accessibilityLabel={t('lesson.speak.stop')}>
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

      <Pressable disabled={disabled} onPress={onSkip} style={styles.skip} accessibilityRole="button" accessibilityState={{ disabled }}>
        <Text style={[styles.skipText, { color: colors.textSecondary }]}>{t('lesson.speak.skip')}</Text>
      </Pressable>
    </View>
  );
}

/**
 * The native speaker's recording: the speaker alone in a round button, lit
 * while it plays, its name what it plays for anyone who cannot see it.
 */
function ModelButton({ playing, onPress }: { playing: boolean; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('lesson.speak.playModel')}
      style={({ pressed }) => [
        styles.model,
        { backgroundColor: colors.controlTrack, borderColor: playing ? colors.gold : 'transparent', opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {/* the speaker points the same way in every language */}
      <Icon name="speaker" size={24} color={playing ? colors.goldText : colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  model: { alignSelf: 'center', width: 56, height: 56, borderRadius: 28, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  container: { gap: spacing.md },
  label: { fontSize: typography.sizes.sm, textTransform: 'uppercase' },
  prompt: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  detail: { fontSize: typography.sizes.sm, textAlign: 'center' },
  recordingBox: { alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36 },
  bar: { width: 4, borderRadius: radii.pill },
  dur: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  track: { width: 160, height: 4, borderRadius: radii.pill, overflow: 'hidden' },
  used: { height: '100%', borderRadius: radii.pill },
  stop: { paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: radii.md },
  stopText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  skip: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText: { fontSize: typography.sizes.sm, textDecorationLine: 'underline' },
});
