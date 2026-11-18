import { useCallback, useMemo, useRef, useState } from 'react';
import { useScrollToTop } from '@react-navigation/native';
import { StyleSheet, View, type ScrollView } from 'react-native';
import { GradientBackground, Segmented } from '../theme/glass';
import { SwipePager } from '../theme/SwipePager';
import { layout, spacing } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { TabHeader } from '../navigation/TopBar';
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
 * The Learn tab: lessons, stories and games behind one switch, so all three are one tap away and read as practice
 * together. Stories sit in the middle: reading first, a quiz after. The three lie side by side under the switch
 * (theme/SwipePager), so a swipe or a tap turns between them, and each keeps its place.
 *
 * `view` is what a link asked for (`hevalo://play` asks for Games); `onViewShown` clears it so the same link
 * works again.
 */
export function LearnScreen({ view: requested, onViewShown }: { view?: LearnView; onViewShown?: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const [view, setView] = useLearnView(requested, onViewShown);

  /* Tapping Learn while on Learn scrolls the visible view back to the top; the others stay where they were. */
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

  // The streak the bar reads, for the lessons' own moments; pulled to refresh, the bar reads it again.
  const [streak, setStreak] = useState<Streak | null>(null);
  const [barKey, setBarKey] = useState(0);
  const reloadBar = useCallback(() => setBarKey((k) => k + 1), []);

  return (
    <GradientBackground>
      {/* Today's status at the reading edge, where other tabs show their name: the tab bar already says "Learn". */}
      <TabHeader lead={<LearnBar reloadKey={barKey} onStreak={setStreak} />} />
      <View style={styles.head}>
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
