import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import { recordingRejection } from '../recording';
import type { Exercise } from '../types';
import { uploadRecording } from '../upload';
import { useRecorder } from '../useRecorder';

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
      setMessage(reject);
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
        setMessage('Upload failed — please try again.');
      }
    });
  }, [recorder, client, onSetAudioKey]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Say it aloud</Text>
      {exercise.prompt ? <Text style={styles.prompt}>{exercise.prompt}</Text> : null}

      {!recorder.supported ? (
        <Text style={styles.detail}>Recording isn’t available on this device.</Text>
      ) : recorder.recording ? (
        <View style={styles.recordingBox}>
          <View style={styles.waveform}>
            {[10, 20, 32, 18, 26, 14, 24].map((h, i) => (
              <View key={i} style={[styles.bar, { height: h }]} />
            ))}
          </View>
          <Text style={styles.dur}>{(recorder.durationMs / 1000).toFixed(1)}s</Text>
          <Pressable onPress={recorder.stop} style={styles.stop} accessibilityLabel="Stop recording">
            <Text style={styles.stopText}>■ Stop</Text>
          </Pressable>
        </View>
      ) : status === 'uploading' ? (
        <View style={styles.recordingBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.detail}>Uploading…</Text>
        </View>
      ) : status === 'ready' ? (
        <View style={styles.recordingBox}>
          <Text style={styles.ready}>✓ Recorded</Text>
          <Pressable onPress={() => recorder.start()} disabled={disabled} style={styles.reRecord}>
            <Text style={styles.reRecordText}>Re-record</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => recorder.start()}
          disabled={disabled}
          style={[styles.record, disabled && styles.dim]}
          accessibilityLabel="Start recording"
        >
          <Text style={styles.recordText}>● Record</Text>
        </Pressable>
      )}

      {message ? <Text style={styles.detail}>{message}</Text> : null}

      <Pressable disabled={disabled} onPress={onSkip} style={styles.skip}>
        <Text style={styles.skipText}>Can’t do this now — skip</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  label: { fontSize: typography.sizes.sm, color: colors.textSecondary, textTransform: 'uppercase' },
  prompt: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary },
  detail: { fontSize: typography.sizes.sm, color: colors.textSecondary, textAlign: 'center' },
  record: { backgroundColor: colors.danger, paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center' },
  recordText: { color: colors.textOnPrimary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  recordingBox: { alignItems: 'center', gap: spacing.sm },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36 },
  bar: { width: 4, borderRadius: 2, backgroundColor: colors.danger },
  dur: { fontSize: typography.sizes.md, color: colors.textPrimary, fontWeight: typography.weights.bold },
  stop: { backgroundColor: colors.textPrimary, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: radii.md },
  stopText: { color: colors.textOnPrimary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  ready: { fontSize: typography.sizes.lg, color: colors.success, fontWeight: typography.weights.bold },
  reRecord: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radii.md, borderWidth: 2, borderColor: colors.primary },
  reRecordText: { color: colors.primary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  skip: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText: { color: colors.textSecondary, fontSize: typography.sizes.sm, textDecorationLine: 'underline' },
  dim: { opacity: 0.4 },
});
