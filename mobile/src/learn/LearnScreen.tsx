import { useRef } from 'react';
import { useScrollToTop } from '@react-navigation/native';
import { StyleSheet, View, type FlatList, type ScrollView } from 'react-native';
import { GradientBackground, Segmented } from '../theme/glass';
import { layout, spacing } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { LargeTitle } from '../navigation/LargeTitle';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import type { LearnView } from '../navigation/tabs';
import type { MapRow } from '../coursemap/node';
import { LessonsView } from './LessonsView';
import { GamesView } from './GamesView';
import { useLearnView } from './useLearnView';
import { LearnBar } from './LearnBar';

const VIEWS: readonly LearnView[] = ['lessons', 'games'] as const;

/**
 * The Learn tab: lessons and games, one switch between them.
 *
 * They were two places — Play in the middle of the bar, and the lessons a
 * screen pushed from the top of it — which made continuing a lesson two taps
 * and a decision, and hid the course behind a row that looked like a setting.
 * One tab with a switch at its top keeps both one tap away and makes clear
 * they belong together: the games are practice too.
 *
 * `view` is what a link asked for (`hevalo://play` asks for Games), and
 * `onViewShown` clears it so the same link works a second time.
 */
export function LearnScreen({ view: requested, onViewShown }: { view?: LearnView; onViewShown?: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const topInset = useScreenTopInset();
  const [view, setView] = useLearnView(requested, onViewShown);

  /*
   * Tapping Learn while on Learn scrolls back to the top. Each view has its
   * own list, and only one is mounted at a time, so one ref serves both.
   */
  const scrollRef = useRef<FlatList<MapRow> & ScrollView>(null);
  useScrollToTop(scrollRef);

  return (
    <GradientBackground>
      <View style={[styles.head, { paddingTop: topInset }]}>
        {/* the streak, the day's goal and the Zêr, in the corner where they are looked for */}
        <LargeTitle title={t('nav.learn')} right={<LearnBar />} />
        <Segmented
          options={VIEWS}
          value={view}
          onChange={setView}
          labelOf={(v) => t(v === 'games' ? 'learn.view.games' : 'learn.view.lessons')}
          size="large"
        />
      </View>
      {view === 'games' ? <GamesView scrollRef={scrollRef} /> : <LessonsView scrollRef={scrollRef} />}
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: layout.gutter, gap: spacing.md - 4, paddingBottom: spacing.xs },
});
