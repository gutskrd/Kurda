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
 * The way out of a page: a disc at the top, on the side reading starts from.
 *
 * It is the same shape wherever there is a way out — the bar over a pushed
 * page (`ScreenHeader`), a page whose big title is part of it (Friends), the
 * sign-in forms — and it is where a thumb expects it without looking: the
 * first thing at the top, a whole fingertip across, floating a little off
 * the page like the actions opposite it.
 *
 * A chevron on a page that was pushed, an ✕ on one presented over what you
 * were doing. iOS makes the same distinction and so should we: the chevron
 * says "what is behind this is where you came from", the ✕ "this is on top
 * of what you were doing". In Soranî and Arabic the chevron points the other
 * way, which is the direction "back" is for a reader of those languages.
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
      accessibilityLabel={label ?? (kind === 'close' ? t('common.cancel') : t('common.back'))}
      testID="header-back"
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
  // a whole fingertip, and a circle
  button: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
