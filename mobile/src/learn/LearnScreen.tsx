import { useCallback, useMemo, useRef, useState } from 'react';
import { useScrollToTop } from '@react-navigation/native';
import { StyleSheet, View, type ScrollView } from 'react-native';
import { GradientBackground, Segmented } from '../theme/glass';
import { SwipePager } from '../theme/SwipePager';
import { layout, spacing } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { LargeTitle } from '../navigation/LargeTitle';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { LEARN_VIEWS, type LearnView } from '../navigation/tabs';
import type { Streak } from '../streak/format';
import { StoriesView } from '../stories/StoriesView';
import { LessonsView } from './LessonsView';
import { GamesView } from './GamesView';
import { useLearnView } from './useLearnView';
import { LearnBar } from './LearnBar';

/** The three groups, in the order the switch shows them: Lessons · Stories · Games. */
export const VIEWS: readonly LearnView[] = LEARN_VIEWS;

const VIEW_LABEL: Record<LearnView, TranslationKey> = {
  lessons: 'learn.view.lessons',
  stories: 'learn.view.stories',
  games: 'learn.view.games',
};

/**
 * The Learn tab: lessons, stories and games, one switch between them.
 *
 * Lessons and games were two places — Play in the middle of the bar, and the
 * lessons a screen pushed from the top of it — which made continuing a lesson
 * two taps and a decision, and hid the course behind a row that looked like a
 * setting. One tab with a switch at its top keeps all three one tap away and
 * makes clear they belong together: the stories and the games are practice
 * too. Stories sit in the middle because that is what they are: reading
 * first, a quiz after.
 *
 * The three lie side by side under the switch (theme/SwipePager), so a swipe
 * turns from one to the next as well as a tap on its name, and each keeps its
 * place while another is looked at.
 *
 * `view` is what a link asked for (`hevalo://play` asks for Games), and
 * `onViewShown` clears it so the same link works a second time.
 */
export function LearnScreen({ view: requested, onViewShown }: { view?: LearnView; onViewShown?: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const topInset = useScreenTopInset();
  const [view, setView] = useLearnView(requested, onViewShown);

  /*
   * Tapping Learn while on Learn scrolls back to the top: of the view that is
   * showing, whichever of the three it is. Each has its own list; the others
   * stay where they were left.
   */
  const lessonsRef = useRef<ScrollView>(null);
  const storiesRef = useRef<ScrollView>(null);
  const gamesRef = useRef<ScrollView>(null);
  const shown = useRef(view);
  shown.current = view;
  const top = useMemo(
    () => ({
      current: {
        scrollToTop: () => {
          const list = (shown.current === 'games' ? gamesRef : shown.current === 'stories' ? storiesRef : lessonsRef).current;
          list?.scrollTo({ y: 0, animated: true });
        },
      },
    }),
    [],
  );
  useScrollToTop(top);

  // the streak the bar reads, for the lessons' own moments; pulled to refresh, the bar reads it again
  const [streak, setStreak] = useState<Streak | null>(null);
  const [barKey, setBarKey] = useState(0);
  const reloadBar = useCallback(() => setBarKey((k) => k + 1), []);

  return (
    <GradientBackground>
      <View style={[styles.head, { paddingTop: topInset }]}>
        {/* the streak, the day's goal and the Zêr, in the corner where they are looked for */}
        <LargeTitle title={t('nav.learn')} right={<LearnBar reloadKey={barKey} onStreak={setStreak} />} />
        <Segmented options={VIEWS} value={view} onChange={setView} labelOf={(v) => t(VIEW_LABEL[v])} size="large" />
      </View>
      <SwipePager
        pages={VIEWS}
        value={view}
        onChange={setView}
        testID="learn-pages"
        renderPage={(page) =>
          page === 'games' ? (
            <GamesView scrollRef={gamesRef} />
          ) : page === 'stories' ? (
            <StoriesView scrollRef={storiesRef} inTab />
          ) : (
            <LessonsView scrollRef={lessonsRef} streak={streak} onRefresh={reloadBar} />
          )
        }
      />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: layout.gutter, gap: spacing.md - 4, paddingBottom: spacing.xs },
});
