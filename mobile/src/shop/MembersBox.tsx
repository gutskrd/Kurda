import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { MembersBoxView } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { sectionLabel } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { ItemArt } from './ItemFilters';
import { ZerValue } from './value';

/**
 * A Hevalo+ member's box for this month, in the shop: its Zêr with what they are worth, its free gifts, and the month's
 * members-only item, already theirs. Read on the shop's first look; the server gives the box on the month's first
 * visit, and a box not yet seen is marked seen once shown. Nothing for anyone who is not a member: nothing about
 * Hevalo+ is offered in the app until it can be bought there.
 */
export function MembersBox(): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [view, setView] = useState<MembersBoxView | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await client.get<MembersBoxView>('/me/members-box');
      if (cancelled || !res.ok) return;
      setView(res.data);
      if (res.data.box && !res.data.box.seen) void client.post('/me/members-box/seen');
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const box = view?.box;
  if (!box) return null;
  const n = (v: number) => formatNumber(v, locale);
  return (
    <View style={styles.wrap} testID="members-box">
      <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]}>{t('shop.box.title')}</Text>
      <View style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.surface }]}>
        <View style={[styles.thumb, { backgroundColor: colors.controlTrack }]}>
          {box.item ? <ItemArt category={box.item.category} path={box.item.assetUrl} width={44} /> : <Icon name="gift" size={20} color={colors.textSecondary} />}
        </View>
        <View style={styles.main}>
          <View style={[styles.line, { flexDirection: dir.row }]}>
            <Icon name="coin" size={16} color={colors.gold} />
            <Text style={[styles.text, { color: colors.textPrimary }]}>{t('shop.box.zer', { zer: n(box.zer) })}</Text>
            <ZerValue zer={box.zer} />
          </View>
          <Text style={[styles.text, dir.text, { color: colors.textSecondary }]}>
            {t('shop.box.gifts', { count: n(view.freeGifts) })}
            {box.item ? ` · ${t('shop.box.item', { name: box.item.name })}` : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: spacing.md, gap: spacing.xs },
  heading: { ...sectionLabel },
  row: { alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radii.md },
  thumb: { width: 44, height: 44, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  main: { flex: 1, gap: 2 },
  line: { alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  text: { fontSize: typography.sizes.text },
});
