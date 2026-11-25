import { useEffect, useState, type ReactNode } from 'react';
import { Image, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  LEAGUE_TIERS,
  badgeDef,
  badgeViewFraction,
  badgesInOrder,
  hasTreeArt,
  type BadgeView,
  type BadgesResponse,
  type CollectionGift,
  type CollectionResponse,
  type ProfileBadge,
  type ProfileLeague,
  type ShowcaseBadge,
  type TreeGlimpse,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { assetUrl } from '../api/env';
import { useIntents } from '../api/optimistic';
import { ShowcaseChoices } from '../badges/BadgesScreen';
import { NewChip } from '../badges/NewChip';
import { badgeLabel, badgeMeaning, badgeName, badgeTextKey, progressText, rarityText, tierLabel } from '../badges/format';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { knownTier, leagueMeaning, leagueName } from '../leagues/format';
import type { RootNavigation } from '../navigation/rootStack';
import { BadgeMedal, LeagueEmblem } from '../ranks/art';
import { getBadges, setShowcase } from '../ranks/api';
import { useDirection } from '../reports/direction';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { ClayButton, ErrorRetry, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { PressableScale, heldDim } from '../theme/MotionParts';
import { Pressable } from '../theme/Pressable';
import { Skeleton } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { fontScaleCap, radii, spacing, typography } from '../theme/tokens';
import { ProfileTree } from '../tree/ProfileTree';
import { TreeArt } from '../tree/TreeArt';
import { healthName, stageName, treeNamed } from '../tree/names';
import { Avatar } from './Avatar';
import { equip } from './cosmetics';

export type CollectionTab = 'badges' | 'icons' | 'gifts';
const TABS: readonly CollectionTab[] = ['badges', 'icons', 'gifts'];

/** Whose collection it is, with what their profile already says: the sheet reads the rest itself. */
export interface CollectionOwner {
  userId: string;
  /** What the sheet calls them, "Hamo’s collection"; unused on your own. */
  name: string;
  own: boolean;
  league?: ProfileLeague | null;
  tree?: TreeGlimpse | null;
  showcase?: readonly ShowcaseBadge[];
  earned?: readonly ProfileBadge[];
}

/** What the sheet shows in place of its tabs: one badge, the tree, the showcase choices, or one gift's people. */
type Step = { kind: 'badge'; key: string } | { kind: 'tree' } | { kind: 'customise' } | { kind: 'gift'; gift: CollectionGift; side: 'received' | 'sent' };

/** Tiles across a phone, and across a wider sheet. */
const COLUMNS = 4;
const COLUMNS_WIDE = 5;
const GAP = spacing.sm;

/**
 * A profile's collection in one sheet, as on the website (web/src/profile/CollectionSheet.tsx), opened from the badge
 * row beside the handle: badges (with the league and the tree), icons and gifts, each a grid of square tiles. Your own
 * adds what is still to earn, choosing the three badges shown first, and wearing an icon; somebody else's shows only
 * what they hold, with a way to your own. A tile opens its detail in place, with ‹ in the header to go back.
 */
export function CollectionSheet({
  visible,
  onClose,
  owner,
  fresh,
  onShowcase,
  onWorn,
}: {
  visible: boolean;
  onClose: () => void;
  owner: CollectionOwner;
  /** Badges earned since the app opened, marked "New" on their tiles. */
  fresh?: ReadonlySet<string>;
  /** Your own: the three were chosen again, so the row beside the handle follows. */
  onShowcase?: (keys: string[]) => void;
  /** Your own: another icon is worn, so the face follows. */
  onWorn?: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const { client, user, isGuest } = useAuth();
  const [tab, setTab] = useState<CollectionTab>('badges');
  const [step, setStep] = useState<Step | null>(null);
  // Somebody else's sheet can turn into yours, on the same tab, read from your own profile.
  const [yours, setYours] = useState<CollectionOwner | 'loading' | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTab('badges');
    setStep(null);
    setYours(null);
  }, [visible]);

  const viewYours = (): void => {
    if (!user) return;
    setYours('loading');
    setStep(null);
    void client
      .get<{ league?: ProfileLeague | null; tree?: TreeGlimpse | null; badges?: ShowcaseBadge[]; earnedBadges?: ProfileBadge[] }>(`/users/${user.id}`)
      .then((res) =>
        setYours(
          res.ok
            ? { userId: user.id, name: '', own: true, league: res.data.league, tree: res.data.tree, showcase: res.data.badges, earned: res.data.earnedBadges }
            : { userId: user.id, name: '', own: true },
        ),
      );
  };

  const whose = yours && yours !== 'loading' ? yours : owner;
  const title = whose.own || yours === 'loading' ? t('collection.title.own') : t('collection.title.other', { name: whose.name });
  // Yours is a tap away from anybody else's, once you have an account.
  const toYours = !whose.own && user && !isGuest && user.id !== whose.userId ? viewYours : undefined;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} onBack={step ? () => setStep(null) : undefined} detents={['large']} contentStyle={styles.sheet} testID="collection-sheet">
      {yours === 'loading' ? (
        <View style={styles.fill} accessibilityLabel={t('common.loading')}>
          <TileSkeletons />
        </View>
      ) : (
        <CollectionBody
          key={whose.userId}
          whose={whose}
          tab={tab}
          onTab={setTab}
          step={step}
          onStep={setStep}
          fresh={whose.own ? fresh : undefined}
          toYours={toYours}
          onClose={onClose}
          onShowcase={whose.userId === owner.userId ? onShowcase : undefined}
          onWorn={whose.userId === owner.userId ? onWorn : undefined}
        />
      )}
    </BottomSheet>
  );
}

