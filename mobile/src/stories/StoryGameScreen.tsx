import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { glossFor, type StoryGlossEntry } from '@kurda/shared';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { ClayButton, GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/fonts';
import { spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { useGameStory } from './game/useGameStory';
import { Lobby } from './game/Lobby';
import { Question } from './game/Question';
import { Reading } from './game/Reading';
import { Results } from './game/Results';
import { Reveal } from './game/Reveal';
import { ENGLISH_TEXT_PROPS, ENGLISH_TEXT_STYLE, storyTextProps, storyTextStyle } from './storyText';
import { COLUMN, Note, Sheet, useAnnouncer } from './ui';
import { useStoryGame } from './useStoryGame';

/**
 * A story game, whatever mode and wherever it is (contract §A1): the lobby,
 * the reading, each question and its answer, and the results. One screen
 * whose content follows the game's status, kept current by the long-poll in
 * `useStoryGame`; opening it for a game you are not in joins it if you may.
 *
 * One live region for the whole game (Android and the web; iOS is told
 * directly), so what is announced — a locked answer, ten seconds left, a
 * verdict — is said once and never moves the reader's place.
 */
export function StoryGameScreen({ id, onExit }: { id: string; onExit: () => void }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const game = useStoryGame(id);
  const view = game.view;
  const story = useGameStory(id, !!view && view.status !== 'lobby');
  const { announce, region } = useAnnouncer();
  const [gloss, setGloss] = useState<StoryGlossEntry | null>(null);

  const toStories = (): void => navigation.navigate('Stories');

  let body: React.ReactNode;
  if (game.gone) {
    body = (
      <>
        <Note icon="story">
          {game.gone === 'started' ? t('stories.join.started') : game.gone === 'full' ? t('stories.join.full') : t('stories.game.unavailable')}
        </Note>
        <ClayButton label={t('stories.results.back')} tone="primary" onPress={toStories} />
      </>
    );
  } else if (!view) {
    body = <ActivityIndicator color={colors.primary} style={styles.loading} accessibilityLabel={t('common.loading')} />;
  } else if (view.status === 'cancelled') {
    body = (
      <>
        <Note icon="story">{t('stories.game.cancelled')}</Note>
        <ClayButton label={t('stories.results.back')} tone="primary" onPress={toStories} />
      </>
    );
  } else if (view.status === 'lobby') {
    body = <Lobby view={view} apply={game.apply} onLeft={onExit} />;
  } else if (view.status === 'reading') {
    body = <Reading view={view} story={story} apply={game.apply} serverNow={game.serverNow} onGloss={setGloss} />;
  } else if (view.status === 'question') {
    body = (
      <Question
        view={view}
        story={story}
        apply={game.apply}
        refresh={game.refresh}
        serverNow={game.serverNow}
        announce={announce}
        onGloss={setGloss}
      />
    );
  } else if (view.status === 'reveal') {
    body = <Reveal view={view} story={story} apply={game.apply} announce={announce} />;
  } else {
    body = (
      <Results
        view={view}
        story={story}
        onOpenGame={(next) => navigation.replace('StoryGame', { id: next })}
        onRead={() => navigation.navigate('StoryReader', { slug: view.settings.storySlug })}
        onBack={toStories}
      />
    );
  }

  return (
    <GradientBackground>
      <ScreenHeader title={view?.settings.storyTitle ?? t('stories.title')} onBack={onExit} />
      {game.trouble ? (
        <Text style={[styles.trouble, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
          {t('stories.game.reconnecting')}
        </Text>
      ) : null}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {body}
      </ScrollView>
      {region}
      {gloss && view ? <GlossMeaning entry={gloss} dialect={view.settings.dialect} onClose={() => setGloss(null)} /> : null}
    </GradientBackground>
  );
}

function GlossMeaning({ entry, dialect, onClose }: { entry: StoryGlossEntry; dialect: 'kurmanci' | 'sorani'; onClose: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const meaning = glossFor(entry, locale);
  const english = meaning.lang === 'en' && locale !== 'en';
  return (
    <Sheet title={t('stories.reader.meaning')} onClose={onClose}>
      <View style={styles.gloss}>
        <Text {...storyTextProps(dialect)} style={[styles.glossTerm, { color: colors.textPrimary }, storyTextStyle(dialect)]}>
          {entry.term}
        </Text>
        <Text {...(english ? ENGLISH_TEXT_PROPS : {})} style={[styles.glossMeaning, { color: colors.textPrimary }, english ? ENGLISH_TEXT_STYLE : null]}>
          {meaning.text}
        </Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { ...COLUMN, padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  loading: { marginTop: spacing.xxl },
  trouble: { fontSize: typography.sizes.sm, textAlign: 'center', paddingBottom: spacing.xs },
  gloss: { gap: spacing.sm },
  glossTerm: { ...display(typography.sizes.xl) },
  glossMeaning: { fontSize: typography.sizes.lg, lineHeight: 26 },
});
