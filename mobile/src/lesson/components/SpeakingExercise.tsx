import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { radii, spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { ClayButton } from '../../theme/glass';
import { Icon } from '../../theme/Icon';
import { recordingRejection } from '../recording';
import type { Exercise, SelfRating } from '../types';
import { uploadRecording } from '../upload';
import { useAudio } from '../useAudio';
import { useRecorder } from '../useRecorder';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/translations';

interface Props {
  exercise: Exercise;
  /** report the uploaded recording key (or null to clear the draft) */
  onSetAudioKey: (key: string | null) => void;
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

type BlobUrls = { createObjectURL?: (b: Blob) => string; revokeObjectURL?: (url: string) => void };
const blobUrls = (): BlobUrls | undefined => (globalThis as { URL?: BlobUrls }).URL;

/** A recording as something to play back: a blob URL where the platform has them. */
function blobUrl(blob: Blob | undefined): string | undefined {
  const urls = blobUrls();
  return blob && typeof urls?.createObjectURL === 'function' ? urls.createObjectURL(blob) : undefined;
}

/**
 * Speaking (KUR-036): record, hear your recording beside the native speaker,
 * and say how close it was — "Sounded right / Close / Try again". The server
 * cannot check a recording, so the learner's ear is the judge, and the rating
 * is what is submitted with it. Comparing your own attempt with a model is the
 * practice.
 *
 * A refused microphone used to switch speaking off for the whole course, with
 * no way to turn it back on. It now says so and offers to skip this one.
 */
export function SpeakingExercise({ exercise, onSetAudioKey, selfRating, onRate, onSkip, disabled }: Props) {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const recorder = useRecorder();
  const [status, setStatus] = useState<'idle' | 'uploading' | 'ready' | 'rejected' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const processed = useRef<unknown>(null);
  const own = useMemo(() => blobUrl(recorder.result?.blob), [recorder.result]);
  const ownAudio = useAudio(own);
  const model = useAudio(exercise.modelAudioUrl);
  useEffect(() => () => {
    if (own) blobUrls()?.revokeObjectURL?.(own);
  }, [own]);

  // a fresh recording arrived → validate, then upload
  useEffect(() => {
    const r = recorder.result;
    if (!r || processed.current === r.blob) return;
    processed.current = r.blob;
    onRate(null);

    const reject = recordingRejection({ durationMs: r.durationMs, byteSize: r.blob.size });
    if (reject) {
      setStatus('rejected');
      setMessage(t(reject));
      onSetAudioKey(null);
      recorder.reset();
      return;
    }
    setStatus('uploading');
    onSetAudioKey(null);
    void uploadRecording(client, r.blob, r.mimeType).then((key) => {
      if (key) {
        onSetAudioKey(key);
        setStatus('ready');
        setMessage(null);
      } else {
        setStatus('error');
        setMessage(t('lesson.speak.uploadFailed'));
      }
    });
  }, [recorder, client, onSetAudioKey, onRate, t]);

  const micOff = recorder.permission === 'denied';

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{t('lesson.speak.prompt')}</Text>
      {exercise.prompt ? <Text style={[styles.prompt, { color: colors.textPrimary }]}>{exercise.prompt}</Text> : null}

      {model.supported ? (
        <ClayButton label={t('lesson.speak.playModel')} icon="speaker" variant="outline" tone="primary" onPress={() => model.play(1)} />
      ) : null}

      {!recorder.supported ? (
        <Text style={[styles.detail, { color: colors.textSecondary }]}>{t('lesson.speak.unavailable')}</Text>
      ) : micOff ? (
        <Text style={[styles.detail, { color: colors.textSecondary }]}>{t('lesson.speak.micOff')}</Text>
      ) : recorder.recording ? (
        <View style={styles.recordingBox}>
          <View style={styles.waveform}>
            {[10, 20, 32, 18, 26, 14, 24].map((h, i) => (
              <View key={i} style={[styles.bar, { height: h, backgroundColor: colors.danger }]} />
            ))}
          </View>
          <Text style={[styles.dur, { color: colors.textPrimary }]}>{(recorder.durationMs / 1000).toFixed(1)}s</Text>
          <Pressable onPress={recorder.stop} style={[styles.stop, { backgroundColor: colors.textPrimary }]} accessibilityLabel={t('lesson.speak.stop')}>
            <Icon name="stop" size={14} color={colors.background} />
            <Text style={[styles.stopText, { color: colors.background }]}>{t('lesson.speak.stop')}</Text>
          </Pressable>
        </View>
      ) : status === 'uploading' ? (
        <View style={styles.recordingBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.detail, { color: colors.textSecondary }]}>{t('lesson.speak.uploading')}</Text>
        </View>
      ) : status === 'ready' ? (
        <View style={styles.recordingBox}>
          <View style={styles.row}>
            {ownAudio.supported ? (
              <ClayButton label={t('lesson.speak.playOwn')} icon="play" variant="outline" tone="primary" onPress={() => ownAudio.play(1)} />
            ) : null}
            <ClayButton label={t('lesson.speak.reRecord')} icon="record" variant="outline" disabled={disabled} onPress={() => recorder.start()} />
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
        <ClayButton
          label={t('lesson.speak.start')}
          icon="record"
          tone="danger"
          disabled={disabled}
          onPress={() => recorder.start()}
        />
      )}

      {message ? <Text style={[styles.detail, { color: colors.textSecondary }]}>{message}</Text> : null}

      <Pressable disabled={disabled} onPress={onSkip} style={styles.skip}>
        <Text style={[styles.skipText, { color: colors.textSecondary }]}>{t('lesson.speak.skip')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  label: { fontSize: typography.sizes.sm, textTransform: 'uppercase' },
  prompt: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  detail: { fontSize: typography.sizes.sm, textAlign: 'center' },
  recordingBox: { alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36 },
  bar: { width: 4, borderRadius: radii.pill },
  dur: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  stop: { paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: radii.md },
  stopText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  skip: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText: { fontSize: typography.sizes.sm, textDecorationLine: 'underline' },
});
