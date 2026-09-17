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
import { giftsWereOpened } from './useUnseenGifts';

/**
 * What people have sent you, at the top of the shop (KUR-087).
 *
 * A gift used to arrive and be owned and that was all: the notification said
 * somebody had sent you something and the shop it dropped you into looked
 * exactly as it had a moment earlier. This is the place that acknowledges it.
 *
 * Reading the list *is* opening them, so it marks them seen — anything else
 * leaves a badge that never clears no matter what you do.
 *
 * Renders nothing at all when nobody has sent you anything, rather than an
 * empty heading: a shop with a bare "Your gifts" over a gap reads as something
 * broken rather than as something that has not happened yet.
 */
export function ReceivedGifts(): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [gifts, setGifts] = useState<ReceivedGift[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await receivedGifts(client);
      if (cancelled || !res.ok) return;
      setGifts(res.data.gifts);
      if (res.data.unseen > 0) {
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
      <Text style={[styles.heading, { color: colors.textSecondary }]}>{t('shop.yourGifts')}</Text>
      {gifts.map((g) => {
        const art = assetUrl(g.assetUrl);
        return (
          <View
            key={g.id}
            style={[
              styles.row,
              {
                backgroundColor: colors.glassFill,
                // an unopened one is worth pointing at, once
                borderColor: g.seenAt ? colors.glassBorder : colors.gold,
              },
            ]}
          >
            <View style={[styles.thumb, { backgroundColor: colors.controlTrack }]}>
              {art ? (
                <Image source={{ uri: art }} style={styles.art} resizeMode="cover" accessibilityIgnoresInvertColors />
              ) : (
                <Icon name="gem" size={20} color={colors.textSecondary} />
              )}
            </View>
            <View style={styles.main}>
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                {g.name}
              </Text>
              <Text style={[styles.from, { color: colors.textSecondary }]} numberOfLines={1}>
                {g.from ? t('shop.giftFrom', { name: g.from.username }) : t('shop.giftFromFormer')}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.xs },
  heading: { ...sectionLabel },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  thumb: { width: 44, height: 44, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  art: { width: '100%', height: '100%' },
  main: { flex: 1 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  from: { fontSize: typography.sizes.sm },
});
