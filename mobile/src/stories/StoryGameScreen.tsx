import { useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { glossFor, type StoryGameView, type StoryGlossEntry } from '@kurda/shared';
import { leftResults, reportGameFinished } from '../feedback/gameFinished';
import type { RootNavigation } from '../navigation/rootStack';
import { useQuietInvites } from '../play/quietInvites';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useHardwareBack } from '../navigation/hardwareBack';
import { askLeaveGame } from '../play/backOut';
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
import { Loading } from '../theme/Loading';

/**
 * A story game in any mode (contract §A1): lobby, reading, questions and reveals, and results, following the game's
 * status via the long-poll in `useStoryGame`. Opening a game you are not in joins it if allowed. One live region
 * serves the whole game (iOS is told directly), so announcements are said once without moving the reader's place.
 * iOS swiping is disabled (App.tsx); Android's back asks "Leave this game?" while the story is being played.
 */
export function StoryGameScreen({ id, onExit }: { id: string; onExit: () => void }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const game = useStoryGame(id);
  const view = game.view;
  const story = useGameStory(id, !!view && view.status !== 'lobby');
  // Invites wait while the story is being read and answered, since the banner would cover the timer.
  const playing = !!view && !game.gone && (view.status === 'reading' || view.status === 'question' || view.status === 'reveal');
  useQuietInvites(playing);
  useHardwareBack(playing ? () => askLeaveGame(t, onExit) : null);
  useStoryFinish(id, game.gone ? null : view);
  const { announce, region } = useAnnouncer();
  const [gloss, setGloss] = useState<StoryGlossEntry | null>(null);

  // Back to the library it was started from, or one in its place, never a second library over the game.
  const toStories = (): void => navigation.popTo('Stories');

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
    body = <Loading size="large" style={styles.loading} />;
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
        // Back to the reader this game was opened from if it is still underneath, else a new reader for the story.
        onRead={(slug) => navigation.popTo('StoryReader', { slug })}
        onBack={toStories}
      />
    );
  }

  return (
    <GradientBackground>
      {/* The story's title is in the body in its own script; the bar only says where you are, as the reader's does. */}
      <ScreenHeader title={t('stories.title')} onBack={onExit} />
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

/**
 * Tells the rating box (feedback/gameFinished) about a game that ended while played on this screen, not one opened
 * already finished, and as given up when this player left. A win is first place in a group; a duo has no winner.
 * Leaving the results closes a box that came with them.
 */
function useStoryFinish(id: string, view: StoryGameView | null): void {
  const seen = useRef({ id, playing: false, reported: false });
  if (seen.current.id !== id) seen.current = { id, playing: false, reported: false };
  useEffect(() => {
    if (!view) return;
    const s = seen.current;
    if (view.status !== 'finished') {
      if (view.status !== 'cancelled') s.playing = true;
      return;
    }
    if (!s.playing || s.reported) return;
    s.reported = true;
    const mine = view.results?.me;
    const won = view.mode === 'group' && mine?.place === 1 && (view.results?.standings.length ?? 0) > 2;
    reportGameFinished({ moment: won ? 'won' : 'other', gaveUp: view.players.find((p) => p.isMe)?.gone ?? false });
  }, [view]);
  const onResults = view?.status === 'finished';
  useEffect(() => (onResults ? () => leftResults() : undefined), [onResults]);
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
