import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { clock } from './types';

/**
 * Inline player for a post's audio rendition (KUR-284, "listen"). Streams a remote
 * URL via expo-audio; a play/pause control, a progress bar, and elapsed/total time.
 * Rendered only when a post has audio, so the hooks always run while mounted.
 */
export function AudioPlayer({ url }: { url: string }): React.JSX.Element {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const { colors } = useTheme();

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
    <View style={[styles.bar, { backgroundColor: colors.glassFill, borderColor: colors.glassBorder }]}>
      <Pressable
        onPress={toggle}
        style={[styles.button, { backgroundColor: colors.primaryStrong }]}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause narration' : 'Play narration'}
        hitSlop={8}
      >
        <Text style={[styles.symbol, { color: colors.textOnPrimary }]}>{status.playing ? '❚❚' : '▶'}</Text>
      </Pressable>
      <View style={styles.track}>
        <View style={[styles.trackBg, { backgroundColor: colors.controlTrack }]}>
          <View style={[styles.trackFill, { backgroundColor: colors.primary, width: `${progress * 100}%` }]} />
        </View>
        <Text style={[styles.time, { color: colors.textSecondary }]}>
          {status.isLoaded ? `${clock(status.currentTime)} / ${clock(status.duration)}` : 'Loading…'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radii.lg, padding: spacing.sm },
  button: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  symbol: { fontSize: 16, fontWeight: typography.weights.bold },
  track: { flex: 1, gap: 4 },
  trackBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: 3 },
  time: { fontSize: typography.sizes.xs },
});
