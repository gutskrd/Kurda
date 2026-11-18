import { StyleSheet, View } from 'react-native';
import { CalmFrame, CalmLine, Greetings } from '../groups/Welcome';
import { useI18n } from '../i18n/I18nContext';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { spacing } from '../theme/tokens';

/**
 * A conversation nobody has written in yet: who it is with, and three suggested first messages in Kurdish one tap
 * away, as a group's start offers (groups/Welcome.tsx).
 */
export function DmWelcome({
  userId,
  name,
  photoUrl,
  onGreet,
}: {
  userId: string;
  name: string;
  photoUrl?: string | null;
  /** Sends a greeting as the reader's first message. */
  onGreet: (greeting: string) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <View style={styles.centred}>
      <CalmFrame name={name} picture={(size) => <InitialsAvatar name={name} id={userId} size={size} photoUrl={photoUrl} />}>
        <CalmLine>{t('chat.welcome.start', { name })}</CalmLine>
        <Greetings hint={t('chat.welcome.greetHint')} onGreet={onGreet} />
      </CalmFrame>
    </View>
  );
}

const styles = StyleSheet.create({
  // A card in the middle of what the chat would fill.
  centred: { flexGrow: 1, justifyContent: 'center', padding: spacing.md },
});
