import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { radii, spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../theme/Icon';
import { recordingRejection } from '../recording';
import type { Exercise } from '../types';
import { uploadRecording } from '../upload';
import { useRecorder } from '../useRecorder';
import { useI18n } from '../../i18n/I18nContext';

interface Props {
  exercise: Exercise;
  /** report the uploaded recording key (or null to clear the draft) */
  onSetAudioKey: (key: string | null) => void;
  /** learner denied mic permission → skip speaking course-wide */
  onDenyPermission: () => void;
  /** "can't do this now" defer */
  onSkip: () => void;
  disabled: boolean;
}

export function SpeakingExercise({ exercise, onSetAudioKey, onDenyPermission, onSkip, disabled }: Props) {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const recorder = useRecorder();
  const [status, setStatus] = useState<'idle' | 'uploading' | 'ready' | 'rejected' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const processed = useRef<unknown>(null);

  // mic denied → persist the course-wide skip and defer this one
  useEffect(() => {
    if (recorder.permission === 'denied') onDenyPermission();
  }, [recorder.permission, onDenyPermission]);

  // a fresh recording arrived → validate, then upload
  useEffect(() => {
    const r = recorder.result;
    if (!r || processed.current === r.blob) return;
    processed.current = r.blob;

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
  }, [recorder, client, onSetAudioKey]);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{t('lesson.speak.prompt')}</Text>
      {exercise.prompt ? <Text style={[styles.prompt, { color: colors.textPrimary }]}>{exercise.prompt}</Text> : null}

      {!recorder.supported ? (
        <Text style={[styles.detail, { color: colors.textSecondary }]}>{t('lesson.speak.unavailable')}</Text>
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
          <Icon name="check" size={14} color={colors.success} />
          <Text style={[styles.ready, { color: colors.success }]}>{t('lesson.speak.recorded')}</Text>
          <Pressable onPress={() => recorder.start()} disabled={disabled} style={[styles.reRecord, { borderColor: colors.primary }]}>
            <Text style={[styles.reRecordText, { color: colors.primary }]}>{t('lesson.speak.reRecord')}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => recorder.start()}
          disabled={disabled}
          style={[styles.record, { backgroundColor: colors.danger }, disabled && styles.dim]}
          accessibilityLabel={t('lesson.speak.start')}
        >
          <Icon name="record" size={14} color={colors.textOnPrimary} />
          <Text style={[styles.recordText, { color: colors.textOnPrimary }]}>{t('lesson.speak.start')}</Text>
        </Pressable>
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
  record: { paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center' },
  recordText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  recordingBox: { alignItems: 'center', gap: spacing.sm },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36 },
  bar: { width: 4, borderRadius: 2 },
  dur: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  stop: { paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: radii.md },
  stopText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  ready: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  reRecord: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radii.md, borderWidth: 2 },
  reRecordText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  skip: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText: { fontSize: typography.sizes.sm, textDecorationLine: 'underline' },
  dim: { opacity: 0.4 },
});
