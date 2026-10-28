import { useCallback } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../theme/Icon';
import { AudioPlayer } from './AudioPlayer';
import { clock } from './types';
import { useI18n } from '../i18n/I18nContext';
import { useMicRecorder, type MicTake } from '../recording/useMicRecorder';

/**
 * Record a voice note (KUR-282): request mic permission → record (auto-stops at
 * `maxSeconds`, or when the app leaves the front) → preview via the shared
 * AudioPlayer → keep or re-record. Reports the local file uri through
 * `onChange` (null when cleared); the parent uploads it via /media/voice. The
 * microphone itself is useMicRecorder, which a speaking exercise records with
 * too.
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
  const { colors } = useTheme();
  const { t } = useI18n();

  const keep = useCallback(
    (take: MicTake | null) => {
      if (take) onChange(take.uri);
      else Alert.alert(t('recorder.failed'), t('recorder.couldNotSave'));
    },
    [onChange, t],
  );
  const mic = useMicRecorder({ maxMs: maxSeconds * 1000, onStop: keep });
  const { start: begin } = mic;

  const start = useCallback(async () => {
    const outcome = await begin();
    if (outcome === 'denied') Alert.alert(t('recorder.micNeeded'), t('recorder.micHelp'));
    else if (outcome === 'failed') Alert.alert(t('recorder.failed'), t('recorder.couldNotStart'));
  }, [begin, t]);

  if (value) {
    return (
      <View style={styles.row}>
        <View style={styles.player}>
          <AudioPlayer url={value} />
        </View>
        <Pressable onPress={() => onChange(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('recorder.remove')}>
          <Text style={[styles.action, { color: colors.danger }]}>{t('common.remove')}</Text>
        </Pressable>
      </View>
    );
  }

  if (mic.recording) {
    return (
      <PressableScale
        onPress={() => void mic.stop()}
        style={[styles.pill, { backgroundColor: colors.dangerFill, borderColor: colors.danger }]}
        accessibilityRole="button"
        accessibilityLabel={t('lesson.speak.stop')}
      >
        <View style={[styles.dot, { backgroundColor: colors.danger }]} />
        <Text style={[styles.pillText, { color: colors.danger }]}>
          {t('recorder.recording', { time: clock(mic.durationMs / 1000) })}
        </Text>
      </PressableScale>
    );
  }

  return (
    <PressableScale
      onPress={() => void start()}
      disabled={mic.busy}
      style={[styles.pill, { backgroundColor: colors.glassFill, opacity: mic.busy ? 0.5 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={t('recorder.startNote')}
    >
      <Icon name="microphone" size={16} color={colors.primary} />
      <Text style={[styles.pillText, { color: colors.primary }]}>{t('recorder.startNote')}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  player: { flex: 1 },
  action: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radii.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  pillText: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  dot: { width: 10, height: 10, borderRadius: radii.pill },
});
