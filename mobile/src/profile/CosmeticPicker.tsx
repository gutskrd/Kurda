import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Toggle } from '../theme/Toggle';
import { countByCategory, itemCategory, matchesQuery, type ItemCategory } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import type { RootNavigation } from '../navigation/rootStack';
import { useDirection } from '../reports/direction';
import { wearFrame } from '../ranks/api';
import { SeasonFramed, framedAvatarSize, frameTierOf } from '../ranks/art';
import { TIER_NAME_KEY } from '../ranks/format';
import { KIND_LABEL, kindWithCount } from '../shop/format';
import { ItemArt, KindChips, SearchField } from '../shop/ItemFilters';
import { equip, inventory, setIconVisibility, type CosmeticSlot, type InventoryItem } from './cosmetics';
import { InitialsAvatar } from './InitialsAvatar';

type Kind = ItemCategory;

/** Always offered, even with none of them: frames are earned, and the empty tab says how. */
const ALWAYS: readonly Kind[] = ['background', 'icon', 'frame'];

/** More than this many of one kind and a search field is worth its row. */
const SEARCH_FROM = 8;

/** The gap between tiles, and the narrowest a tile of each kind may be. */
const GAP = spacing.sm;
const MIN_TILE: Record<'wide' | 'square', number> = { wide: 100, square: 72 };

/** What a kind says when there is none of it, and where to get some. */
const EMPTY: Partial<Record<Kind, { text: TranslationKey; action: TranslationKey; to: 'Shop' | 'Season' }>> = {
  background: { text: 'edit.noBackgrounds', action: 'shop.refreshed.open', to: 'Shop' },
  icon: { text: 'edit.noIcons', action: 'shop.refreshed.open', to: 'Shop' },
  frame: { text: 'edit.noFrames', action: 'edit.seeSeason', to: 'Season' },
};

/**
 * The things you own, and putting them on (KUR-088).
 *
 * Sorted by kind, as the shop is: Backgrounds, Icons and Frames, each with
 * how many you have, and Tags and More when you own any. Every tile says what
 * it is under it — the shelves were rows of unnamed squares, and a screen
 * reader heard "Equip" thirty times. Past eight of a kind, a search field.
 * Everything here is already yours — buying still happens in the Shop, which
 * the phone already has, rather than being built a second time.
 *
 * Tapping what you are already wearing takes it off, because the alternative is
 * a wardrobe you can add to and never empty. Frames are worn here the way the
 * Season screen wears them, which until now was the only place they could be.
 */
