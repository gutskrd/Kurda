import { useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { badgeDef, hasTreeArt, type ProfileLeague, type ShowcaseBadge, type TreeGlimpse } from '@kurda/shared';
import { reachRoom } from '../a11y/a11y';
import { badgeLabel, badgeMeaning, badgeName } from '../badges/format';
import { NewChip } from '../badges/NewChip';
import { useI18n } from '../i18n/I18nContext';
import { formatCompact, formatNumber } from '../i18n/format';
import { knownTier, leagueLabel, leagueMeaning, leagueName } from '../leagues/format';
import type { RootNavigation } from '../navigation/rootStack';
import { BadgeMedal, LeagueEmblem } from '../ranks/art';
import { useDirection } from '../reports/direction';
import { BottomSheet } from '../theme/BottomSheet';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { ProfileTree } from '../tree/ProfileTree';
import { TreeArt } from '../tree/TreeArt';
import { treeNamed } from '../tree/names';
import type { FavoriteRef } from './types';

/** A tile's ring, and the art inside its hairline of air. */
const RING = 68;
const TILE = 76;
/** The room left above and below the row for the rings' reach. */
const ROOM = spacing.sm;

/** One round tile: a page it opens, or a sheet that says more about it. */
interface Highlight {
  key: string;
  label: string;
  art: ReactNode;
  onOpen?: () => void;
  sheet?: ReactNode;
  /** A badge earned since the app opened wears a "New" chip. */
  fresh?: boolean;
  /** The badge case: how many badges, on a chip at the ring's corner. */
  count?: string;
  /** What a screen reader hears, where the label alone does not say it all. */
  spoken?: string;
}

/** A badge or a league, large, with its name and what it means. */
function Shown({ art, title, meaning, action }: { art: ReactNode; title: string; meaning?: string | null; action?: ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.shown}>
      {art}
      <Text style={[styles.shownTitle, { color: colors.textPrimary }]} accessibilityRole="header">
        {title}
      </Text>
      {meaning ? <Text style={[styles.shownText, { color: colors.textSecondary }]}>{meaning}</Text> : null}
      {action}
    </View>
  );
}

/** Where each of up to three fanned badges sits in the case, as a share of its size: across, down, turn and scale. */
const FAN: Record<number, readonly (readonly [number, number, number, number])[]> = {
  1: [[0, 0, 0, 0.72]],
  // Back to front: the first badge is drawn last, over the others.
  2: [
    [0.18, -0.04, 14, 0.56],
    [-0.18, -0.04, -14, 0.56],
  ],
  3: [
    [-0.2, -0.1, -16, 0.52],
    [0.2, -0.1, 16, 0.52],
    [0, 0.06, 0, 0.64],
  ],
};

/** The badge case's picture: up to three chosen badges fanned like a hand of cards; the medal glyph while none is chosen. */
function BadgeFan({ badges, size }: { badges: readonly ShowcaseBadge[]; size: number }): React.JSX.Element {
  const three = badges.slice(0, 3);
  if (three.length === 0) {
    return (
      <View style={[styles.fan, styles.fanEmpty, { width: size, height: size }]}>
        <Icon name="medal" size={Math.round(size * 0.45)} tone="secondary" />
      </View>
    );
  }
  // The slots are listed back to front, so the badges are laid in that order: the first one last.
  const order = three.length === 1 ? [0] : three.length === 2 ? [1, 0] : [1, 2, 0];
  return (
    <View style={[styles.fan, { width: size, height: size }]}>
      {order.map((index, slot) => {
        const b = three[index]!;
        const [dx, dy, turn, k] = FAN[three.length]![slot]!;
        const medal = Math.round(size * k);
        const tierCount = badgeDef(b.key)?.tiers.length ?? 4;
        return (
          <View
            key={b.key}
            style={{
              position: 'absolute',
              left: (size - medal) / 2 + dx * size,
              top: (size - medal) / 2 + dy * size,
              transform: [{ rotate: `${turn}deg` }],
            }}
          >
            <BadgeMedal badgeKey={b.key} tier={b.tier} tierCount={tierCount} size={medal} label="" />
          </View>
        );
      })}
    </View>
  );
}

