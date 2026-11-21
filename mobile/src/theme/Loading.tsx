import { ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from './ThemeProvider';

/**
 * Something is on its way: the platform spinner, centred in its width, always in the quiet grey skeletons use (the
 * ink is kept for what can be pressed) and always labelled ("Loading…", or `label`). For a waiting page, list or row;
 * a spinner replacing a button label or over a photo is drawn by that surface in its own ink.
 */
export function Loading({
  label,
  size = 'small',
  style,
}: {
  /** What screen readers hear instead of "Loading…". */
  label?: string;
  /** Large for a whole screen waiting on one thing. */
  size?: 'small' | 'large';
  /** Where it sits: the room above or round it. */
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return <ActivityIndicator size={size} color={colors.textSecondary} accessibilityLabel={label ?? t('common.loading')} style={style} />;
}
