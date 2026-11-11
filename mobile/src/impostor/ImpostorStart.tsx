import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COUCH_WAYS, impostorCategoriesInOrder, impostorCategoryTone, impostorWayTone, meaningIn, type CouchWay } from '@kurda/shared';
import { useI18n } from '../i18n/I18nContext';
import { InviteSheet } from '../play/InviteSheet';
import { JoinCodeCard } from '../play/JoinByCode';
import { usePartyOffer } from '../party/offer';
import { useDirection } from '../reports/direction';
import { GlassCard } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Loading } from '../theme/Loading';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { CategoryArt, EmblemArt, WayArt } from './art';
import { useImpostorCategories } from './categories';
import { kurdishStyle } from './ImpostorBoard';
import { Cloth, GoldButton } from './parts';
import { TABLE } from './table';
import { WAY_KEY, WAY_NOTE } from './ways';

const STEPS = ['games.impostor.how.card', 'games.impostor.how.clues', 'games.impostor.how.vote'] as const;

/** A choice made on the start, which the setup opens with. */
export interface CouchAsk {
  way?: CouchWay;
  category?: string;
}

/**
 * The start of Kurdish Impostor on the phone: what the game is in one line,
 * and one thing to press.
 *
 * It is laid out in the order a person decides: the hand of cards on the
 * table and "Play on this phone" first, since most games begin with people
 * already in a room; under it the three ways to play and the categories, each
 * of which opens the setup with that choice made; then how a round goes, and
 * a code from someone else. A game with friends who are elsewhere is the
 * second button on the table. Nothing is offered where there are no approved
 * word cards, and the screen says so plainly then.
 */
