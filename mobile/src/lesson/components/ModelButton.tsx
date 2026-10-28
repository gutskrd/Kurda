import { Pressable, StyleSheet } from 'react-native';
import { radii } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../theme/Icon';
import { useI18n } from '../../i18n/I18nContext';

/**
 * The native speaker's recording: the speaker alone in a round button, lit
 * while it plays, its name what it plays for anyone who cannot see it. For an
 * exercise whose recording has no character chosen to say it.
 */
export function ModelButton({ playing, onPress }: { playing: boolean; onPress: () => void }): React.JSX.Element {
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
  model: { alignSelf: 'center', width: 56, height: 56, borderRadius: radii.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
