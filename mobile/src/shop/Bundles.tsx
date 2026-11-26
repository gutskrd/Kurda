/**
 * Bundles in the phone's shop (shared shop-bundles.ts), as the website shows them: a row the shop leads with, each card
 * the set worn together — your own face in its frame with the icon on its shoulder and the tag under it, over its
 * background, the gifts beside — and what it costs you. The saving and "Best value" are worked out by the server and
 * shared code and shown only to a known adult (`nudges`); anyone else sees the same bundles and prices plainly.
 */
import { useRef } from 'react';
import { Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { bestValueBundle, bundleWords, giftMeaning, itemRarity, shopItemDescription, type BundleView, type BundlesView, type Rarity } from '@kurda/shared';
import { reachRoom } from '../a11y/a11y';
import { useAuth } from '../auth/AuthContext';
import { assetUrl } from '../api/env';
import { Avatar, ownAvatarUrl } from '../profile/Avatar';
import { TagMark, TagPill } from '../profile/TagPill';
import { PictureFramed, framedAvatarSize } from '../ranks/art';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import type { TranslationKey } from '../i18n/translations';
import { useDirection } from '../reports/direction';
import { PressableScale } from '../theme/MotionParts';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { display } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { ZER } from './format';
import { ItemArt } from './ItemFilters';
import { ZerValue, useZerValue } from './value';

/** The part of a bundle of one kind, if it has one. */
export function partOf(bundle: BundleView, kind: 'background' | 'frame' | 'icon' | 'tag'): BundleView['parts'][number] | undefined {
  return bundle.parts.find((p) => p.category === kind);
}

const RARITY_LABEL: Readonly<Record<Rarity, TranslationKey>> = {
  classic: 'shop.rarity.classic',
  fine: 'shop.rarity.fine',
  rare: 'shop.rarity.rare',
  masterwork: 'shop.rarity.masterwork',
};

/** An item's step on the price ladder as a small word in the ink, a masterwork's in gold; nothing for what it does not price. */
export function RarityText({ item }: { item: { sku?: string; category: string; price: number } }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const rarity = itemRarity(item);
  if (!rarity) return null;
  const tone = rarity === 'masterwork' ? colors.gold : rarity === 'rare' ? colors.textPrimary : colors.textSecondary;
  return <Text style={[styles.rarity, { color: tone }]}>{t(RARITY_LABEL[rarity])}</Text>;
}

/** Your own face in a frame, with an icon on its shoulder, as a profile wears them. */
export function WornFace({ frameUrl, iconUrl, size }: { frameUrl?: string | null; iconUrl?: string | null; size: number }): React.JSX.Element {
  const { user } = useAuth();
  const name = user?.displayName ?? user?.username ?? '';
  const icon = assetUrl(iconUrl);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {frameUrl ? (
        <PictureFramed url={frameUrl} size={size}>
          <Avatar name={name} size={framedAvatarSize(size)} photoUrl={ownAvatarUrl(user)} />
        </PictureFramed>
      ) : (
        <Avatar name={name} size={framedAvatarSize(size)} photoUrl={ownAvatarUrl(user)} />
      )}
      {icon ? <Image source={{ uri: icon }} style={[styles.icon, { width: size * 0.3, height: size * 0.3 }]} resizeMode="contain" accessibilityIgnoresInvertColors /> : null}
    </View>
  );
}

