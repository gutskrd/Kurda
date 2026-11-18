import { StyleSheet } from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { floating } from '../theme/floating';

/**
 * The way out of a page: a disc at the top, on the side reading starts from. A chevron on a pushed page, an ✕ on one
 * presented over the app; the chevron points the other way in right-to-left languages.
 *
 * It reaches a fingertip past its edge on every side (`reach="open"`), since leaving a page should never take a second
 * try. A pressable neighbour (a conversation's name) shares the gap through their group.
 */
export function BackButton({
  onPress,
  kind = 'back',
  label,
}: {
  onPress: () => void;
  kind?: 'back' | 'close';
  /** What a screen reader calls it, where "Back" is vaguer than it needs to be. */
  label?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const flip = useDirection().flip;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      // An ✕ closes the page and cancels nothing, so it says "Close".
      accessibilityLabel={label ?? (kind === 'close' ? t('common.close') : t('common.back'))}
      testID="header-back"
      reach="open"
      style={[styles.button, floating.control, { backgroundColor: colors.barFill, shadowColor: colors.softShadow }]}
    >
      {kind === 'close' ? (
        <Icon name="close" size={20} color={colors.textPrimary} />
      ) : (
        <Icon name="chevron-left" size={22} color={colors.textPrimary} style={flip ?? undefined} />
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
