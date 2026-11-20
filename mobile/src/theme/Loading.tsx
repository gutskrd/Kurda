import { ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { ChaseLoader } from './ChaseLoader';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from './ThemeProvider';

/**
 * Something is on its way, always labelled ("Loading…", or `label`). A whole page waiting on one thing (`large`) gets
 * Hevalo galloping after his winged apple; a list or row gets the platform spinner, centred in its width, in the quiet
 * grey skeletons use (the ink is kept for what can be pressed). A spinner replacing a button label or over a photo is
 * drawn by that surface in its own ink.
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
  if (size === 'large') return <ChaseLoader label={label ?? t('common.loading')} style={style} />;
  return <ActivityIndicator size={size} color={colors.textSecondary} accessibilityLabel={label ?? t('common.loading')} style={style} />;
}