/** The set worn together over its background, with the gifts in a column beside it. Decorative: the words say the same. */
export function BundleShowcase({ bundle, width }: { bundle: BundleView; width: number }): React.JSX.Element {
  const { colors } = useTheme();
  const background = assetUrl(partOf(bundle, 'background')?.assetUrl);
  const tag = partOf(bundle, 'tag');
  const height = Math.round(width * 0.62);
  const ring = Math.round(Math.min(height * 0.66, 150));
  return (
    <View style={[styles.show, { width, height, backgroundColor: colors.controlTrack }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {background ? <Image source={{ uri: background }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
      <View style={styles.wearer}>
        <WornFace frameUrl={partOf(bundle, 'frame')?.assetUrl} iconUrl={partOf(bundle, 'icon')?.assetUrl} size={ring} />
        {tag ? <TagPill tag={{ label: tag.name, meaning: tag.description }} solid style={styles.center} /> : null}
      </View>
      {bundle.gifts.length > 0 ? (
        <View style={[styles.gifts, { backgroundColor: colors.background }]}>
          {bundle.gifts.map((g) => (
            <View key={g.sku} style={styles.giftRow}>
              {g.assetUrl ? <Image source={{ uri: assetUrl(g.assetUrl)! }} style={styles.giftArt} resizeMode="contain" /> : null}
              <Text style={[styles.giftCount, { color: colors.textPrimary }]}>{`×${g.count}`}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** What a bundle costs you, with its money value; to an adult also the parts' worth struck through and the saving. */
export function BundlePrice({ bundle, nudges }: { bundle: BundleView; nudges: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const value = useZerValue();
  const { price, worth, saving } = bundle.quote;
  const struck = nudges && saving > 0;
  return (
    <View style={styles.priceBlock}>
      <View style={[styles.priceRow, { flexDirection: dir.row }]}>
        {struck ? (
          <Text
            style={[styles.worth, { color: colors.textSecondary }]}
            accessibilityLabel={t('bundle.worthSpoken', { zer: formatNumber(worth, locale) })}
          >
            {`${formatNumber(worth, locale)} ${ZER}`}
          </Text>
        ) : null}
        <Icon name="coin" size={16} color={colors.gold} />
        <Text style={[styles.price, { color: colors.textPrimary }]}>{`${formatNumber(price, locale)} ${ZER}`}</Text>
        <ZerValue zer={price} />
      </View>
      {struck ? (
        <Text style={[styles.save, dir.text, { color: colors.textPrimary }]}>{t('bundle.save', { zer: formatNumber(saving, locale), value: value(saving) })}</Text>
      ) : null}
    </View>
  );
}

function BundleCard({ bundle, nudges, best, width, onOpen }: { bundle: BundleView; nudges: boolean; best: boolean; width: number; onOpen: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const words = bundleWords(bundle.id, bundle.name, locale);
  const { quote } = bundle;
  return (
    <PressableScale
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={t('bundle.openNamed', { name: bundle.name })}
      style={[styles.card, { width, backgroundColor: colors.glassFill, opacity: quote.complete ? 0.8 : 1 }]}
      testID={`bundle-${bundle.id}`}
    >
      <BundleShowcase bundle={bundle} width={width} />
      <View style={styles.cardBody}>
        <View style={[styles.cardHead, { flexDirection: dir.row }]}>
          <Text style={[styles.name, dir.free, { color: colors.textPrimary }]} accessibilityLanguage="ku" numberOfLines={1}>
            {bundle.name}
          </Text>
          {best && nudges ? (
            <View style={[styles.best, { borderColor: colors.textSecondary }]}>
              <Text style={[styles.bestText, { color: colors.textPrimary }]}>{t('bundle.bestValue')}</Text>
            </View>
          ) : null}
        </View>
        {words?.title ? <Text style={[styles.title, dir.text, { color: colors.textSecondary }]}>{words.title}</Text> : null}
        {quote.complete ? (
          <Text style={[styles.complete, dir.text, { color: colors.gold }]}>{t('bundle.complete')}</Text>
        ) : (
          <>
            <BundlePrice bundle={bundle} nudges={nudges} />
            {quote.owned > 0 ? (
              <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>
                {t('bundle.ownedSome', { owned: formatNumber(quote.owned, locale), total: formatNumber(bundle.parts.length, locale) })}
              </Text>
            ) : null}
          </>
        )}
      </View>
    </PressableScale>
  );
}

/** Room above and below the cards for what they reach, the scroller pulled back so nothing moves. */
const CARD_ROOM = reachRoom(spacing.sm);

/** The bundles the shop leads with, in a row scrolled sideways from the reading side; nothing while there are none. */
export function BundleRow({ view, onOpen }: { view: BundlesView | null; onOpen: (bundle: BundleView) => void }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const { width } = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  const bundles = view?.bundles ?? [];
  if (bundles.length === 0) return null;
  const best = bestValueBundle(bundles);
  const card = Math.min(320, Math.round((Math.min(width, 680) - layout.gutter * 2) * 0.86));
  return (
    <View style={styles.row} testID="bundle-row">
      <Text style={[styles.heading, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
        {t('bundle.heading')}
      </Text>
      <Text style={[styles.sub, dir.text, { color: colors.textSecondary }]}>{t('bundle.subtitle')}</Text>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        // Right to left, the first card is on the right, so the row starts there.
        onContentSizeChange={() => {
          if (dir.row === 'row-reverse') scroller.current?.scrollToEnd({ animated: false });
        }}
        contentContainerStyle={[styles.track, CARD_ROOM.content, { flexDirection: dir.row }]}
        style={[styles.trackOuter, CARD_ROOM.scroller]}
      >
        {bundles.map((b) => (
          <BundleCard key={b.id} bundle={b} nudges={view?.nudges === true} best={best === b.id} width={card} onOpen={() => onOpen(b)} />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * A bundle opened, in its sheet: the set worn together, its story, every part with its rarity and its price alone, the
 * gifts for the bag, and the sum. Buy sits beside the note that purchases are final, so this is the one question.
 */
export function BundleDetail({
  bundle,
  nudges,
  zer,
  busy,
  error,
  onBuy,
  onTryOn,
  onEarnMore,
}: {
  bundle: BundleView;
  nudges: boolean;
  zer: number;
  busy: boolean;
  error: string | null;
  onBuy: () => void;
  onTryOn: () => void;
  onEarnMore: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const { width } = useWindowDimensions();
  const words = bundleWords(bundle.id, bundle.name, locale);
  const blocked = !bundle.onSale || bundle.bagFull || bundle.quote.complete;
  const short = Math.max(0, bundle.quote.price - zer);
  const show = Math.min(width, 520) - layout.gutter * 2;
  return (
    <View style={styles.detail}>
      <BundleShowcase bundle={bundle} width={show} />
      <Text style={[styles.detailName, dir.free, { color: colors.textPrimary }]} accessibilityRole="header" accessibilityLanguage="ku">
        {bundle.name}
      </Text>
      {words?.title ? <Text style={[styles.title, dir.text, { color: colors.textSecondary }]}>{words.title}</Text> : null}
      {words ? <Text style={[styles.story, dir.text, { color: colors.textPrimary }]}>{words.story}</Text> : null}

      <Text style={[styles.section, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
        {t('bundle.inside')}
      </Text>
      {bundle.parts.map((p) => {
        const meaning = shopItemDescription(p, locale);
        return (
          <View key={p.sku} style={[styles.part, { flexDirection: dir.row, borderBottomColor: colors.separator }]}>
            <View style={styles.partArt}>
              {p.category === 'tag' ? (
                <TagMark />
              ) : p.category === 'frame' && p.assetUrl ? (
                <WornFace frameUrl={p.assetUrl} size={52} />
              ) : (
                <ItemArt category={p.category} path={p.assetUrl} width={p.category === 'background' ? 72 : 48} />
              )}
            </View>
            <View style={styles.partWords}>
              <Text style={[styles.partName, dir.free, { color: colors.textPrimary }]} accessibilityLanguage="ku">
                {p.name}
              </Text>
              {meaning ? <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{meaning}</Text> : null}
            </View>
            <View style={styles.partSide}>
              <RarityText item={p} />
              {p.owned ? (
                <Text style={[styles.note, { color: colors.gold }]}>{t('bundle.owned')}</Text>
              ) : (
                <Text style={[styles.note, { color: colors.textSecondary }]}>{t('bundle.alone', { zer: formatNumber(p.price, locale) })}</Text>
              )}
            </View>
          </View>
        );
      })}

      {bundle.gifts.length > 0 ? (
        <>
          <Text style={[styles.section, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
            {t('bundle.gifts')}
          </Text>
          {bundle.gifts.map((g) => (
            <View key={g.sku} style={[styles.part, { flexDirection: dir.row, borderBottomColor: colors.separator }]}>
              <View style={styles.partArt}>{g.assetUrl ? <Image source={{ uri: assetUrl(g.assetUrl)! }} style={styles.giftBig} resizeMode="contain" /> : null}</View>
              <View style={styles.partWords}>
                <Text style={[styles.partName, dir.text, { color: colors.textPrimary }]}>{t('bundle.giftCount', { count: formatNumber(g.count, locale), name: g.name })}</Text>
                {giftMeaning(g.sku, locale) ? <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{giftMeaning(g.sku, locale)}</Text> : null}
              </View>
            </View>
          ))}
          <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('bundle.giftsNote')}</Text>
        </>
      ) : null}

      <View style={[styles.sum, { backgroundColor: colors.glassFill }]}>
        <BundlePrice bundle={bundle} nudges={nudges} />
        {bundle.quote.owned > 0 && !bundle.quote.complete ? (
          <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>
            {t('bundle.ownedSome', { owned: formatNumber(bundle.quote.owned, locale), total: formatNumber(bundle.parts.length, locale) })}
          </Text>
        ) : null}
      </View>

      {bundle.bagFull ? <Text style={[styles.note, dir.text, { color: colors.textPrimary }]}>{t('bundle.bagFull')}</Text> : null}
      {!bundle.onSale ? <Text style={[styles.note, dir.text, { color: colors.textPrimary }]}>{t('bundle.unavailable')}</Text> : null}
      {error ? (
        <Text style={[styles.note, dir.text, { color: colors.danger }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <ClayButton label={t('shop.tryOn')} icon="eye" onPress={onTryOn} style={styles.stretch} />
      {short > 0 && !blocked ? (
        <View style={styles.stretch}>
          <Text style={[styles.note, styles.centred, { color: colors.textSecondary }]}>
            {t('shop.notEnough', { currency: ZER })} {t('shop.earnMoreZer')}
          </Text>
          <ClayButton label={t('shop.earnZer')} tone="primary" onPress={onEarnMore} style={styles.stretch} />
        </View>
      ) : (
        <ClayButton
          label={t('bundle.buyFor', { zer: formatNumber(bundle.quote.price, locale) })}
          tone="primary"
          size="large"
          busy={busy}
          disabled={blocked}
          onPress={onBuy}
          style={styles.stretch}
        />
      )}
      <Text style={[styles.note, styles.centred, { color: colors.textSecondary }]}>{t('shop.finalNote')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs, paddingTop: spacing.sm },
  heading: { ...display(typography.sizes.title) },
  sub: { fontSize: typography.sizes.text, lineHeight: 22 },
  // edge to edge, its first card in line with the page's gutter
  trackOuter: { marginHorizontal: -layout.gutter },
  track: { gap: spacing.sm, paddingHorizontal: layout.gutter },
  card: { borderRadius: radii.lg, overflow: 'hidden' },
  cardBody: { padding: spacing.md, gap: 4 },
  cardHead: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: { ...display(typography.sizes.title), flexShrink: 1 },
  best: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  bestText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  title: { fontSize: typography.sizes.text },
  complete: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, marginTop: spacing.xs },
  priceBlock: { gap: 2, marginTop: spacing.xs },
  priceRow: { alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  worth: { fontSize: typography.sizes.text, textDecorationLine: 'line-through', fontVariant: ['tabular-nums'] },
  price: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  save: { fontSize: typography.sizes.text, fontWeight: typography.weights.medium },
  note: { fontSize: typography.sizes.text, lineHeight: 22 },
  show: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, overflow: 'hidden', borderRadius: radii.md },
  wearer: { flex: 1, alignItems: 'center', gap: spacing.xs },
  center: { alignSelf: 'center' },
  icon: { position: 'absolute', top: '8%', right: '4%' },
  gifts: { padding: spacing.xs + 2, gap: 4, borderRadius: radii.md },
  giftRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  giftArt: { width: 26, height: 26 },
  giftBig: { width: 44, height: 44 },
  giftCount: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  detail: { gap: spacing.sm, paddingBottom: spacing.md },
  detailName: { ...display(typography.sizes.title), marginTop: spacing.xs },
  story: { fontSize: typography.sizes.text, lineHeight: 22 },
  section: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, marginTop: spacing.sm },
  part: { alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  partArt: { width: 72, alignItems: 'center', justifyContent: 'center' },
  partWords: { flex: 1, minWidth: 0 },
  partName: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  partSide: { alignItems: 'flex-end', gap: 2 },
  rarity: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  sum: { borderRadius: radii.md, padding: spacing.md, gap: 4, marginTop: spacing.sm },
  stretch: { alignSelf: 'stretch' },
  centred: { textAlign: 'center' },
});