/** One person's collection: the tabs and their grids, or a step in place of them. */
function CollectionBody({
  whose,
  tab,
  onTab,
  step,
  onStep,
  fresh,
  toYours,
  onClose,
  onShowcase,
  onWorn,
}: {
  whose: CollectionOwner;
  tab: CollectionTab;
  onTab: (tab: CollectionTab) => void;
  step: Step | null;
  onStep: (step: Step | null) => void;
  fresh?: ReadonlySet<string>;
  toYours?: () => void;
  onClose: () => void;
  onShowcase?: (keys: string[]) => void;
  onWorn?: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const { client } = useAuth();
  const [collection, setCollection] = useState<CollectionResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Yours only: every badge with its progress, for what is still to earn.
  const [page, setPage] = useState<BadgesResponse | null>(null);
  const tile = useTile();

  useEffect(() => {
    let active = true;
    setFailed(false);
    void client.get<CollectionResponse>(`/users/${encodeURIComponent(whose.userId)}/collection`).then((res) => {
      if (!active) return;
      if (res.ok && res.data?.icons && res.data.received) setCollection(res.data);
      else setFailed(true);
    });
    if (whose.own) {
      void getBadges(client).then((res) => {
        // An answer without its list is read as no answer, as an older server or a cut-off reply may send.
        if (active && res.ok && Array.isArray(res.data?.badges)) setPage(res.data);
      });
    }
    return () => {
      active = false;
    };
  }, [client, whose.userId, whose.own, attempt]);

  // The three shown first change at once as they are saved; a refusal puts them back and says why.
  const heard = (whose.showcase ?? []).map((b) => b.key);
  const showcasing = useIntents<'showcase', string[], { showcase: string[] }>(
    async (_key, keys) => {
      const res = await setShowcase(client, keys);
      if (res.ok) onShowcase?.(res.data.showcase);
      return res;
    },
    { answered: (answer) => answer.showcase, same: (a, b) => a.length === b.length && a.every((k, i) => k === b[i]) },
  );
  const showcase = showcasing.shown('showcase', heard);
  const earned = whose.earned ?? page?.badges.filter((b) => b.tier > 0).map(asProfileBadge);
  const all = earned ?? whose.showcase?.map((b) => ({ ...b, earnedAt: null, rarity: null })) ?? [];
  const ordered = badgesInOrder(
    showcase.flatMap((k) => all.filter((b) => b.key === k)),
    all,
  );

  const footer: ReactNode =
    step?.kind === 'customise' ? null : !step && whose.own && tab === 'badges' ? (
      <ClayButton label={t('collection.customise')} variant="outline" size="large" disabled={!page || ordered.length === 0} onPress={() => onStep({ kind: 'customise' })} />
    ) : !step && toYours ? (
      <ClayButton label={t('collection.viewYours')} variant="outline" size="large" onPress={toYours} />
    ) : null;

  if (step?.kind === 'customise' && page) {
    return (
      <CustomiseStep
        badges={page.badges}
        initial={showcase}
        onSave={(keys) => {
          showcasing.want('showcase', keys, heard);
          onStep(null);
        }}
      />
    );
  }

  return (
    <View style={styles.fill}>
      {step ? null : (
        <Segmented
          options={TABS}
          value={tab}
          onChange={onTab}
          labelOf={(v) => (v === 'badges' ? t('profile.badges') : v === 'icons' ? t('profile.stat.icons') : t('collection.gifts'))}
          groupLabel={whose.own ? t('collection.title.own') : t('collection.title.other', { name: whose.name })}
        />
      )}
      <SheetScrollView style={styles.fill} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View onLayout={tile.onLayout}>
          {step?.kind === 'badge' ? (
            <BadgeStep badge={ordered.find((b) => b.key === step.key) ?? null} view={page?.badges.find((b) => b.key === step.key) ?? null} />
          ) : step?.kind === 'tree' ? (
            <ProfileTree tree={whose.tree} />
          ) : step?.kind === 'gift' ? (
            <GiftStep gift={step.gift} side={step.side} onClose={onClose} />
          ) : tab === 'badges' ? (
            <BadgesTab whose={whose} ordered={ordered} page={page} fresh={fresh} size={tile.size} onStep={onStep} onClose={onClose} />
          ) : collection ? (
            tab === 'icons' ? (
              <IconsTab icons={collection.icons.items} own={whose.own} size={tile.size} onWorn={onWorn} onClose={onClose} />
            ) : (
              <GiftsTab collection={collection} own={whose.own} size={tile.size} onOpen={(gift, side) => onStep({ kind: 'gift', gift, side })} />
            )
          ) : failed ? (
            <ErrorRetry onRetry={() => setAttempt((n) => n + 1)} />
          ) : (
            <TileSkeletons size={tile.size} />
          )}
        </View>
      </SheetScrollView>
      {footer ? <View style={styles.foot}>{footer}</View> : null}
    </View>
  );
}

/** The tile's side once the sheet's column is measured: four across a phone, five across a wider sheet. */
function useTile(): { size: number; onLayout: (e: LayoutChangeEvent) => void } {
  const [width, setWidth] = useState(0);
  const columns = width >= 520 ? COLUMNS_WIDE : COLUMNS;
  return {
    size: width > 0 ? Math.floor((width - GAP * (columns - 1)) / columns) : 76,
    onLayout: (e) => setWidth(e.nativeEvent.layout.width),
  };
}

/** A badge from the badges page as a profile lists it. */
function asProfileBadge(b: BadgeView): ProfileBadge {
  return { key: b.key, family: b.family, tier: b.tier, tierKey: b.tierKey, earnedAt: b.tierEarnedAt[b.tier - 1] ?? b.earnedAt, rarity: b.rarity?.[b.tier - 1] ?? null };
}

/** Badges still to earn, nearest first; a secret not yet found stays out, as on the badges page it is only "???". */
function toEarn(page: BadgesResponse): BadgeView[] {
  return page.badges
    .filter((b) => b.tier === 0 && !b.hidden)
    .map((b, i) => ({ b, f: badgeViewFraction(b), i }))
    .sort((x, y) => y.f - x.f || x.i - y.i)
    .map((x) => x.b);
}

/** A section's heading and its content. */
function Section({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={styles.section}>
      <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Square tiles in rows that wrap, starting on the reading side. */
function Grid({ children }: { children: ReactNode }): React.JSX.Element {
  const dir = useDirection();
  return <View style={[styles.grid, { flexDirection: dir.row }]}>{children}</View>;
}

/** One square tile: a button where it opens something, a picture where it only shows. */
function Tile({
  size,
  label,
  onPress,
  on = false,
  locked = false,
  foot,
  children,
}: {
  size: number;
  label: string;
  onPress?: () => void;
  /** chosen: the icon worn now */
  on?: boolean;
  locked?: boolean;
  /** Laid over the tile's foot, undimmed: how far along a badge still to earn is. */
  foot?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  const box = [styles.tile, { width: size, height: size, backgroundColor: colors.controlTrack }, on ? { borderColor: colors.textPrimary, borderWidth: 2 } : null];
  if (!onPress) {
    return (
      <View style={box} accessible accessibilityRole="image" accessibilityLabel={label}>
        {children}
      </View>
    );
  }
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={on ? { selected: true } : undefined} style={box}>
      <View style={locked ? styles.dimmed : null}>{children}</View>
      {foot}
    </PressableScale>
  );
}

/** The badges tab: the league and the tree, the badges earned, and for your own what is still to earn. */
function BadgesTab({
  whose,
  ordered,
  page,
  fresh,
  size,
  onStep,
  onClose,
}: {
  whose: CollectionOwner;
  ordered: readonly ProfileBadge[];
  page: BadgesResponse | null;
  fresh?: ReadonlySet<string>;
  size: number;
  onStep: (step: Step) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const medal = Math.round(size * 0.6);
  const unearned = whose.own && page ? toEarn(page) : null;
  return (
    <View style={styles.tab}>
      <TopCards whose={whose} onTree={() => onStep({ kind: 'tree' })} onClose={onClose} />
      <Section title={t('profile.badges')}>
        {ordered.length > 0 ? (
          <Grid>
            {ordered.map((b) => {
              const tierCount = badgeDef(b.key)?.tiers.length ?? 1;
              const label = badgeLabel(t, { ...b, tierCount, hidden: false });
              return (
                <Tile key={b.key} size={size} label={label} onPress={() => onStep({ kind: 'badge', key: b.key })}>
                  <BadgeMedal badgeKey={b.key} tier={b.tier} tierCount={tierCount} size={medal} label="" />
                  {fresh?.has(b.key) ? <NewChip style={styles.fresh} /> : null}
                </Tile>
              );
            })}
          </Grid>
        ) : (
          <Text style={[styles.quiet, { color: colors.textSecondary }]}>{t('collection.noBadges')}</Text>
        )}
      </Section>
      {whose.own ? (
        <Section title={t('collection.unlock')}>
          {unearned ? (
            <Grid>
              {unearned.map((b) => {
                const left = progressText(t, b, (v) => formatNumber(v, locale));
                return (
                  <Tile
                    key={b.key}
                    size={size}
                    label={[badgeLabel(t, b), left].filter(Boolean).join('. ')}
                    onPress={() => onStep({ kind: 'badge', key: b.key })}
                    locked
                    foot={
                      <View style={styles.bar}>
                        <View style={[StyleSheet.absoluteFill, styles.barTrack, { backgroundColor: colors.textSecondary }]} />
                        <View style={[styles.barFill, { width: `${Math.max(6, badgeViewFraction(b) * 100)}%`, backgroundColor: scheme === 'dark' ? colors.textSecondary : colors.textPrimary }]} />
                      </View>
                    }
                  >
                    <View style={styles.lift}>
                      <BadgeMedal badgeKey={b.key} tier={0} tierCount={b.tierCount} size={medal} label="" />
                    </View>
                  </Tile>
                );
              })}
            </Grid>
          ) : (
            <TileSkeletons size={size} />
          )}
        </Section>
      ) : null}
    </View>
  );
}

/** The league and the tree side by side over the badges: yours lead to their pages, somebody else's tree opens here. */
function TopCards({ whose, onTree, onClose }: { whose: CollectionOwner; onTree: () => void; onClose: () => void }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const navigation = useNavigation<RootNavigation>();
  const tier = knownTier(whose.league?.tier);
  const tree = whose.tree;
  const drawn = tree && hasTreeArt(tree.species) ? tree : null;
  const plant = whose.own && tree === null;
  if (!tier && !drawn && !plant) return null;

  const card = (art: ReactNode, name: string, line: string, onPress?: () => void, testID?: string): React.JSX.Element => {
    const inside = (
      <>
        {art}
        <Text style={[styles.cardName, dir.text, { color: colors.textPrimary }]}>{name}</Text>
        <Text style={[styles.cardLine, dir.text, { color: colors.textSecondary }]}>{line}</Text>
      </>
    );
    const box = [styles.card, { backgroundColor: colors.controlTrack }];
    return onPress ? (
      <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [box, pressed && heldDim]}>
        {inside}
      </Pressable>
    ) : (
      <View style={box} accessible testID={testID}>
        {inside}
      </View>
    );
  };
  // Your own cards lead away from the sheet, so it closes first.
  const go = (to: 'League' | 'Tree') => () => {
    onClose();
    navigation.navigate(to);
  };

  return (
    <View style={[styles.cards, { flexDirection: dir.row }]}>
      {tier
        ? card(
            <LeagueEmblem tier={tier} size={40} label="" />,
            leagueName(t, tier),
            [leagueMeaning(t, tier), t('collection.leagueLine', { n: formatNumber(LEAGUE_TIERS.indexOf(tier) + 1, locale), total: formatNumber(LEAGUE_TIERS.length, locale) })]
              .filter(Boolean)
              .join(' · '),
            whose.own ? go('League') : undefined,
            'collection-league',
          )
        : null}
      {drawn
        ? card(
            <TreeArt species={drawn.species} stage={drawn.stage} health={drawn.health} size={40} />,
            treeNamed(t, drawn.species).name,
            `${stageName(t, drawn.stage)} · ${healthName(t, drawn.health)}`,
            whose.own ? go('Tree') : onTree,
            'collection-tree',
          )
        : plant
          ? card(<TreeArt species="beru" stage={1} size={40} />, t('tree.profile.title'), t('tree.card.plant'), go('Tree'), 'collection-tree')
          : null}
    </View>
  );
}

/**
 * One badge up close: its name and meaning, what it is for, its tier, when it was earned and how rare that is. Yours
 * adds how far the next tier is; a badge still to earn says what is left.
 */
function BadgeStep({ badge, view }: { badge: ProfileBadge | null; view: BadgeView | null }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const shown = view ?? badge;
  if (!shown) return null;
  const tierCount = view?.tierCount ?? badgeDef(shown.key)?.tiers.length ?? 1;
  const at = badge?.earnedAt ?? (view && view.tier > 0 ? (view.tierEarnedAt[view.tier - 1] ?? view.earnedAt) : null);
  const rarity = badge?.rarity ?? (view && view.tier > 0 ? (view.rarity?.[view.tier - 1] ?? null) : null);
  const num = (v: number): string => formatNumber(v, locale);
  const progress = view ? progressText(t, view, num) : null;
  const meaning = badgeMeaning(t, shown.key);
  const facts: Array<{ icon: React.ComponentProps<typeof Icon>['name']; text: string }> = [
    ...(shown.tier > 0 && shown.tierKey && tierCount > 1 ? [{ icon: 'medal' as const, text: tierLabel(t, shown.tierKey) }] : []),
    ...(at ? [{ icon: 'check' as const, text: t('badges.earnedOn', { date: dateOf(at, locale) }) }] : []),
    ...(rarity != null ? [{ icon: 'sparkle' as const, text: rarityText(t, rarity, num) }] : []),
  ];
  return (
    <View style={styles.detail}>
      <BadgeMedal badgeKey={shown.key} tier={shown.tier} tierCount={tierCount} size={112} label={badgeLabel(t, { ...shown, tierCount, hidden: false })} />
      <Text style={[styles.detailName, { color: colors.textPrimary }]} accessibilityRole="header">
        {badgeName(t, shown.key)}
      </Text>
      {meaning ? <Text style={[styles.centre, { color: colors.textSecondary }]}>{meaning}</Text> : null}
      <Text style={[styles.centre, { color: colors.textPrimary }]}>{t(badgeTextKey(shown.key, 'how'))}</Text>
      {facts.map((f) => (
        <View key={f.icon} style={styles.fact}>
          <Icon name={f.icon} size={16} tone="secondary" />
          <Text style={[styles.factText, { color: colors.textSecondary }]}>{f.text}</Text>
        </View>
      ))}
      {progress && view ? (
        <View style={styles.fact}>
          <View style={[styles.bar, styles.barWide]}>
            <View style={[StyleSheet.absoluteFill, styles.barTrack, { backgroundColor: colors.textSecondary }]} />
            <View style={[styles.barFill, { width: `${Math.max(4, badgeViewFraction(view) * 100)}%`, backgroundColor: colors.textSecondary }]} />
          </View>
          <Text style={[styles.factText, { color: colors.textSecondary }]}>{progress}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Choosing the three shown first, with the badges page's own choices, saved together. */
function CustomiseStep({ badges, initial, onSave }: { badges: readonly BadgeView[]; initial: readonly string[]; onSave: (keys: string[]) => void }): React.JSX.Element {
  const { t } = useI18n();
  const [keys, setKeys] = useState<string[]>(initial.filter((k) => badges.some((b) => b.key === k && b.tier > 0)));
  return (
    <View style={styles.fill}>
      <SheetScrollView style={styles.fill} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <ShowcaseChoices badges={badges} keys={keys} onChange={setKeys} />
      </SheetScrollView>
      <View style={styles.foot}>
        <ClayButton label={t('badges.showcaseSave')} tone="primary" size="large" onPress={() => onSave(keys)} />
      </View>
    </View>
  );
}

/**
 * The icons they own, the worn one marked, with who gave it where it was a gift; yours are worn with a tap, and tapping
 * the worn one takes it off.
 */
function IconsTab({
  icons,
  own,
  size,
  onWorn,
  onClose,
}: {
  icons: CollectionResponse['icons']['items'];
  own: boolean;
  size: number;
  onWorn?: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  // What the server last said is worn: the list as read, then each change it took, so the mark stays once saved.
  const [saved, setSaved] = useState<{ sku: string | null } | null>(null);
  const heard = saved ? saved.sku : (icons.find((i) => i.worn)?.sku ?? null);
  const wearing = useIntents<'icon', string | null>(async (_key, sku) => {
    const res = await equip(client, 'icon', sku);
    if (res.ok) {
      setSaved({ sku });
      onWorn?.();
    }
    return res;
  });
  const worn = wearing.shown('icon', heard);

  if (icons.length === 0) {
    return (
      <View style={styles.none}>
        <Text style={[styles.quiet, dir.text, { color: colors.textSecondary }]}>{t('collection.noIcons')}</Text>
        {own ? (
          <ClayButton
            label={t('collection.toShop')}
            variant="outline"
            onPress={() => {
              onClose();
              navigation.navigate('Shop');
            }}
          />
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.section}>
      {own ? <Text style={[styles.quiet, dir.text, { color: colors.textSecondary }]}>{t('collection.wearHint')}</Text> : null}
      <Grid>
        {icons.map((icon) => {
          const on = icon.sku === worn;
          const art = assetUrl(icon.assetUrl);
          const giver = on && icon.giftedBy ? (icon.giftedBy.displayName ?? icon.giftedBy.username) : null;
          return (
            <View key={icon.sku} style={[styles.cell, { width: size }]}>
              <Tile size={size} label={on ? `${icon.name}, ${t('collection.wearing')}` : icon.name} on={on} onPress={own ? () => wearing.want('icon', on ? null : icon.sku, heard) : undefined}>
                {art ? <Image source={{ uri: art }} style={{ width: size * 0.66, height: size * 0.66 }} resizeMode="contain" accessibilityIgnoresInvertColors /> : <Icon name="sparkle" size={28} tone="secondary" />}
              </Tile>
              {on ? (
                <Text style={[styles.worn, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.fixedBox}>
                  {t('collection.wearing')}
                </Text>
              ) : null}
              {giver ? (
                <Text style={[styles.wornFrom, { color: colors.textSecondary }]} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.fixedBox}>
                  {t('collection.giftFrom', { name: giver })}
                </Text>
              ) : null}
            </View>
          );
        })}
      </Grid>
    </View>
  );
}

/** Gifts received, as items with how many of each, opening to who gave them; your own adds what you sent. */
function GiftsTab({
  collection,
  own,
  size,
  onOpen,
}: {
  collection: CollectionResponse;
  own: boolean;
  size: number;
  onOpen: (gift: CollectionGift, side: 'received' | 'sent') => void;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <View style={styles.tab}>
      <GiftGrid title={t('collection.received')} empty={t('collection.noReceived')} gifts={collection.received.items} size={size} onOpen={(g) => onOpen(g, 'received')} giver />
      {own && collection.sent ? <GiftGrid title={t('collection.sent')} empty={t('collection.noSent')} gifts={collection.sent.items} size={size} onOpen={(g) => onOpen(g, 'sent')} /> : null}
    </View>
  );
}

function GiftGrid({
  title,
  empty,
  gifts,
  size,
  onOpen,
  giver = false,
}: {
  title: string;
  empty: string;
  gifts: readonly CollectionGift[];
  size: number;
  onOpen: (gift: CollectionGift) => void;
  /** The newest giver's face in the tile's corner, where the reader may see who it is. */
  giver?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  return (
    <Section title={title}>
      {gifts.length === 0 ? (
        <Text style={[styles.quiet, dir.text, { color: colors.textSecondary }]}>{empty}</Text>
      ) : (
        <Grid>
          {gifts.map((g) => {
            const times = t('collection.times', { count: formatNumber(g.count, locale) });
            const newest = giver ? g.people[0]?.person : null;
            return (
              <Tile key={g.sku} size={size} label={g.count > 1 ? `${g.name}, ${times}` : g.name} onPress={() => onOpen(g)}>
                <ItemArt url={g.assetUrl} size={size} lifted={!!newest || g.count > 1} />
                {newest ? (
                  <View style={[styles.giver, dir.rtl ? styles.giverRtl : null, { borderColor: colors.background }]}>
                    <Avatar name="" size={20} photoUrl={newest.avatarUrl} />
                  </View>
                ) : null}
                {g.count > 1 ? (
                  <View style={[styles.count, dir.rtl ? styles.countRtl : null, { backgroundColor: colors.background }]}>
                    <Text style={[styles.countText, { color: colors.textPrimary }]} maxFontSizeMultiplier={fontScaleCap.fixedBox}>
                      {times}
                    </Text>
                  </View>
                ) : null}
              </Tile>
            );
          })}
        </Grid>
      )}
    </Section>
  );
}

/**
 * A gift item's picture, or the gift glyph for an item drawn without one. `lifted` leaves the tile's foot to the giver's
 * face and the count, so they sit beside the picture rather than over it.
 */
function ItemArt({ url, size, lifted = false }: { url: string | null; size: number; lifted?: boolean }): React.JSX.Element {
  const art = assetUrl(url);
  const side = size * (lifted ? 0.56 : 0.66);
  const lift = lifted ? { marginBottom: spacing.md - 4 } : null;
  return art ? (
    <Image source={{ uri: art }} style={[{ width: side, height: side, borderRadius: radii.sm }, lift]} resizeMode="contain" accessibilityIgnoresInvertColors />
  ) : (
    <View style={lift}>
      <Icon name="gift" size={28} tone="secondary" />
    </View>
  );
}

/**
 * One gift item and each time it came, or went, newest first: "Gift from Hamo" with their face, opening their profile.
 * Somebody the reader may not see is "a Hevalo member", with no face and no link.
 */
function GiftStep({ gift, side, onClose }: { gift: CollectionGift; side: 'received' | 'sent'; onClose: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const navigation = useNavigation<RootNavigation>();
  const left = gift.count - gift.people.length;
  return (
    <View style={styles.detail}>
      <View style={[styles.tile, { width: 96, height: 96, backgroundColor: colors.controlTrack }]}>
        <ItemArt url={gift.assetUrl} size={96} />
      </View>
      <Text style={[styles.detailName, { color: colors.textPrimary }]} accessibilityRole="header">
        {gift.name}
      </Text>
      <Text style={[styles.centre, { color: colors.textSecondary }]}>{t('collection.times', { count: formatNumber(gift.count, locale) })}</Text>
      <View style={styles.people}>
        {gift.people.map((p, i) => {
          const name = p.person ? (p.person.displayName ?? p.person.username) : null;
          const line = name
            ? t(side === 'received' ? 'collection.giftFrom' : 'collection.giftTo', { name })
            : t(side === 'received' ? 'collection.giftFromMember' : 'collection.giftToMember');
          const inside = (
            <>
              {p.person ? (
                <Avatar name="" size={36} photoUrl={p.person.avatarUrl} />
              ) : (
                <View style={[styles.member, { backgroundColor: colors.controlTrack }]}>
                  <Icon name="gift" size={18} tone="secondary" />
                </View>
              )}
              <Text style={[styles.personName, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
                {line}
              </Text>
              <Text style={[styles.factText, { color: colors.textSecondary }]}>{dateOf(p.at, locale)}</Text>
            </>
          );
          const row = [styles.person, { flexDirection: dir.row }, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator } : null];
          const person = p.person;
          return person ? (
            <Pressable
              key={`${person.id}-${p.at}-${i}`}
              onPress={() => {
                onClose();
                navigation.navigate('UserProfile', { userId: person.id });
              }}
              accessibilityRole="link"
              style={({ pressed }) => [row, pressed && heldDim]}
            >
              {inside}
            </Pressable>
          ) : (
            <View key={`member-${p.at}-${i}`} style={row}>
              {inside}
            </View>
          );
        })}
      </View>
      {left > 0 ? <Text style={[styles.factText, { color: colors.textSecondary }]}>{t('collection.andMore', { count: formatNumber(left, locale) })}</Text> : null}
    </View>
  );
}

/** A row of tiles in grey, the grid's own shape. */
function TileSkeletons({ size = 76 }: { size?: number }): React.JSX.Element {
  return (
    <Grid>
      {Array.from({ length: COLUMNS }, (_, i) => (
        <Skeleton key={i} width={size} height={size} radius={radii.md} />
      ))}
    </Grid>
  );
}

function dateOf(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  // The sheet keeps its height on every tab, its foot pinned, and the room left over is calm space.
  sheet: { flex: 1, gap: spacing.md },
  fill: { flex: 1, gap: spacing.md },
  body: { paddingBottom: spacing.lg },
  foot: { paddingTop: spacing.sm },
  tab: { gap: spacing.lg },
  section: { gap: spacing.sm + 2 },
  heading: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  quiet: { fontSize: typography.sizes.text, lineHeight: 22 },
  none: { gap: spacing.md, alignItems: 'flex-start' },
  grid: { flexWrap: 'wrap', gap: GAP },
  cell: { gap: spacing.xs },
  tile: { alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, overflow: 'hidden' },
  dimmed: { opacity: 0.6 },
  // A medal still to earn sits a little higher, leaving the tile's foot to its progress.
  lift: { marginBottom: spacing.sm },
  fresh: { position: 'absolute', top: -2, end: -14 },
  bar: { position: 'absolute', left: '16%', right: '16%', bottom: 10, height: 4, borderRadius: radii.pill, overflow: 'hidden' },
  barWide: { position: 'relative', left: undefined, right: undefined, bottom: undefined, width: 96 },
  // The track is the fill's own colour, faint, so it shows on any tile in either theme.
  barTrack: { opacity: 0.25 },
  barFill: { height: '100%', borderRadius: radii.pill },
  worn: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, textAlign: 'center' },
  wornFrom: { fontSize: typography.sizes.text, lineHeight: 20, textAlign: 'center' },
  count: { position: 'absolute', bottom: 5, right: 5, paddingHorizontal: 6, borderRadius: radii.pill },
  countRtl: { right: undefined, left: 5 },
  countText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  giver: { position: 'absolute', bottom: 5, left: 5, borderWidth: 2, borderRadius: radii.pill },
  giverRtl: { left: undefined, right: 5 },
  cards: { gap: GAP, flexWrap: 'wrap' },
  card: { flexGrow: 1, flexBasis: 140, minHeight: 64, gap: spacing.xs + 2, padding: spacing.md - 4, borderRadius: radii.lg },
  cardName: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  cardLine: { fontSize: typography.sizes.text, lineHeight: 21 },
  detail: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xs },
  detailName: { fontSize: typography.sizes.title, fontWeight: typography.weights.bold, textAlign: 'center' },
  centre: { fontSize: typography.sizes.text, lineHeight: 22, textAlign: 'center' },
  fact: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  factText: { fontSize: typography.sizes.text },
  people: { alignSelf: 'stretch', marginTop: spacing.sm },
  person: { alignItems: 'center', gap: spacing.md - 4, minHeight: 52 },
  personName: { flex: 1, minWidth: 0, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  member: { width: 36, height: 36, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