export function ImpostorStart({ onCouch }: { onCouch: (ask?: CouchAsk) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const offer = usePartyOffer('impostor');
  const [inviting, setInviting] = useState(false);
  const dialect = offer?.[0]?.dialect ?? null;
  const couch = useImpostorCategories(dialect);
  if (offer === null) return <Loading style={styles.loading} />;
  if (dialect === null) {
    return (
      <GlassCard>
        <View style={styles.none}>
          <Icon name="people" size={40} tone="primary" />
          <Text style={[styles.body, styles.centre, { color: colors.textSecondary }]}>{t('games.impostor.notOffered')}</Text>
        </View>
      </GlassCard>
    );
  }
  const categories = impostorCategoriesInOrder(couch?.difficulties[0]?.categories ?? []);
  const script = kurdishStyle(dialect);
  return (
    <>
      <Cloth style={styles.hero}>
        <EmblemArt emblem="cards" size={168} />
        <Text style={styles.meta}>{t('games.impostor.hero.meta')}</Text>
        <Text accessibilityRole="header" style={styles.tagline}>
          {t('games.impostor.hero.tagline')}
        </Text>
        <GoldButton label={t('games.couch.open')} icon="audio-play" onPress={() => onCouch()} style={styles.play} />
        <Pressable
          onPress={() => setInviting(true)}
          accessibilityRole="button"
          accessibilityLabel={t('games.party.withFriends')}
          style={({ pressed }) => [styles.friends, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Icon name="people" size={18} color={TABLE.ink} />
          <Text style={styles.friendsText}>{t('games.party.withFriends')}</Text>
        </Pressable>
      </Cloth>

      <View style={styles.shelf}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
          {t('games.impostor.ways')}
        </Text>
        {COUCH_WAYS.map((way) => (
          <Pressable
            key={way}
            onPress={() => onCouch({ way })}
            accessibilityRole="button"
            accessibilityLabel={`${t(WAY_KEY[way])}. ${t(WAY_NOTE[way])}`}
            style={({ pressed }) => [styles.way, { flexDirection: dir.row, backgroundColor: `${impostorWayTone(way)}26`, opacity: pressed ? 0.8 : 1 }]}
          >
            <View style={[styles.wayArt, { backgroundColor: `${impostorWayTone(way)}3a` }]}>
              <WayArt way={way} size={60} />
            </View>
            <View style={styles.wayText}>
              <Text style={[styles.wayName, dir.text, { color: colors.textPrimary }]}>{t(WAY_KEY[way])}</Text>
              <Text style={[styles.wayNote, dir.text, { color: colors.textSecondary }]}>{t(WAY_NOTE[way])}</Text>
            </View>
            <View style={dir.flip}>
              <Icon name="chevron-right" size={18} color={colors.textSecondary} />
            </View>
          </Pressable>
        ))}
      </View>

      {categories.length > 0 ? (
        <View style={styles.shelf}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
            {t('games.impostor.categories')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.stripRow}>
            {categories.map((c) => {
              const meaning = meaningIn(c.meanings, locale);
              return (
                <Pressable
                  key={c.slug}
                  onPress={() => onCouch({ category: c.slug })}
                  accessibilityRole="button"
                  accessibilityLabel={meaning ? `${c.ku} · ${meaning}` : c.ku}
                  style={({ pressed }) => [styles.cat, { backgroundColor: `${impostorCategoryTone(c.slug)}26`, opacity: pressed ? 0.8 : 1 }]}
                >
                  <CategoryArt category={c.slug} size={52} />
                  <Text style={[c.ku.length > 9 ? styles.catNameLong : styles.catName, { color: colors.textPrimary, writingDirection: script.writingDirection }]} numberOfLines={2}>
                    {c.ku}
                  </Text>
                  {meaning ? (
                    <Text style={[styles.catMeaning, { color: colors.textSecondary }]} numberOfLines={1}>
                      {meaning}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <GlassCard>
        <View style={styles.how}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
            {t('games.party.howTitle')}
          </Text>
          <Text style={[styles.body, dir.text, { color: colors.textSecondary }]}>{t('games.impostor.intro')}</Text>
          {STEPS.map((key, i) => (
            <View key={key} style={[styles.howStep, { flexDirection: dir.row }]}>
              <View style={styles.howN}>
                <Text style={styles.howNText}>{i + 1}</Text>
              </View>
              <Text style={[styles.howText, dir.text, { color: colors.textPrimary }]}>{t(key)}</Text>
            </View>
          ))}
        </View>
      </GlassCard>

      {/* a game somebody else made: its code opens it, whichever game it turns out to be */}
      <JoinCodeCard />
      {inviting ? <InviteSheet target={{ kind: 'new', game: 'impostor' }} onClose={() => setInviting(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: spacing.xl },
  none: { alignItems: 'center', gap: spacing.sm },
  centre: { textAlign: 'center' },
  body: { fontSize: typography.sizes.md, lineHeight: 23 },
  hero: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.lg, paddingBottom: spacing.lg, paddingHorizontal: spacing.md },
  meta: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center', color: TABLE.goldSoft },
  tagline: { fontSize: typography.sizes.xl, lineHeight: 34, fontWeight: typography.weights.bold, textAlign: 'center', color: TABLE.ink, maxWidth: 280 },
  play: { alignSelf: 'stretch', marginTop: spacing.md },
  friends: {
    alignSelf: 'stretch',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: TABLE.veil,
  },
  friendsText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: TABLE.ink },
  shelf: { gap: spacing.sm },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  way: { minHeight: 84, alignItems: 'center', gap: 12, padding: 12, borderRadius: radii.lg },
  wayArt: { width: 64, height: 64, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  wayText: { flex: 1, gap: 2 },
  wayName: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  wayNote: { fontSize: typography.sizes.sm, lineHeight: 20 },
  strip: { flexGrow: 0, marginHorizontal: -layout.gutter },
  stripRow: { gap: spacing.sm, paddingHorizontal: layout.gutter },
  cat: { width: 104, minHeight: 116, alignItems: 'center', gap: 4, paddingTop: 12, paddingBottom: spacing.sm, paddingHorizontal: 4, borderRadius: radii.lg },
  catName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textAlign: 'center' },
  catNameLong: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, textAlign: 'center' },
  catMeaning: { fontSize: typography.sizes.xs, textAlign: 'center' },
  how: { gap: spacing.sm },
  howStep: { alignItems: 'flex-start', gap: spacing.sm },
  howN: { width: 26, height: 26, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: TABLE.gold },
  howNText: { fontWeight: typography.weights.bold, color: TABLE.goldInk },
  howText: { flex: 1, fontSize: typography.sizes.md, lineHeight: 22 },
});
