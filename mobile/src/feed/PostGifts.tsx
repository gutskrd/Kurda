import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { giftSenderName, postGiftsLine, type GiftTier, type PostGifts, type PostGiftSender } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { formatCompact, formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { Avatar } from '../profile/Avatar';
import { useDirection } from '../reports/direction';
import { ItemArt } from '../shop/ItemFilters';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { Pressable } from '../theme/Pressable';
import { pressedDim } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import { layout, spacing, typography } from '../theme/tokens';
import { postGifts, type PostTarget } from '../gifts/api';
import { GiftPickerSheet } from '../gifts/GiftPickerSheet';
import { GiftSendAnimation } from '../gifts/GiftSendAnimation';
import type { FeedItem } from './types';

/** No gifts yet: what a post from an older server, or a new one, holds. */
const NONE: PostGifts = { count: 0, items: [], senders: 0, from: null };

/** A post as the gift routes name it. */
export function postTarget(item: Pick<FeedItem, 'targetType' | 'id'>): PostTarget {
  return { type: item.targetType, id: item.id };
}

/**
 * A post's gifts and the sheet that gives one, kept together so a gift given here shows on the post at once. `gifts`
 * starts from the wall's own row and is read again after a send.
 */
export function usePostGifts(item: FeedItem): {
  gifts: PostGifts;
  giving: boolean;
  give: () => void;
  sheet: React.JSX.Element;
} {
  const { client } = useAuth();
  const { t } = useI18n();
  const [gifts, setGifts] = useState<PostGifts>(item.gifts ?? NONE);
  const [giving, setGiving] = useState(false);
  const [flying, setFlying] = useState<{ tier: GiftTier; item: { sku: string; assetUrl: string | null }; key: number } | null>(null);
  useEffect(() => setGifts(item.gifts ?? NONE), [item.gifts]);
  const authorName = item.author.displayName || item.author.username;
  const sheet = (
    <>
      <GiftPickerSheet
        visible={giving}
        post={postTarget(item)}
        friends={[{ userId: item.author.id, name: authorName, avatarUrl: item.author.avatarUrl }]}
        onClose={() => setGiving(false)}
        onSent={(_result, picked) => {
          setGiving(false);
          setFlying({ tier: picked.tier, item: picked, key: Date.now() });
          void postGifts(client, postTarget(item)).then((res) => res.ok && setGifts(res.data.gifts));
        }}
      />
      {flying ? <GiftSendAnimation key={flying.key} tier={flying.tier} item={flying.item} announce={t('gift.post.sent', { name: authorName })} onDone={() => setFlying(null)} /> : null}
    </>
  );
  return { gifts, giving, give: () => setGiving(true), sheet };
}

/**
 * The small row of gifts under a post: the first few pictures, how many, and who gave them ("Gifts from Hamo and 3
 * others"), as the reader may see them, with a grand gift shown large ahead of them so it stays on show. A tap lists
 * every gift with its giver. Nothing when there are none.
 */
export function PostGiftsRow({ item, gifts }: { item: Pick<FeedItem, 'targetType' | 'id'>; gifts: PostGifts }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [open, setOpen] = useState(false);
  if (gifts.count <= 0) return null;
  const line = postGiftsLine(gifts);
  const name = line.name ?? t('gift.someone');
  // The numbers are short on the row ("3.4K", "and 1.2K others") and whole for a screen reader.
  const short = (v: number): string => formatCompact(v, locale);
  const whole = (v: number): string => formatNumber(v, locale);
  const givers = (n: (v: number) => string): string =>
    line.others === 0
      ? t(line.many ? 'post.gifts.fromMany' : 'post.gifts.from', { name })
      : t(line.others === 1 ? 'post.gifts.fromOther' : 'post.gifts.fromOthers', { name, count: n(line.others) });
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${givers(whole)}, ${t('post.gifts.count', { count: whole(gifts.count) })}`}
        testID="post-gifts"
        style={({ pressed }) => [styles.row, { flexDirection: dir.row, opacity: pressed ? pressedDim : 1 }]}
      >
        {gifts.items.some((g) => g.tier === 'grand') ? (
          <View style={[styles.pictures, { flexDirection: dir.row }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden testID="post-gifts-grand">
            {gifts.items
              .filter((g) => g.tier === 'grand')
              .slice(0, 3)
              .map((g) => (
                <ItemArt key={g.sku} category="gift" path={g.assetUrl} width={56} />
              ))}
          </View>
        ) : null}
        <View style={[styles.pictures, { flexDirection: dir.row }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {gifts.items
            .filter((g) => g.tier !== 'grand')
            .slice(0, 3)
            .map((g) => (
              <ItemArt key={g.sku} category="sticker" path={g.assetUrl} width={22} />
            ))}
        </View>
        <Text style={[styles.count, { color: colors.textPrimary }]} numberOfLines={1}>
          {short(gifts.count)}
        </Text>
        <Text style={[styles.words, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
          {givers(short)}
        </Text>
      </Pressable>
      {open ? <PostGiftsSheet post={postTarget(item)} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Every gift on a post with who gave it, newest first; a giver the reader may not see is "a Hevalo member". */
function PostGiftsSheet({ post, onClose }: { post: PostTarget; onClose: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [senders, setSenders] = useState<PostGiftSender[] | null>(null);
  const load = useCallback(() => {
    void postGifts(client, post).then((res) => setSenders(res.ok ? res.data.senders : []));
  }, [client, post]);
  useEffect(load, [load]);
  return (
    <BottomSheet visible onClose={onClose} title={t('post.gifts.title')} icon="gift">
      <SheetScrollView contentContainerStyle={styles.list}>
        {(senders ?? []).map((s, i) => {
          const name = giftSenderName(s.from);
          return (
            <View key={`${s.at}-${i}`} style={[styles.sender, { flexDirection: dir.row }]}>
              <Avatar name={name ?? t('gift.someone')} photoUrl={s.from?.avatarUrl ?? null} size={36} />
              <View style={styles.senderWords}>
                <Text style={[styles.senderName, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
                  {name ? t('gift.from', { name }) : t('gift.fromMember')}
                </Text>
                <Text style={[styles.words, dir.free, { color: colors.textSecondary }]} numberOfLines={1}>
                  {s.itemName}
                </Text>
              </View>
              <ItemArt category="sticker" path={s.assetUrl} width={32} />
            </View>
          );
        })}
      </SheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', gap: spacing.xs + 2, paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
  pictures: { gap: 2 },
  count: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  words: { flexShrink: 1, fontSize: typography.sizes.text },
  list: { paddingHorizontal: layout.gutter, paddingBottom: spacing.lg, gap: spacing.sm },
  sender: { alignItems: 'center', gap: spacing.sm },
  senderWords: { flex: 1, gap: 2 },
  senderName: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
});
