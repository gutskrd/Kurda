import { Share, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { ClayButton } from '../theme/glass';

/**
 * Hand a message to the system share sheet, with the address at the end of the text. Dismissing the sheet is a
 * choice, not a failure, so nothing is said either way.
 */
export function shareOut(text: string): void {
  void Share.share({ message: text }).catch(() => undefined);
}

/**
 * "Share" on a win: a finished lesson, a streak milestone, a badge, a good league week. Offered, never pushed:
 * one neutral pill beside the main action, with no reward and no repeat prompt. No haptic, as with the app's
 * other Share buttons (feedback/haptics.ts).
 */
export function ShareWin({ text, style, testID = 'share-win' }: { text: string; style?: StyleProp<ViewStyle>; testID?: string }): React.JSX.Element {
  const { t } = useI18n();
  return <ClayButton label={t('share.title')} icon="share" tone="neutral" onPress={() => shareOut(text)} style={[styles.own, style]} testID={testID} />;
}

const styles = StyleSheet.create({
  // Sized to its label: full width would compete with the main action beside it.
  own: { alignSelf: 'center' },
});
