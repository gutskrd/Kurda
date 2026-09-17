import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { radii, spacing, typography } from '../theme/tokens';
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
  onSent: (balance: number, to: string) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();

  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      void giftItem(client, {
        sku: item.sku,
        toUserId: to.userId,
        expectedPrice: item.price,
        // one key per attempt, so a second tap or a retry after a dropped
        // connection cannot send — and charge for — a second gift
        idempotencyKey: `gift-${item.sku}-${to.userId}-${Date.now()}`,
      }).then((res) => {
        setBusy(null);
        if (res.ok) onSent(res.data.balance, to.username);
        else setError(describeError(res.error, t));
      });
    },
    [busy, client, item, onSent, t],
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
          style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.glassBorder }]}
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
                  { color: colors.textPrimary, backgroundColor: colors.controlTrack, borderColor: colors.glassBorder },
                ]}
              />
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
                {shown.map((f) => (
                  <Pressable
                    key={f.userId}
                    onPress={() => send(f)}
                    accessibilityRole="button"
                    accessibilityLabel={t('shop.sendItem', { name: item.name, to: f.username })}
                    style={[styles.row, { borderColor: colors.glassBorder }]}
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

          {error ? <Text style={[styles.note, { color: colors.danger }]}>{error}</Text> : null}

          <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold },
  note: { fontSize: typography.sizes.sm },
  search: {
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  who: { flex: 1, fontSize: typography.sizes.md },
  cancel: { alignItems: 'center', paddingVertical: spacing.md },
  cancelText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
});
