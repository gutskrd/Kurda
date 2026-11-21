import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import type { ApiError } from '../api/types';
import type { Translate } from '../api/errors';
import { restrictionOf } from '../reports/sendErrors';
import { SendErrorNotice } from '../reports/SendError';
import { newGiftKey } from '../gifts/api';
import { giftErrorText } from '../gifts/GiftPickerSheet';
import { Avatar } from '../profile/Avatar';
import { spacing, typography } from '../theme/tokens';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { giftItem } from './gifts';
import { SearchField } from '../theme/SearchField';
import { Loading } from '../theme/Loading';
import { heldDim, heldRow } from '../theme/MotionParts';
import { useDirection } from '../reports/direction';

interface Friend {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * Who to send it to: friends only, which is the server's rule (a gift from a stranger would reach somebody who never
 * agreed to hear from you). The shared BottomSheet is a Modal, since anything else in the tab navigator draws under the
 * tab bar and lets taps through.
 */
export function GiftSheet({
  item,
  onClose,
  onSent,
}: {
  item: { sku: string; name: string; price: number; currency: string };
  onClose: () => void;
  /** `to`: the friend it went to (`name` as the list showed them); the gift is in your chat with them now. */
  onSent: (balance: number, to: { userId: string; username: string; name: string }) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  // Each friend's face on the side the language starts from, their name lined up after it.
  const dir = useDirection();

  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // The refusal, and the friend it was about (some answers name them).
  const [error, setError] = useState<{ error: ApiError; name: string } | null>(null);
  // One key per chosen friend, kept until the server has answered, so a retry after a dropped connection cannot send
  // (and charge for) a second gift.
  const keys = useRef(new Map<string, string>());

  useEffect(() => {
    let alive = true;
    void client.get<{ friends: Friend[] }>('/friends?limit=50').then((res) => {
      if (alive) setFriends(res.ok ? (res.data.friends ?? []) : []);
    });
    return () => {
      alive = false;
    };
  }, [client]);

  const send = useCallback(
    (to: Friend) => {
      if (busy) return;
      setBusy(to.userId);
      setError(null);
      const name = to.displayName || to.username;
      const key = keys.current.get(to.userId) ?? newGiftKey();
      keys.current.set(to.userId, key);
      haptic('tap');
      void giftItem(client, { sku: item.sku, toUserId: to.userId, expectedPrice: item.price, idempotencyKey: key }).then((res) => {
        setBusy(null);
        if (res.ok) {
          onSent(res.data.balance, { userId: to.userId, username: to.username, name });
          return;
        }
        // The server said no, so nothing was sent and the next try is a new one. Offline or a server error may have
        // sent it, so that key is kept.
        if (res.error.kind === 'client' || res.error.kind === 'rate_limited') keys.current.delete(to.userId);
        haptic('error');
        setError({ error: res.error, name });
      });
    },
    [busy, client, item, onSent],
  );

  const needle = query.trim().toLowerCase();
  const shown = (friends ?? []).filter(
    (f) => !needle || f.username.toLowerCase().includes(needle) || (f.displayName ?? '').toLowerCase().includes(needle),
  );

  return (
    <BottomSheet visible onClose={onClose} title={t('shop.giftTo', { name: item.name })}>
      <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>
        {t('shop.giftPaidByYou', { price: item.price, currency: item.currency })} {t('shop.giftFinal')}
      </Text>

      {friends === null ? (
        <Loading style={{ marginVertical: spacing.lg }} />
      ) : friends.length === 0 ? (
        <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('shop.noFriendsToGift')}</Text>
      ) : (
        <>
          <SearchField
            value={query}
            onChangeText={setQuery}
            label={t('shop.searchFriends')}
            returnKeyType="done"
            style={styles.search}
          />
          <SheetScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
            {shown.map((f) => (
              <Pressable
                key={f.userId}
                onPress={() => send(f)}
                accessibilityRole="button"
                // Each row names its friend, not only the item.
                accessibilityLabel={t('gift.picker.titleFor', { name: f.displayName || f.username })}
                style={({ pressed }) => [styles.row, { flexDirection: dir.row }, pressed && heldRow(colors.controlTrack)]}
              >
                <Avatar name={f.displayName || f.username} size={34} photoUrl={f.avatarUrl} />
                <Text style={[styles.who, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
                  {f.displayName || f.username}
                </Text>
                {busy === f.userId ? <Loading /> : null}
              </Pressable>
            ))}
          </SheetScrollView>
        </>
      )}

      {error && restrictionOf(error.error) ? (
        // A limit on the account (a gift is a chat message): calmly what and until when, with Account standing once
        // this sheet has closed.
        <SendErrorNotice error={error.error} onNavigate={onClose} style={styles.notice} />
      ) : error ? (
        <Text style={[styles.note, dir.text, { color: colors.danger }]} accessibilityLiveRegion="polite">
          {shopGiftErrorText(error.error, error.name, t)}
        </Text>
      ) : null}

      <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => [styles.cancel, pressed && heldDim]}>
        <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
      </Pressable>
    </BottomSheet>
  );
}

/**
 * A refused Shop gift in the reader's language. This route answers a friend who cannot take it with codes of its own,
 * so those three are worded as the chat words them; the rest as the chat's gift picker does.
 */
function shopGiftErrorText(error: ApiError, name: string, t: Translate): string {
  switch (error.code) {
    case 'ALREADY_OWNED':
      return t('gift.skipped.alreadyOwned', { name });
    case 'GIFT_NOT_ALLOWED':
      return t('gift.skipped.notAllowed', { name });
    case 'GIFT_DAILY_LIMIT':
      return t('gift.skipped.dailyLimit', { name });
    case 'PRICE_CHANGED':
      return t('shop.priceChangedBody');
    default:
      return giftErrorText(error, t);
  }
}

const styles = StyleSheet.create({
  note: { fontSize: typography.sizes.text },
  // Lined up with the search field and the list, inside the sheet's own padding.
  notice: { marginHorizontal: 0, marginBottom: 0 },
  search: { marginTop: spacing.xs },
  list: { marginTop: spacing.xs },
  row: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  who: { flex: 1, fontSize: typography.sizes.text },
  cancel: { alignItems: 'center', paddingVertical: spacing.md },
  cancelText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
});
