import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { DeerLoader } from './DeerLoader';

/** How big the deer is drawn: small for a row or list, large for a whole screen waiting on one thing. */
export const LOADING_SIZE = { small: 24, large: 48 } as const;

/**
 * Something is on its way: the deer curling into a ball (DeerLoader), centred in its width, in the ink and always
 * labelled ("Loading…", or `label`). For a waiting page, list or row; a spinner replacing a button label or over a
 * photo is drawn by that surface in its own ink.
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
  const { t } = useI18n();
  return (
    <View style={[styles.centre, style]} accessible accessibilityRole="progressbar" accessibilityLabel={label ?? t('common.loading')}>
      <DeerLoader size={LOADING_SIZE[size]} />
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
});
