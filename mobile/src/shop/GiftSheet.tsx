import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';
import type { Translate } from '../api/errors';
import { restrictionOf } from '../reports/sendErrors';
import { SendErrorNotice } from '../reports/SendError';
import { newGiftKey } from '../gifts/api';
import { giftErrorText } from '../gifts/GiftPickerSheet';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { giftItem } from './gifts';

interface Friend {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * Who to send it to (KUR-087).
 *
 * Friends only, which is the server's rule rather than this screen's — a gift
 * from a stranger is a way to put something in front of somebody who has not
 * agreed to hear from you.
 *
 * A Modal, not a positioned View: anything else inside the tab navigator draws
 * under the tab bar and lets taps through to it.
 */
export function GiftSheet({
  item,
  onClose,
  onSent,
}: {
  item: { sku: string; name: string; price: number; currency: string };
  onClose: () => void;
  /** `to`: the friend it went to (`name` as the list showed them) — the gift is in your chat with them now */
  onSent: (balance: number, to: { userId: string; username: string; name: string }) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();

  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // the refusal, and the friend it was about (some answers name them)
  const [error, setError] = useState<{ error: ApiError; name: string } | null>(null);
  // one key per friend chosen, kept until the server has answered: a retry
  // after a dropped connection must not send — and charge for — a second gift
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
      void giftItem(client, { sku: item.sku, toUserId: to.userId, expectedPrice: item.price, idempotencyKey: key }).then((res) => {
        setBusy(null);
        if (res.ok) {
          onSent(res.data.balance, { userId: to.userId, username: to.username, name });
          return;
        }
        // the server said no, so nothing was sent: the next try is a new one.
        // Offline or a server error may have sent it, so that key is kept.
        if (res.error.kind === 'client' || res.error.kind === 'rate_limited') keys.current.delete(to.userId);
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
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
      >
        {/* a tap inside the sheet must not reach the backdrop and close it */}
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.background }]}
          onPress={() => undefined}
        >
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('shop.giftTo', { name: item.name })}</Text>
          <Text style={[styles.note, { color: colors.textSecondary }]}>
            {t('shop.giftPaidByYou', { price: item.price, currency: item.currency })}
          </Text>

          {friends === null ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
          ) : friends.length === 0 ? (
            <Text style={[styles.note, { color: colors.textSecondary }]}>{t('shop.noFriendsToGift')}</Text>
          ) : (
            <>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('shop.searchFriends')}
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                style={[
                  styles.search,
                  { color: colors.textPrimary, backgroundColor: colors.controlTrack },
                ]}
              />
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
                {shown.map((f) => (
                  <Pressable
                    key={f.userId}
                    onPress={() => send(f)}
                    accessibilityRole="button"
                    accessibilityLabel={t('shop.sendItem', { name: item.name, to: f.username })}
                    style={styles.row}
                  >
                    <InitialsAvatar name={f.displayName || f.username} id={f.userId} size={34} photoUrl={f.avatarUrl} />
                    <Text style={[styles.who, { color: colors.textPrimary }]} numberOfLines={1}>
                      {f.displayName || f.username}
                    </Text>
                    {busy === f.userId ? <ActivityIndicator color={colors.primary} /> : null}
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          {error && restrictionOf(error.error) ? (
            // a limit on the account (a gift is a chat message): calm, what and
            // until when, and Account standing after this sheet has closed
            <SendErrorNotice error={error.error} onNavigate={onClose} />
          ) : error ? (
            <Text style={[styles.note, { color: colors.danger }]} accessibilityLiveRegion="polite">
              {shopGiftErrorText(error.error, error.name, t)}
            </Text>
          ) : null}

          <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * A refused Shop gift, in the reader's language. This route answers a friend
 * who cannot take it with a code of its own (where the chat's gift route
 * names them among the skipped), so those three are said here as the chat
 * says them; the rest as the chat's gift picker does.
 */
export function shopGiftErrorText(error: ApiError, name: string, t: Translate): string {
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
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold },
  note: { fontSize: typography.sizes.sm },
  search: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 44,
    fontSize: typography.sizes.md,
    marginTop: spacing.xs,
  },
  list: { marginTop: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,

  },
  who: { flex: 1, fontSize: typography.sizes.md },
  cancel: { alignItems: 'center', paddingVertical: spacing.md },
  cancelText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
});
