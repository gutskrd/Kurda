import { useEffect, useRef, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { listFriends, type FriendSummary } from '../play/api';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useDirection } from '../reports/direction';
import { SendErrorNotice } from '../reports/SendError';
import { Sheet } from '../stories/ui';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { SearchField } from '../theme/SearchField';
import { Skeleton } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { postUrl } from './api';
import type { FeedItem } from './types';

/** Past this many friends a search field leads the list, as on the website. */
const SEARCH_FROM = 6;
/** Long enough to read who it went to before the sheet closes. */
const SENT_MS = 1200;

/** One line of the post to carry with its link. */
function shareText(item: FeedItem): string {
  return item.title?.trim() || item.excerpt?.trim()?.slice(0, 120) || '';
}

/**
 * Passing a post on, as the website's share does: the system share sheet, copying the link, or sending it to a friend
 * as a chat message. Sending says who it went to at once and closes; a message the server did not take brings the
 * friends back with why. A guest has no friends to send to and sees only the first two.
 */
export function SharePostSheet({ item, onClose }: { item: FeedItem; onClose: () => void }): React.JSX.Element {
  const { client, isGuest } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const url = postUrl(item);
  const line = shareText(item);
  const [copied, setCopied] = useState(false);
  const [friends, setFriends] = useState<FriendSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [failed, setFailed] = useState<ApiError | null>(null);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (isGuest) return;
    let live = true;
    void listFriends(client).then((res) => {
      if (live) setFriends(res.ok ? res.data.friends : []);
    });
    return () => {
      live = false;
    };
  }, [client, isGuest]);

  const shareOut = async (): Promise<void> => {
    try {
      const result = await Share.share({ message: line ? `${line}\n${url}` : url, url });
      if (result.action === Share.sharedAction) onClose();
    } catch {
      // The sheet was dismissed or the platform refused it; nothing was shared.
    }
  };

  const copy = async (): Promise<void> => {
    await Clipboard.setStringAsync(url);
    haptic('tap');
    setCopied(true);
    timers.current.push(setTimeout(() => setCopied(false), 2000));
  };

  const send = async (friend: FriendSummary): Promise<void> => {
    setFailed(null);
    setSentTo(friend.username);
    haptic('tap');
    const shown = Date.now();
    const res = await client.post(`/chat/${friend.userId}/messages`, { body: line ? `${line}\n${url}` : url });
    if (!res.ok) {
      setSentTo(null);
      setFailed(res.error);
      haptic('error');
      return;
    }
    timers.current.push(setTimeout(onClose, Math.max(0, SENT_MS - (Date.now() - shown))));
  };

  const wanted = query.trim().toLowerCase();
  const shown = (friends ?? []).filter((f) => f.username.toLowerCase().includes(wanted));
  const searchable = (friends?.length ?? 0) > SEARCH_FROM;

  return (
    <Sheet title={t('share.title')} onClose={onClose}>
      <View style={styles.ways}>
        <ClayButton label={t('share.shareOut')} icon="share" tone="primary" onPress={() => void shareOut()} />
        <ClayButton label={copied ? t('share.copied') : t('share.copy')} icon={copied ? 'check' : 'link'} variant="outline" onPress={() => void copy()} />
      </View>

      {isGuest ? null : (
        <View style={styles.friends}>
          <Text style={[styles.divider, { color: colors.textSecondary }]}>{t('share.orSendHere')}</Text>
          {sentTo ? (
            <Text style={[styles.sent, dir.text, { color: colors.success }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
              {t('share.sentTo', { name: sentTo })}
            </Text>
          ) : friends === null ? (
            <View accessibilityLabel={t('common.loading')}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.friend, { flexDirection: dir.row }]}>
                  <Skeleton width={FACE} height={FACE} radius={radii.pill} />
                  <Skeleton width="50%" height={14} radius={radii.xs} />
                </View>
              ))}
            </View>
          ) : friends.length === 0 ? (
            <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('share.noFriendsYet')}</Text>
          ) : (
            <>
              {searchable ? <SearchField value={query} onChangeText={setQuery} label={t('share.searchFriends')} placeholder={t('share.searchFriends')} /> : null}
              <SendErrorNotice error={failed} onDismiss={() => setFailed(null)} onNavigate={onClose} style={styles.error} />
              {shown.map((f) => (
                <PressableScale
                  key={f.userId}
                  onPress={() => void send(f)}
                  accessibilityRole="button"
                  accessibilityLabel={t('rail.messageWho', { name: f.displayName ?? f.username })}
                  style={[styles.friend, { flexDirection: dir.row }]}
                >
                  <InitialsAvatar name={f.username} id={f.userId} size={FACE} photoUrl={f.avatarUrl} />
                  <Text style={[styles.name, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
                    {f.username}
                  </Text>
                  <Icon name="send" size={18} color={colors.textSecondary} style={dir.flip} />
                </PressableScale>
              ))}
            </>
          )}
        </View>
      )}
    </Sheet>
  );
}

const FACE = 36;

const styles = StyleSheet.create({
  ways: { gap: spacing.sm },
  friends: { gap: spacing.xs, marginTop: spacing.md },
  divider: { fontSize: typography.sizes.sm, textAlign: 'center', marginBottom: spacing.xs },
  sent: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, paddingVertical: spacing.md, textAlign: 'center' },
  note: { fontSize: typography.sizes.sm, lineHeight: 20, textAlign: 'center' },
  error: { marginHorizontal: 0 },
  friend: { alignItems: 'center', gap: spacing.md - 4, minHeight: FACE + spacing.md, paddingVertical: spacing.xs },
  name: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
});
