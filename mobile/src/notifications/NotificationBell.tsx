import { useNavigation } from '@react-navigation/native';
import type { RootNavigation } from '../navigation/rootStack';
import { HeaderButton } from '../navigation/HeaderButton';
import { useUnread } from '../messages/unread';
import { useI18n } from '../i18n/I18nContext';

/**
 * The bell beside search at the top of every tab, the way into the notification list. It shows a dot while any are
 * unread, not a count: a count of likes asks to be checked, and this should only say "something is new". When something
 * arrives while it is in sight it swings once, like a rung bell: the dot says "since you last looked", the swing "just
 * now".
 */
export function NotificationBell(): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  const { counts } = useUnread();
  const unread = counts.notifications;
  return (
    <HeaderButton
      icon="bell"
      dot={unread > 0}
      // One swing as something arrives, while the bell is in sight.
      ring={unread}
      label={unread > 0 ? t('notifications.unreadLabel', { count: unread }) : t('notifications.title')}
      onPress={() => navigation.navigate('NotificationCenter')}
      testID="top-bell"
    />
  );
}