export function CosmeticPicker({
  equippedBackground,
  equippedIcon,
  iconVisible,
  onChanged,
}: {
  equippedBackground: string | null;
  equippedIcon: string | null;
  iconVisible: boolean;
  /** told after anything lands, so the screen above can re-read /me */
  onChanged: () => void;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();

  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showIcon, setShowIcon] = useState(iconVisible);
  // null until chosen: then the first kind you own any of
  const [tab, setTab] = useState<Kind | null>(null);
  const [query, setQuery] = useState('');
  // the frame being worn is on the public profile, not on /me (as SeasonScreen reads it)
  const [wearing, setWearing] = useState<string | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let alive = true;
    void inventory(client).then((res) => {
      if (!alive) return;
      const owned = res.ok ? res.data.items : [];
      setItems(owned);
      if (user && owned.some((i) => itemCategory(i.category) === 'frame')) {
        void client.get<{ frameSku?: string | null }>(`/users/${user.id}`).then((me) => {
          if (alive && me.ok) setWearing(me.data.frameSku ?? null);
        });
      }
    });
    return () => {
      alive = false;
    };
  }, [client, user]);

  const choose = useCallback(
    (slot: CosmeticSlot, sku: string, equipped: boolean) => {
      if (busy) return;
      setBusy(sku);
      setError(null);
      // tapping what you have on takes it off
      void equip(client, slot, equipped ? null : sku).then((res) => {
        setBusy(null);
        if (res.ok) onChanged();
        else setError(describeError(res.error, t));
      });
    },
    [busy, client, onChanged, t],
  );

  const wear = useCallback(
    (sku: string, on: boolean) => {
      if (busy) return;
      setBusy(sku);
      setError(null);
      void wearFrame(client, on ? null : sku).then((res) => {
        setBusy(null);
        if (res.ok) setWearing(res.data.frameSku);
        else setError(describeError(res.error, t));
      });
    },
    [busy, client, t],
  );

  const toggleIcon = useCallback(
    (next: boolean) => {
      setShowIcon(next);
      void setIconVisibility(client, next).then((res) => {
        if (res.ok) onChanged();
        else {
          setShowIcon(!next);
          setError(describeError(res.error, t));
        }
      });
    },
    [client, onChanged, t],
  );

  const owned = useMemo(() => items ?? [], [items]);
  const counts = useMemo(() => countByCategory(owned), [owned]);
  const kinds = useMemo(() => [...ALWAYS, ...(['tag', 'other'] as const).filter((k) => counts[k] > 0)], [counts]);
  const current: Kind = tab ?? kinds.find((k) => counts[k] > 0) ?? 'background';

  /** What a tile is called: a frame by its tier, in the reader's language; the rest by their shop name. */
  const nameOf = useCallback(
    (item: InventoryItem): string => {
      const tier = itemCategory(item.category) === 'frame' ? frameTierOf(item.sku) : null;
      return tier ? t('season.frameOf', { tier: t(TIER_NAME_KEY[tier]) }) : item.name;
    },
    [t],
  );

  const ofKind = owned.filter((i) => itemCategory(i.category) === current);
  const searchable = ofKind.length > SEARCH_FROM;
  const shown = searchable ? ofKind.filter((i) => matchesQuery({ name: nameOf(i) }, query)) : ofKind;

  const equippedSku = current === 'background' ? equippedBackground : current === 'icon' ? equippedIcon : current === 'frame' ? wearing : null;
  const wide = current === 'background';
  const room = width || 327; // before the first layout, the width of a small phone
  const columns = Math.max(2, Math.floor((room + GAP) / (MIN_TILE[wide ? 'wide' : 'square'] + GAP)));
  const tile = Math.floor((room - GAP * (columns - 1)) / columns);

  const pick = (next: Kind) => {
    setTab(next);
    setQuery('');
  };

  const tiles = shown.map((item) => {
    const on = item.sku === equippedSku;
    const name = nameOf(item);
    const tier = current === 'frame' ? frameTierOf(item.sku) : null;
    // under Frames, "Zozan" says it on the tile; a screen reader still hears "Zozan season frame"
    const caption = tier ? t(TIER_NAME_KEY[tier]) : name;
    const art = tile - 4; // inside the 2pt ring that marks what you are wearing
    return (
      <Pressable
        key={item.sku}
        onPress={() => (current === 'frame' ? wear(item.sku, on) : choose(current as CosmeticSlot, item.sku, on))}
        accessibilityRole="button"
        accessibilityState={{ selected: on, busy: busy === item.sku }}
        accessibilityLabel={on ? t('edit.itemEquipped', { name }) : name}
        accessibilityHint={on ? t('edit.hint.takeOff') : t('edit.hint.wear')}
        style={({ pressed }) => [styles.tile, { width: tile, opacity: pressed ? 0.8 : 1 }]}
      >
        <View style={[styles.ring, wide ? styles.ringWide : styles.ringSquare, { borderColor: on ? colors.textPrimary : 'transparent' }]}>
          {tier ? (
            <View style={[styles.frameTile, { width: art, height: art, backgroundColor: colors.controlTrack }]}>
              <SeasonFramed tier={tier} size={Math.round(art * 0.86)} label={name}>
                <InitialsAvatar
                  name={user?.displayName ?? user?.username ?? ''}
                  id={user?.id ?? ''}
                  size={framedAvatarSize(Math.round(art * 0.86))}
                />
              </SeasonFramed>
            </View>
          ) : (
            <ItemArt category={item.category} path={item.assetUrl} width={art} />
          )}
          {busy === item.sku ? (
            <View style={[StyleSheet.absoluteFill, styles.busy, { backgroundColor: colors.glassFill }]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
          {on ? (
            <View style={[styles.check, dir.row === 'row-reverse' ? styles.checkLeft : styles.checkRight, { backgroundColor: colors.textPrimary }]}>
              <Icon name="check" size={12} color={colors.background} />
            </View>
          ) : null}
        </View>
        <Text
          style={[
            styles.tileName,
            { color: on ? colors.textPrimary : colors.textSecondary, fontWeight: on ? typography.weights.semibold : typography.weights.regular },
          ]}
          numberOfLines={2}
        >
          {caption}
        </Text>
      </Pressable>
    );
  });

  const empty = EMPTY[current];

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
        {t('edit.cosmetics')}
      </Text>

      {items === null ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
      ) : (
        <>
          <KindChips
            role="tab"
            label={t('edit.items.label')}
            value={current}
            onChange={pick}
            options={kinds.map((k) => ({ key: k, label: t(KIND_LABEL[k]), count: counts[k], a11y: kindWithCount(t, k, counts[k]) }))}
          />

          {searchable ? <SearchField value={query} onChange={setQuery} label={t('edit.items.search')} /> : null}

          <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            {ofKind.length === 0 && empty ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.glassFill }]}>
                <Text style={[styles.empty, dir.text, { color: colors.textSecondary }]}>{t(empty.text)}</Text>
                <ClayButton label={t(empty.action)} onPress={() => navigation.navigate(empty.to)} style={dir.row === 'row-reverse' ? styles.end : styles.start} />
              </View>
            ) : current === 'tag' || current === 'other' ? (
              <View style={styles.list}>
                {shown.map((item) => (
                  <View key={item.sku} style={[styles.infoRow, { flexDirection: dir.row, backgroundColor: colors.glassFill }]}>
                    <ItemArt category={item.category} path={item.assetUrl} width={48} />
                    <View style={styles.infoMain}>
                      <Text style={[styles.infoName, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.name}
                        {item.quantity > 1 ? ` ×${item.quantity}` : ''}
                      </Text>
                      {current === 'tag' ? (
                        <Text style={[styles.infoText, dir.text, { color: colors.textSecondary }]}>{t('edit.tagOwned')}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
                {current === 'tag' ? (
                  <ClayButton label={t('edit.openTags')} icon="tag" onPress={() => navigation.navigate('Tags')} style={dir.row === 'row-reverse' ? styles.end : styles.start} />
                ) : null}
              </View>
            ) : shown.length === 0 ? (
              <Text style={[styles.empty, dir.text, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
                {t('shop.noMatches.title')}
              </Text>
            ) : (
              <View style={[styles.grid, { flexDirection: dir.row }]}>{tiles}</View>
            )}
          </View>

          {/*
            Showing it and owning it are different questions, so they are
            different controls: this hides the icon without giving it up.
          */}
          {current === 'icon' && ofKind.length > 0 ? (
            <View style={[styles.toggleRow, { flexDirection: dir.row }]}>
              <Text style={[styles.toggleLabel, dir.text, { color: colors.textPrimary }]}>{t('edit.showPremiumIcon')}</Text>
              <Toggle
                value={showIcon}
                onValueChange={toggleIcon}
                accessibilityLabel={t('edit.showPremiumIcon')}
                trackColor={{ true: colors.switchOn, false: colors.controlTrack }}
              />
            </View>
          ) : null}
        </>
      )}

      {error ? <Text style={[styles.error, dir.text, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.sm },
  heading: { ...sectionLabel },
  grid: { flexWrap: 'wrap', gap: GAP },
  tile: { alignItems: 'center', gap: 6, minHeight: MIN_TOUCH_TARGET },
  ring: { borderWidth: 2, padding: 0, overflow: 'hidden' },
  ringWide: { borderRadius: radii.sm + 2 },
  ringSquare: { borderRadius: radii.md + 2 },
  frameTile: { alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
  busy: { alignItems: 'center', justifyContent: 'center' },
  check: { position: 'absolute', top: 4, width: 20, height: 20, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  checkRight: { right: 4 },
  checkLeft: { left: 4 },
  tileName: { fontSize: typography.sizes.xs, lineHeight: 16, textAlign: 'center', alignSelf: 'stretch' },
  list: { gap: spacing.sm },
  infoRow: { alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radii.md },
  infoMain: { flex: 1, gap: 2 },
  infoName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  infoText: { fontSize: typography.sizes.sm, lineHeight: 19 },
  emptyBox: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.md },
  empty: { fontSize: typography.sizes.sm, lineHeight: 19 },
  start: { alignSelf: 'flex-start' },
  end: { alignSelf: 'flex-end' },
  toggleRow: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: MIN_TOUCH_TARGET },
  toggleLabel: { flex: 1, fontSize: typography.ios.row },
  error: { fontSize: typography.sizes.sm },
});
