import { useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { badgeDef, hasTreeArt, type ProfileLeague, type ShowcaseBadge, type TreeGlimpse } from '@kurda/shared';
import { reachRoom } from '../a11y/a11y';
import { badgeLabel, badgeMeaning, badgeName } from '../badges/format';
import { NewChip } from '../badges/NewChip';
import { useI18n } from '../i18n/I18nContext';
import { knownTier, leagueLabel, leagueMeaning, leagueName } from '../leagues/format';
import type { RootNavigation } from '../navigation/rootStack';
import { BadgeMedal, LeagueEmblem } from '../ranks/art';
import { useDirection } from '../reports/direction';
import { BottomSheet } from '../theme/BottomSheet';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
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
  add?: boolean;
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

/**
 * What a profile shows off, as a row of round tiles under the actions, as on the website
 * (web/src/profile/ProfileHighlights.tsx): the tree, the league, the chosen badges and the favourite poem and story.
 * Your own row starts with the way to choose badges, and your tree and league open their pages; somebody else's open a
 * sheet with their name and meaning. Nothing shows when there is nothing to show.
 */
export function ProfileHighlights({
  tree,
  badges,
  league,
  favPoem,
  favStory,
  fresh,
  own = false,
}: {
  tree?: TreeGlimpse | null;
  badges?: readonly ShowcaseBadge[];
  league?: ProfileLeague | null;
  favPoem?: FavoriteRef | null;
  favStory?: FavoriteRef | null;
  /** Badges earned since the app opened (`useFreshBadges`). */
  fresh?: ReadonlySet<string>;
  own?: boolean;
}): React.JSX.Element | null {
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const strip = useRef<ScrollView>(null);
  const [open, setOpen] = useState<Highlight | null>(null);
  const items: Highlight[] = [];

  if (own) items.push({ key: 'choose', label: t('profile.badges'), art: <Icon name="plus" size={28} />, onOpen: () => navigation.navigate('Badges'), add: true });

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

  for (const b of badges ?? []) {
    const tierCount = badgeDef(b.key)?.tiers.length ?? 4;
    const said = badgeLabel(t, { key: b.key, tier: b.tier, tierKey: b.tierKey, tierCount, hidden: false });
    items.push({
      key: `badge:${b.key}`,
      label: badgeName(t, b.key),
      art: <BadgeMedal badgeKey={b.key} tier={b.tier} tierCount={tierCount} size={56} label="" />,
      fresh: fresh?.has(b.key),
      sheet: (
        <Shown
          art={<BadgeMedal badgeKey={b.key} tier={b.tier} tierCount={tierCount} size={128} label={said} shine="once" />}
          title={badgeName(t, b.key)}
          meaning={badgeMeaning(t, b.key)}
          action={
            own ? (
              <ClayButton
                label={t('profile.showcaseChoose')}
                onPress={() => {
                  setOpen(null);
                  navigation.navigate('Badges');
                }}
              />
            ) : undefined
          }
        />
      ),
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
            accessibilityLabel={item.label}
            style={styles.tile}
          >
            <View style={[styles.ring, { borderColor: colors.clayBorder }]}>
              <View style={[styles.art, { backgroundColor: item.add ? 'transparent' : colors.controlTrack }]}>{item.art}</View>
              {item.fresh ? <NewChip delayMs={120 + i * 80} style={styles.fresh} /> : null}
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
});
