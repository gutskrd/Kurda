import { StyleSheet, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import { radii } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../theme/Icon';
import { useI18n } from '../../i18n/I18nContext';
import { pressedDim } from '../../theme/motion';
import { useValley } from '../ValleyScope';

/**
 * The lesson's round play mark: red with a cream play icon, becoming a sounding speaker ringed in gold while it
 * plays. Used in speech bubbles, listening clips and the native speaker's button. Only the look: whatever holds it
 * handles the press and the label.
 */
export function PlayDisc({ size, playing }: { size: number; playing: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const valley = useValley();
  return (
    <View
      style={[styles.disc, { width: size, height: size, backgroundColor: valley.red, borderColor: playing ? colors.gold : valley.red }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* The play and speaker icons point the same way in every language. */}
      <Icon name={playing ? 'speaker-high' : 'audio-play'} size={Math.round(size * (playing ? 0.5 : 0.42))} color={valley.onRed} />
    </View>
  );
}

/**
 * The native speaker's recording as a round play button, lit while playing and labelled with what it plays. For an
 * exercise whose recording has no character to say it.
 */
export function ModelButton({ playing, onPress }: { playing: boolean; onPress: () => void }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('lesson.speak.playModel')}
      style={({ pressed }) => [styles.model, { opacity: pressed ? pressedDim : 1 }]}
    >
      <PlayDisc size={56} playing={playing} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  model: { alignSelf: 'center' },
  disc: { borderRadius: radii.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
