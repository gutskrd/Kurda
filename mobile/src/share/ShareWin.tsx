import { Share, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { ClayButton } from '../theme/glass';

/**
 * Hand a message to whatever the phone shares with: the system sheet, where
 * the messaging app somebody already uses is. The whole message is the text,
 * its address last. Putting the sheet away is a choice, not a failure, and
 * there is nothing to say after it either way.
 */
export function shareOut(text: string): void {
  void Share.share({ message: text }).catch(() => undefined);
}

/**
 * "Share", on a moment worth showing somebody: a lesson finished, a streak's
 * big day, a badge, a league week that went well.
 *
 * It is offered and never pushed. One quiet button, the neutral pill at its
 * own width, beside the way on, which stays the main thing on the screen; it
 * holds nothing back, earns nothing, counts nothing, and is not asked a
 * second time. It is not felt in the hand: like the app's other Share
 * buttons it only opens the system's sheet, and a buzz is kept for something
 * that happened (feedback/haptics.ts).
 */
export function ShareWin({ text, style, testID = 'share-win' }: { text: string; style?: StyleProp<ViewStyle>; testID?: string }): React.JSX.Element {
  const { t } = useI18n();
  return <ClayButton label={t('share.title')} icon="share" tone="neutral" onPress={() => shareOut(text)} style={[styles.own, style]} testID={testID} />;
}

const styles = StyleSheet.create({
  // as wide as its words, in the middle: a full-width button here would stand beside the way on as its equal
  own: { alignSelf: 'center' },
});
