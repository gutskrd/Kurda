import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import { ToggleRow } from '../theme/Toggle';
import { countByCategory, itemCategory, matchesQuery, type ItemCategory } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { useIntents } from '../api/optimistic';
import type { ApiError } from '../api/types';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { SearchField } from '../theme/SearchField';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import type { RootNavigation } from '../navigation/rootStack';
import { useDirection } from '../reports/direction';
import { wearFrame } from '../ranks/api';
import { PictureFramed, SeasonFramed, framedAvatarSize, frameTierOf } from '../ranks/art';
import { TIER_NAME_KEY } from '../ranks/format';
import { KIND_LABEL, kindWithCount } from '../shop/format';
import { ItemArt, KindChips, SEARCH_MAX } from '../shop/ItemFilters';
import { equip, inventory, setIconVisibility, type CosmeticSlot, type InventoryItem } from './cosmetics';
import { Avatar, ownAvatarUrl } from './Avatar';
import { Loading } from '../theme/Loading';

type Kind = ItemCategory;

/** Always offered, even with none: frames are earned or bought, and the empty tab says where. */
const ALWAYS: readonly Kind[] = ['background', 'icon', 'frame'];

/** More than this many of one kind and a search field is worth its row. */
const SEARCH_FROM = 8;

/** The gap between tiles, and the narrowest a tile of each kind may be. */
const GAP = spacing.sm;
const MIN_TILE: Record<'wide' | 'square', number> = { wide: 100, square: 72 };

type Way = { action: TranslationKey; to: 'Shop' | 'Season' };

/** What a kind says when there is none of it, and where to get some: the shop. */
const EMPTY: Partial<Record<Kind, { text: TranslationKey; ways: readonly Way[] }>> = {
  background: { text: 'edit.noBackgrounds', ways: [{ action: 'shop.refreshed.open', to: 'Shop' }] },
  icon: { text: 'edit.noIcons', ways: [{ action: 'shop.refreshed.open', to: 'Shop' }] },
  frame: { text: 'edit.noFrames', ways: [{ action: 'shop.refreshed.open', to: 'Shop' }] },
};

