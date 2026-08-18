import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { AudioPlayer } from './AudioPlayer';
import { clock } from './types';

/**
 * Record a voice note (KUR-282): request mic permission → record (auto-stops at
 * `maxSeconds`) → preview via the shared AudioPlayer → keep or re-record. Reports
 * the local file uri through `onChange` (null when cleared); the parent uploads it
 * via /media/voice. HIGH_QUALITY records .m4a (audio/mp4).
 */
export function VoiceRecorder({
  value,
  onChange,
  maxSeconds = 120,
}: {
  value: string | null;
  onChange: (uri: string | null) => void;
  maxSeconds?: number;
}): React.JSX.Element {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      onChange(recorder.uri ?? null);
    } catch {
      Alert.alert('Recording failed', 'Could not save the recording. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [recorder, onChange]);

  const start = useCallback(async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Microphone needed', 'Allow microphone access in Settings to record a voice note.');
      return;
    }
    setBusy(true);
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      Alert.alert('Recording failed', 'Could not start recording. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [recorder]);

  // auto-stop at the cap
  useEffect(() => {
    if (state.isRecording && state.durationMillis >= maxSeconds * 1000) void stop();
  }, [state.isRecording, state.durationMillis, maxSeconds, stop]);

  if (value) {
    return (
      <View style={styles.row}>
        <View style={styles.player}>
          <AudioPlayer url={value} />
        </View>
        <Pressable onPress={() => onChange(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove recording">
          <Text style={[styles.action, { color: colors.danger }]}>Remove</Text>
        </Pressable>
      </View>
    );
  }

  if (state.isRecording) {
    return (
      <Pressable
        onPress={() => void stop()}
        style={[styles.pill, { backgroundColor: colors.dangerFill, borderColor: colors.danger }]}
        accessibilityRole="button"
        accessibilityLabel="Stop recording"
      >
        <View style={[styles.dot, { backgroundColor: colors.danger }]} />
        <Text style={[styles.pillText, { color: colors.danger }]}>Recording {clock(state.durationMillis / 1000)} · tap to stop</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => void start()}
      disabled={busy}
      style={[styles.pill, { backgroundColor: colors.glassFill, borderColor: colors.glassBorder, opacity: busy ? 0.5 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel="Record a voice note"
    >
      <Text style={[styles.pillText, { color: colors.primary }]}>🎙 Record a voice note</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  player: { flex: 1 },
  action: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radii.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  pillText: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
