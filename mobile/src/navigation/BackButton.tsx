import { Pressable, StyleSheet } from 'react-native';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';

/**
 * The way out of a screen with a big title.
 *
 * `ScreenHeader` has a back control of its own and most pushed screens wear
 * that. A handful keep a `LargeTitle` instead — Friends, because its title is
 * part of the page rather than a bar over it — and those need the same
 * control in the leading slot.
 */
export function BackButton({ onPress }: { onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  // "back" points right for a reader of a right-to-left language
  const flip = useDirection().flip;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      hitSlop={10}
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}
    >
      <Icon name="chevron-left" size={22} color={colors.textPrimary} style={flip ?? undefined} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
