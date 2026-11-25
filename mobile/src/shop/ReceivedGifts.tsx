import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { assetUrl } from '../api/env';
import { radii, spacing, typography } from '../theme/tokens';
import { sectionLabel } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { markGiftsSeen, receivedGifts, type ReceivedGift } from './gifts';
import { giftsSeen, giftsWereOpened } from './useUnseenGifts';
import { useDirection } from '../reports/direction';

/**
 * What people have sent you, at the top of the shop. Reading the list is opening them, so it marks them seen (otherwise
 * the badge would never clear). Renders nothing when nobody has sent anything, rather than an empty heading.
 */
export function ReceivedGifts(): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  // The picture on the side the language starts from; an item's name read in its own direction.
  const dir = useDirection();
  const [gifts, setGifts] = useState<ReceivedGift[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await receivedGifts(client);
      if (cancelled || !res.ok) return;
      setGifts(res.data.gifts);
      if (res.data.unseen > 0) {
        // The badge clears as the list shows; the count read after the mark is the truth, whether it took or not.
        giftsSeen('all');
        await markGiftsSeen(client);
        giftsWereOpened();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (!gifts || gifts.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]}>{t('shop.yourGifts')}</Text>
      {gifts.map((g) => {
        const art = assetUrl(g.assetUrl);
        return (
          <View
            key={g.id}
            style={[
              styles.row,
              {
                flexDirection: dir.row,
                backgroundColor: colors.glassFill,
                // An unopened one is worth pointing at, once: in violet, as anything new is (gold is for what is
                // earned).
                borderColor: g.seenAt ? colors.glassBorder : colors.primary,
              },
            ]}
          >
            <View style={[styles.thumb, { backgroundColor: colors.controlTrack }]}>
              {art ? (
                <Image source={{ uri: art }} style={styles.art} resizeMode="cover" accessibilityIgnoresInvertColors />
              ) : (
                <Icon name="gift" size={20} color={colors.textSecondary} />
              )}
            </View>
            <View style={styles.main}>
              <Text style={[styles.name, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
                {g.name}
              </Text>
              <Text style={[styles.from, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
                {g.from ? t('gift.from', { name: g.from.displayName?.trim() || g.from.username }) : t('gift.fromMember')}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // The Shop's inbox already sits inside the screen's margins, so no second inset.
  wrap: { paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.xs },
  heading: { ...sectionLabel },
  row: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  thumb: { width: 44, height: 44, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  art: { width: '100%', height: '100%' },
  main: { flex: 1 },
  name: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  from: { fontSize: typography.sizes.text },
});