/** How many badges, on a chip cut out of the page at the ring's corner, or beside the title in the sheet. */
function CountChip({ count, inline = false }: { count: string; inline?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.count, inline ? null : styles.countOnRing, { backgroundColor: colors.textPrimary, borderColor: inline ? 'transparent' : colors.background }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.countText, { color: colors.background }]}>{count}</Text>
    </View>
  );
}

/**
 * What a profile shows off, as a row of round tiles under the actions, as on the website
 * (web/src/profile/ProfileHighlights.tsx): the badge case, the tree, the league and the favourite poem and story. Your
 * own open their pages; somebody else's open a sheet with their names and meanings. Nothing shows when there is nothing
 * to show.
 */
export function ProfileHighlights({
  tree,
  badges,
  earned,
  league,
  favPoem,
  favStory,
  fresh,
  own = false,
}: {
  tree?: TreeGlimpse | null;
  /** The badges chosen to show. */
  badges?: readonly ShowcaseBadge[];
  /** How many badges have been earned; left out where the server does not say. */
  earned?: number | null;
  league?: ProfileLeague | null;
  favPoem?: FavoriteRef | null;
  favStory?: FavoriteRef | null;
  /** Badges earned since the app opened (`useFreshBadges`). */
  fresh?: ReadonlySet<string>;
  own?: boolean;
}): React.JSX.Element | null {
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const strip = useRef<ScrollView>(null);
  const [open, setOpen] = useState<Highlight | null>(null);
  const items: Highlight[] = [];

  // The badge case leads: the chosen badges fanned in one ring with how many have been earned at its corner, as on the
  // website. Yours opens the badges, where the three on show are chosen; somebody else's lays out the ones they show.
  const shown = badges ?? [];
  if (own || shown.length > 0 || (earned ?? 0) > 0) {
    // No chip while there are none: an empty case invites, a nought would only look bare.
    const count = earned ? formatCompact(earned, locale) : undefined;
    items.push({
      key: 'badges',
      label: t('profile.badges'),
      spoken: earned != null ? `${t('profile.badges')}: ${formatNumber(earned, locale)}` : undefined,
      art: <BadgeFan badges={shown} size={RING - 8} />,
      count,
      fresh: shown.some((b) => fresh?.has(b.key)),
      ...(own
        ? { onOpen: () => navigation.navigate('Badges') }
        : {
            sheet: (
              <View style={styles.shown}>
                <BadgeFan badges={shown} size={128} />
                <View style={[styles.caseTitle, { flexDirection: dir.row }]}>
                  <Text style={[styles.shownTitle, { color: colors.textPrimary }]} accessibilityRole="header">
                    {t('profile.badges')}
                  </Text>
                  {count ? <CountChip count={count} inline /> : null}
                </View>
                {shown.map((b) => {
                  const tierCount = badgeDef(b.key)?.tiers.length ?? 4;
                  return (
                    <View key={b.key} style={[styles.caseRow, { flexDirection: dir.row }]}>
                      <BadgeMedal badgeKey={b.key} tier={b.tier} tierCount={tierCount} size={48} label={badgeLabel(t, { key: b.key, tier: b.tier, tierKey: b.tierKey, tierCount, hidden: false })} />
                      <View style={styles.caseText}>
                        <Text style={[styles.caseName, dir.text, { color: colors.textPrimary }]}>{badgeName(t, b.key)}</Text>
                        {badgeMeaning(t, b.key) ? <Text style={[styles.caseMeaning, dir.text, { color: colors.textSecondary }]}>{badgeMeaning(t, b.key)}</Text> : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ),
          }),
    });
  }

  if (tree && hasTreeArt(tree.species)) {
    const named = treeNamed(t, tree.species);
    items.push({
      key: 'tree',
      label: named.name,
      art: <TreeArt species={tree.species} stage={tree.stage} health={tree.health} size={56} />,
      ...(own ? { onOpen: () => navigation.navigate('Tree') } : { sheet: <ProfileTree tree={tree} /> }),
    });
  } else if (own && tree === null) {
    items.push({ key: 'tree', label: t('tree.profile.title'), art: <TreeArt species="beru" stage={1} size={56} />, onOpen: () => navigation.navigate('Tree') });
  }

  const tier = knownTier(league?.tier);
  if (tier) {
    items.push({
      key: 'league',
      label: leagueName(t, tier),
      art: <LeagueEmblem tier={tier} size={52} label="" />,
      // Your own opens the league, where it stands this week; somebody else's says what it is.
      ...(own
        ? { onOpen: () => navigation.navigate('League') }
        : { sheet: <Shown art={<LeagueEmblem tier={tier} size={112} label={leagueLabel(t, tier)} />} title={leagueName(t, tier)} meaning={leagueMeaning(t, tier)} /> }),
    });
  }

  // A favourite opens the post itself.
  if (favPoem) items.push({ key: 'poem', label: favPoem.title, art: <Icon name="quotes" size={28} />, onOpen: () => navigation.navigate('LibraryPost', { postId: favPoem.id }) });
  if (favStory) items.push({ key: 'story', label: favStory.title, art: <Icon name="story" size={28} />, onOpen: () => navigation.navigate('LibraryPost', { postId: favStory.id }) });

  if (items.length === 0) return null;
  const rr = reachRoom(ROOM);

  return (
    <>
      <ScrollView
        ref={strip}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() => {
          // Right to left, the first tile is on the right.
          if (dir.row === 'row-reverse') strip.current?.scrollToEnd({ animated: false });
        }}
        style={[styles.strip, rr.scroller]}
        contentContainerStyle={[rr.content, styles.row, { flexDirection: dir.row }, dir.row === 'row-reverse' ? styles.rowMirrored : null]}
        testID="profile-highlights"
      >
        {items.map((item, i) => (
          <PressableScale
            key={item.key}
            onPress={item.onOpen ?? (() => setOpen(item))}
            accessibilityRole="button"
            accessibilityLabel={item.spoken ?? item.label}
            style={styles.tile}
          >
            <View style={[styles.ring, { borderColor: colors.clayBorder }]}>
              <View style={[styles.art, { backgroundColor: colors.controlTrack }]}>{item.art}</View>
              {item.fresh ? <NewChip delayMs={120 + i * 80} style={styles.fresh} /> : null}
              {item.count ? <CountChip count={item.count} /> : null}
            </View>
            <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.label}
            </Text>
          </PressableScale>
        ))}
      </ScrollView>
      <BottomSheet visible={open !== null} onClose={() => setOpen(null)} contentStyle={styles.sheet}>
        {open?.sheet ?? null}
      </BottomSheet>
    </>
  );
}

/** The row while the highlights load: two rings with their labels, as most profiles show (badges and tree). */
export function ProfileHighlightsSkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const rr = reachRoom(ROOM);
  return (
    <View style={[styles.strip, rr.scroller]}>
      <View style={[rr.content, styles.row, { flexDirection: dir.row }]}>
        {[48, 32].map((label, i) => (
          <View key={i} style={styles.tile}>
            <View style={[styles.ring, { borderColor: colors.clayBorder }]}>
              <Skeleton height="100%" radius={radii.pill} />
            </View>
            <SkeletonText size={typography.sizes.text} width={label} align="center" />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Edge to edge, so the row scrolls under the page's gutter.
  strip: { marginHorizontal: -layout.gutter },
  row: { gap: spacing.md - 2, paddingHorizontal: layout.gutter },
  rowMirrored: { flexGrow: 1 },
  tile: { width: TILE, alignItems: 'center', gap: 6 },
  // A ring with a hairline of air inside it, round the art.
  ring: { width: RING, height: RING, padding: 3, borderWidth: 1, borderRadius: radii.pill },
  art: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: radii.pill },
  fresh: { position: 'absolute', top: -6, end: -8 },
  label: { maxWidth: TILE, fontSize: typography.sizes.text },
  sheet: { paddingBottom: spacing.lg },
  shown: { alignItems: 'center', gap: spacing.sm + 2, paddingTop: spacing.sm },
  shownTitle: { fontSize: typography.sizes.title, fontWeight: typography.weights.bold, textAlign: 'center' },
  shownText: { fontSize: typography.sizes.text, lineHeight: 22, textAlign: 'center' },
  fan: { position: 'relative' },
  fanEmpty: { alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 26, paddingHorizontal: spacing.sm, paddingVertical: 1, borderWidth: 2, borderRadius: radii.pill, alignItems: 'center' },
  countOnRing: { position: 'absolute', bottom: -4, end: -8 },
  countText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  caseTitle: { alignItems: 'center', gap: spacing.sm },
  caseRow: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.md - 4 },
  caseText: { flex: 1, minWidth: 0 },
  caseName: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  caseMeaning: { fontSize: typography.sizes.text, lineHeight: 22 },
});
