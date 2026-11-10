import { ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from './ThemeProvider';

/**
 * Something is on its way: the platform's spinner, centred in the width it
 * is given.
 *
 * One of these, rather than a spinner written out on each screen, because
 * written out it was not the same thing twice: in the brand's ink on most
 * screens and in the grey of a caption on others, and nameless to a screen
 * reader on all but a few. This one is always the quiet grey, the tone the
 * skeletons and the platform's own spinner wait in (waiting is not an action,
 * and the ink is kept for what can be pressed), and it always says what it
 * is: "Loading…", or `label` where something more exact is true.
 *
 * It is for a page, a list or a row that is waiting. A spinner standing in
 * for the label of a button, or over a photo, is drawn in that surface's own
 * ink by the button or the photo itself.
 */
export function Loading({
  label,
  size = 'small',
  style,
}: {
  /** what a screen reader is told instead of "Loading…" */
  label?: string;
  /** large for a whole screen that is waiting on one thing */
  size?: 'small' | 'large';
  /** where it sits: the room above it, or round it */
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return <ActivityIndicator size={size} color={colors.textSecondary} accessibilityLabel={label ?? t('common.loading')} style={style} />;
}
