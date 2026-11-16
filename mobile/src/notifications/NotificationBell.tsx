import { useNavigation } from '@react-navigation/native';
import type { RootNavigation } from '../navigation/rootStack';
import { HeaderButton } from '../navigation/HeaderButton';
import { useUnread } from '../messages/unread';
import { useI18n } from '../i18n/I18nContext';

/**
 * The bell beside search at the top of every tab, and the way into the
 * notification list.
 *
 * Likes, comments, gifts, invites, badges and notices from Hevalo used to sit
 * in the Inbox tab between friend requests and conversations — three kinds of
 * thing in one list, so the conversation you were looking for was under a
 * morning of likes. They are their own list again, behind a bell, with a dot
 * while any are unread. A dot rather than a number on purpose: a count of
 * likes is the kind of number that asks to be checked, and this should only
 * ever say "something is new".
 *
 * When something arrives while the bell is in sight it swings once, as a
 * bell that has been rung does, and is still again: the dot says "since you
 * last looked", and the swing says "just now".
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
      // one swing as something arrives, while the bell is in sight
      ring={unread}
      label={unread > 0 ? t('notifications.unreadLabel', { count: unread }) : t('notifications.title')}
      onPress={() => navigation.navigate('NotificationCenter')}
      testID="top-bell"
    />
  );
}
