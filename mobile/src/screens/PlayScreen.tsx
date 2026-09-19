import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { RootNavigation } from '../navigation/rootStack';
import { spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import { ClayButton, GlassCard, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset, useTabBarInset } from '../navigation/tabBarLayout';
import { useI18n } from '../i18n/I18nContext';

/**
 * Play tab (KUR-054): find a 1v1 match. Queuing returns a room once an
 * opponent is paired; the match itself runs in GameScreen. On the glass theme.
 */
export function PlayScreen() {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
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
      // queued, waiting for an opponent — the room arrives via matchmaking
      setNote(t('games.quiz.searching'));
    } else {
      setSearching(false);
      setNote(describeError(res.error, t));
    }
  };

  return (
    <GradientBackground>
      <ScrollView contentContainerStyle={[styles.screen, { paddingTop: topInset, paddingBottom: tabBarInset }]} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.card}>
          <Icon name="play" size={56} tone="primary" />
          <Text style={[styles.title, { color: colors.primary }]}>{t('games.quiz.name')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('games.quiz.body')}</Text>

          {searching ? (
            <View style={styles.searching}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.note, { color: colors.textSecondary }]}>{note ?? t('games.quiz.finding')}</Text>
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
  card: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.md },
  title: { ...display(typography.sizes.xl) },
  subtitle: { fontSize: typography.sizes.md, textAlign: 'center' },
  button: { alignSelf: 'stretch', marginTop: spacing.md },
  searching: { alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  note: { fontSize: typography.sizes.md, textAlign: 'center' },
});