/**
 * The things you own, and putting them on. Sorted by kind as the shop is (Backgrounds, Icons, Frames, and Tags and More
 * when you own any), each with its count; every tile is named under it, and past eight of a kind there is a search
 * field. Buying stays in the Shop. Tapping what you are wearing takes it off.
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
  /** Told after anything lands, so the screen above can re-read /me. */
  onChanged: () => void;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();

  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showIcon, setShowIcon] = useState(iconVisible);
  // Null until chosen; then the first kind you own any of.
  const [tab, setTab] = useState<Kind | null>(null);
  const [query, setQuery] = useState('');
  // The frame being worn is on the public profile, not on /me (as SeasonScreen reads it).
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

  // What /me has you wearing, or a fresher answer to a tap here, so a tile does not flicker back while /me is re-read.
  const [worn, setWorn] = useState<Record<CosmeticSlot, string | null>>({ background: equippedBackground, icon: equippedIcon });
  useEffect(() => setWorn({ background: equippedBackground, icon: equippedIcon }), [equippedBackground, equippedIcon]);
  const said = (failure: ApiError) => setError(describeError(failure, t));

  // A tap puts it on or takes it off at once; the server is told after, and a refusal puts it back with the reason.
  const dressing = useIntents<CosmeticSlot | 'frame', string | null>(
    async (slot, sku) => {
      if (slot === 'frame') {
        const res = await wearFrame(client, sku);
        if (res.ok) setWearing(res.data.frameSku);
        return res;
      }
      const res = await equip(client, slot, sku);
      if (res.ok) {
        setWorn((w) => ({ ...w, [slot]: sku }));
        onChanged();
      }
      return res;
    },
    { failed: said },
  );
  const put = useCallback(
    (slot: CosmeticSlot | 'frame', sku: string, on: boolean) => {
      setError(null);
      // Tapping what you have on takes it off.
      dressing.want(slot, on ? null : sku, slot === 'frame' ? wearing : worn[slot]);
    },
    [dressing, wearing, worn],
  );

  const iconShown = useIntents<'icon', boolean>(
    async (_key, next) => {
      const res = await setIconVisibility(client, next);
      if (res.ok) {
        setShowIcon(next);
        onChanged();
      }
      return res;
    },
    { failed: said },
  );
  const toggleIcon = useCallback(
    (next: boolean) => {
      setError(null);
      iconShown.want('icon', next, showIcon);
    },
    [iconShown, showIcon],
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

  const equippedSku =
    current === 'frame' ? dressing.shown('frame', wearing) : current === 'background' || current === 'icon' ? dressing.shown(current, worn[current]) : null;
  const wide = current === 'background';
  const room = width || 327; // Before the first layout, the width of a small phone.
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
    // Under Frames, "Zozan" says it on the tile; a screen reader still hears "Zozan season frame".
    const caption = tier ? t(TIER_NAME_KEY[tier]) : name;
    const art = tile - 4; // Inside the 2pt ring that marks what you are wearing.
    return (
      <PressableScale
        key={item.sku}
        onPress={() => put(current as CosmeticSlot | 'frame', item.sku, on)}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={on ? t('edit.itemEquipped', { name }) : name}
        accessibilityHint={on ? t('edit.hint.takeOff') : t('edit.hint.wear')}
        style={[styles.tile, { width: tile }]}
      >
        {/* What you are wearing is ringed and ticked in the violet every chosen option wears. */}
        <View style={[styles.ring, wide ? styles.ringWide : styles.ringSquare, { borderColor: on ? colors.primary : 'transparent' }]}>
          {tier ? (
            <View style={[styles.frameTile, { width: art, height: art, backgroundColor: colors.controlTrack }]}>
              <SeasonFramed tier={tier} size={Math.round(art * 0.86)} label={name}>
                <Avatar name={user?.displayName ?? user?.username ?? ''} size={framedAvatarSize(Math.round(art * 0.86))} photoUrl={ownAvatarUrl(user)} />
              </SeasonFramed>
            </View>
          ) : current === 'frame' && item.assetUrl ? (
            // One of the shop's frames, round your own face as a season frame is.
            <View style={[styles.frameTile, { width: art, height: art, backgroundColor: colors.controlTrack }]}>
              <PictureFramed url={item.assetUrl} size={Math.round(art * 0.86)}>
                <Avatar name={user?.displayName ?? user?.username ?? ''} size={framedAvatarSize(Math.round(art * 0.86))} photoUrl={ownAvatarUrl(user)} />
              </PictureFramed>
            </View>
          ) : (
            <ItemArt category={item.category} path={item.assetUrl} width={art} />
          )}
          {on ? (
            <View style={[styles.check, dir.row === 'row-reverse' ? styles.checkLeft : styles.checkRight, { backgroundColor: colors.primary }]}>
              <Icon name="check" size={12} tone="onPrimary" />
            </View>
          ) : null}
        </View>
        <Text
          style={[
            styles.tileName,
            { color: on ? colors.primary : colors.textSecondary, fontWeight: on ? typography.weights.semibold : typography.weights.regular },
          ]}
          numberOfLines={2}
        >
          {caption}
        </Text>
      </PressableScale>
    );
  });

  const empty = EMPTY[current];

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
        {t('edit.cosmetics')}
      </Text>

      {items === null ? (
        <Loading style={{ marginVertical: spacing.md }} />
      ) : (
        <>
          <KindChips
            role="tab"
            label={t('edit.items.label')}
            value={current}
            onChange={pick}
            options={kinds.map((k) => ({ key: k, label: t(KIND_LABEL[k]), count: counts[k], a11y: kindWithCount(t, k, counts[k]) }))}
          />

          {searchable ? <SearchField value={query} onChangeText={setQuery} label={t('edit.items.search')} maxLength={SEARCH_MAX} /> : null}

          <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            {ofKind.length === 0 && empty ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.glassFill }]}>
                <Text style={[styles.empty, dir.text, { color: colors.textSecondary }]}>{t(empty.text)}</Text>
                <View style={[styles.ways, { flexDirection: dir.row }]}>
                  {empty.ways.map((way) => (
                    <ClayButton key={way.to} label={t(way.action)} onPress={() => navigation.navigate(way.to)} />
                  ))}
                </View>
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

          {/* Showing it and owning it are different questions, so this switch hides the icon without giving it up.
             The words toggle it as well as the switch. */}
          {current === 'icon' && ofKind.length > 0 ? (
            <ToggleRow label={t('edit.showPremiumIcon')} value={iconShown.shown('icon', showIcon)} onValueChange={toggleIcon} />
          ) : null}
        </>
      )}

      {error ? (
        <Text style={[styles.error, dir.text, { color: colors.danger }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
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
  ways: { flexWrap: 'wrap', gap: spacing.sm },
  check: { position: 'absolute', top: 4, width: 20, height: 20, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  checkRight: { right: 4 },
  checkLeft: { left: 4 },
  tileName: { fontSize: typography.sizes.text, lineHeight: 22, textAlign: 'center', alignSelf: 'stretch' },
  list: { gap: spacing.sm },
  infoRow: { alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radii.md },
  infoMain: { flex: 1, gap: 2 },
  infoName: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  infoText: { fontSize: typography.sizes.text, lineHeight: 22 },
  emptyBox: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.md },
  empty: { fontSize: typography.sizes.text, lineHeight: 22 },
  start: { alignSelf: 'flex-start' },
  end: { alignSelf: 'flex-end' },
  error: { fontSize: typography.sizes.text },
});
