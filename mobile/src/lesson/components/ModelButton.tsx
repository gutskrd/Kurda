import { StyleSheet, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import { radii } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../theme/Icon';
import { useI18n } from '../../i18n/I18nContext';
import { pressedDim } from '../../theme/motion';
import { useValley } from '../ValleyScope';

/**
 * The lesson's round play mark: the pomegranate's red with a play mark in
 * cream, which turns to a sounding speaker ringed in the sun's gold while it
 * plays — in a speech bubble, on a listening clip, and alone as the native
 * speaker's button. Only the look: whatever holds it is what is pressed and
 * what a screen reader names.
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
      {/* a play mark, and the speaker sounding while it plays: both point the same way in every language */}
      <Icon name={playing ? 'speaker-high' : 'audio-play'} size={Math.round(size * (playing ? 0.5 : 0.42))} color={valley.onRed} />
    </View>
  );
}

/**
 * The native speaker's recording: the play mark alone in a round button, lit
 * while it plays, its name what it plays for anyone who cannot see it. For an
 * exercise whose recording has no character chosen to say it.
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
