import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { giftMeaning, type BagArrival } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { useDirection } from '../reports/direction';
import { ItemArt } from '../shop/ItemFilters';
import { ClayButton } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { bagSeen, giftBag } from './api';
import { canGiveGifts } from './access';
import { plusPitchAllowed } from './nudges';

/** How often, at most, the bag is asked about as the app comes back to the front. */
const LOOK_EVERY_MS = 60_000;

/**
 * One quiet line when small gifts land in the gift bag (a streak milestone, a win, a harvest): "Çay is in your gift
 * bag", with Close. To a free adult account it adds once that members also earn Zêr there, while Hevalo+ is on sale;
 * never to anyone under 18. The day's own gift is said by the daily card instead. Announced politely.
 */
export function BagNews(): React.JSX.Element | null {
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [news, setNews] = useState<{ arrivals: BagArrival[]; earnsZer: boolean } | null>(null);
  const lastLook = useRef(0);
  const can = canGiveGifts(user);

  const look = useCallback(() => {
    if (!can || Date.now() - lastLook.current < LOOK_EVERY_MS) return;
    lastLook.current = Date.now();
    void giftBag(client).then((res) => {
      if (res.ok && res.data.arrivals.length > 0) setNews({ arrivals: res.data.arrivals, earnsZer: res.data.earnsZer });
    });
  }, [client, can]);

  useEffect(() => {
    look();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && look());
    return () => sub.remove();
  }, [look]);

  if (!can || !news) return null;
  const first = news.arrivals[0]!;
  const meaning = giftMeaning(first.sku, locale);
  const words =
    news.arrivals.length === 1
      ? t('bag.news.landed', { item: meaning ? `${first.name} (${meaning})` : first.name })
      : t('bag.news.many', { count: formatNumber(news.arrivals.length, locale) });
  const done = (): void => {
    setNews(null);
    void bagSeen(client);
  };
  return (
    <View style={[styles.card, { flexDirection: dir.row, backgroundColor: colors.surface, borderColor: colors.separator }]} accessibilityLiveRegion="polite" testID="bag-news">
      <ItemArt category="gift" path={first.assetUrl} width={44} />
      <View style={styles.words}>
        <Text style={[styles.text, dir.text, { color: colors.textPrimary }]}>{words}</Text>
        {!news.earnsZer && plusPitchAllowed(user) ? <Text style={[styles.text, dir.text, { color: colors.textSecondary }]}>{t('gift.membersEarnZer')}</Text> : null}
      </View>
      <ClayButton label={t('bag.news.close')} variant="outline" onPress={done} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: layout.gutter,
    right: layout.gutter,
    bottom: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  words: { flex: 1, gap: 2 },
  text: { fontSize: typography.sizes.text },
});
