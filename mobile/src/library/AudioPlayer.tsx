import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { StyleSheet, Text, View } from 'react-native';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { clock } from './types';

/**
 * Inline player for a post's audio narration: streams a remote URL with expo-audio, with play/pause, a progress
 * bar and elapsed/total time. Rendered only when a post has audio, so its hooks always run while mounted.
 */
export function AudioPlayer({ url }: { url: string }): React.JSX.Element {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const { colors } = useTheme();
  const { t } = useI18n();

  const finished = status.duration > 0 && status.currentTime >= status.duration - 0.25;
  const toggle = () => {
    if (status.playing) {
      player.pause();
    } else {
      if (finished) void player.seekTo(0);
      player.play();
    }
  };

  const progress = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;

  return (
    <View style={[styles.bar, { backgroundColor: colors.glassFill }]}>
      <PressableScale
        onPress={toggle}
        style={[styles.button, { backgroundColor: colors.primary }]}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? t('recorder.pause') : t('recorder.play')}
        hitSlop={8}
      >
        {/* The player's own glyphs, as the story reader draws them. */}
        <Icon name={status.playing ? 'audio-pause' : 'audio-play'} size={20} color={colors.textOnPrimary} />
      </PressableScale>
      <View style={styles.track}>
        <View style={[styles.trackBg, { backgroundColor: colors.controlTrack }]}>
          <View style={[styles.trackFill, { backgroundColor: colors.primary, width: `${progress * 100}%` }]} />
        </View>
        <Text style={[styles.time, { color: colors.textSecondary }]}>
          {status.isLoaded ? `${clock(status.currentTime)} / ${clock(status.duration)}` : t('common.loading')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.lg, padding: spacing.sm },
  button: { width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  track: { flex: 1, gap: 4 },
  trackBg: { height: 6, borderRadius: radii.pill, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: radii.pill },
  time: { fontSize: typography.sizes.text },
});
