import { useCallback, useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { LargeTitle } from '../navigation/LargeTitle';
import { SideMenuButton, useOpenMenu } from '../navigation/SideMenu';
import { SocialSlideButton, useOpenSlide } from '../social/SocialSlide';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { MIN_TOUCH_TARGET, hitSlopFor } from '../a11y/a11y';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import { ClayButton, GlassCard, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useTabBarInset } from '../navigation/tabBarLayout';
import { useI18n } from '../i18n/I18nContext';

/** How often to ask whether the queue is still looking. */
const STATUS_POLL_MS = 5_000;

/**
 * The middle of the bar: everything you open in order to do something.
 *
 * Six games — a 1v1 quiz that queues for an opponent, Wordle alone and
 * against somebody, rhyming alone and against somebody, and a typing race —
 * and, above them, the two screens that are not games.
 *
 * Learn and Dictionary are rows rather than cards. They are ways through to
 * somewhere else, and a row with an icon, a name and a chevron is what the
 * rest of the app uses to say so; six more cards would have buried the thing
 * the screen is mostly made of.
 */
export function PlayScreen() {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const openMenu = useOpenMenu();
  const openSlide = useOpenSlide();
  const topInset = useScreenTopInset();
  const tabBarInset = useTabBarInset();
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const findMatch = async () => {
    setSearching(true);
    setNote(null);
    const res = await client.post<{ roomId?: string; status?: string }>('/matchmaking/queue');
    if (res.ok && res.data.roomId) {
      setSearching(false);
      navigation.navigate('Game', { roomId: res.data.roomId });
    } else if (res.ok) {
      // queued. `match_found` arrives on the user channel and UserEventListener
      // navigates from wherever you are; the poll below notices the other ending.
      setNote(t('games.quiz.searching'));
    } else {
      setSearching(false);
      setNote(describeError(res.error, t));
    }
  };

  const cancelSearch = useCallback(async () => {
    const res = await client.post('/matchmaking/cancel');
    if (!res.ok) {
      // still queued as far as the server is concerned, so say so and stay put
      setNote(describeError(res.error, t));
      return;
    }
    setSearching(false);
    setNote(null);
  }, [client, t]);

  /**
   * Ask the server whether it is still looking.
   *
   * `searching` was a local flag nothing could falsify: the queue gives up after
   * a while and pushes `match_timeout`, and the phone discarded it, so the
   * spinner ran forever on a search that had already ended. Rather than trust a
   * push not to be missed, this asks the one endpoint that knows —
   * `GET /matchmaking/status` exists for exactly this question.
   *
   * Not queued and still on this screen means nothing was found: a match would
   * have navigated away from here before the next tick.
   */
  useEffect(() => {
    if (!searching) return;
    let stopped = false;
    const id = setInterval(() => {
      void client.get<{ queued: boolean }>('/matchmaking/status').then((res) => {
        if (stopped || !res.ok || res.data.queued) return;
        setSearching(false);
        setNote(t('games.quiz.noOpponent'));
      });
    }, STATUS_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [searching, client, t]);

  return (
    <GradientBackground>
      <View style={{ paddingTop: topInset }}>
        <LargeTitle left={<SideMenuButton onPress={openMenu} />} right={<SocialSlideButton onPress={openSlide} />} title={t('nav.play')} />
      </View>
      <ScrollView contentContainerStyle={[styles.screen, { paddingBottom: tabBarInset }]} showsVerticalScrollIndicator={false}>
        {/*
          The two that are not games, above the six that are.
        */}
        <View style={styles.ways}>
          {(
            [
              { key: 'learn', labelKey: 'nav.learn', icon: 'book', route: 'Learn' },
              { key: 'dictionary', labelKey: 'nav.dictionary', icon: 'text', route: 'Dictionary' },
            ] as const
          ).map((w) => (
            <Pressable
              key={w.key}
              onPress={() => navigation.navigate(w.route)}
              accessibilityRole="button"
              accessibilityLabel={t(w.labelKey)}
              style={({ pressed }) => [
                styles.way,
                { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Icon name={w.icon} size={22} color={colors.primary} />
              <Text style={[styles.wayText, { color: colors.textPrimary }]} numberOfLines={1}>
                {t(w.labelKey)}
              </Text>
              <Icon name="chevron-right" size={16} color={colors.textSecondary} />
            </Pressable>
          ))}
        </View>

        <GlassCard style={styles.card}>
          <Icon name="play" size={56} tone="primary" />
          <Text style={[styles.title, { color: colors.primary }]}>{t('games.quiz.name')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('games.quiz.body')}</Text>

          {searching ? (
            <View style={styles.searching}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.note, { color: colors.textSecondary }]}>{note ?? t('games.quiz.finding')}</Text>
              {/* the way out, which there was none of: queueing was one-way */}
              <Pressable
                onPress={() => void cancelSearch()}
                hitSlop={hitSlopFor(MIN_TOUCH_TARGET, 22)}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <Text style={[styles.cancel, { color: colors.primary }]}>{t('common.cancel')}</Text>
              </Pressable>
            </View>
          ) : (
            <ClayButton label={t('games.quiz.find')} tone="primary" onPress={findMatch} style={styles.button} />
          )}
          {!searching && note ? <Text style={[styles.note, { color: colors.textSecondary }]}>{note}</Text> : null}
        </GlassCard>

        <GlassCard style={styles.card}>
          <Icon name="grid" size={40} tone="primary" />
          <Text style={[styles.title, { color: colors.primary }]}>{t('games.wordle.name')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('games.wordle.solo')}</Text>
          <ClayButton label={t('games.play')} tone="neutral" onPress={() => navigation.navigate('Wordle')} style={styles.button} />
        </GlassCard>

        <GlassCard style={styles.card}>
          <Icon name="people" size={40} tone="primary" />
          <Text style={[styles.title, { color: colors.primary }]}>{t('games.battle.name')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('games.wordle.online')}</Text>
          <ClayButton
            label={t('games.play')}
            tone="neutral"
            onPress={() => navigation.navigate('WordleBattle')}
            style={styles.button}
          />
        </GlassCard>

        <GlassCard style={styles.card}>
          <Icon name="speaker" size={40} tone="primary" />
          <Text style={[styles.title, { color: colors.primary }]}>{t('games.rhyme.name')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('games.rhyme.solo')}</Text>
          <ClayButton label={t('games.play')} tone="neutral" onPress={() => navigation.navigate('Rhyme')} style={styles.button} />
        </GlassCard>

        <GlassCard style={styles.card}>
          <Icon name="bolt" size={40} tone="primary" />
          <Text style={[styles.title, { color: colors.primary }]}>{t('games.race.name')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('games.race.blurb')}</Text>
          <ClayButton
            label={t('games.play')}
            tone="neutral"
            onPress={() => navigation.navigate('Race')}
            style={styles.button}
          />
        </GlassCard>

        <GlassCard style={styles.card}>
          <Icon name="people" size={40} tone="primary" />
          <Text style={[styles.title, { color: colors.primary }]}>{t('games.rhymeMatch.name')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('games.rhyme.online')}</Text>
          <ClayButton
            label={t('games.play')}
            tone="neutral"
            onPress={() => navigation.navigate('RhymeMatch')}
            style={styles.button}
          />
        </GlassCard>
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, alignItems: 'center', padding: spacing.xl, gap: spacing.lg },
  ways: { alignSelf: 'stretch', gap: spacing.sm },
  way: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
  },
  wayText: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  card: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.md },
  title: { ...display(typography.sizes.xl) },
  subtitle: { fontSize: typography.sizes.md, textAlign: 'center' },
  button: { alignSelf: 'stretch', marginTop: spacing.md },
  searching: { alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  note: { fontSize: typography.sizes.md, textAlign: 'center' },
  cancel: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
