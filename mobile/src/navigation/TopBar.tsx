import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/fonts';
import { fontScaleCap, layout, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { NotificationBell } from '../notifications/NotificationBell';
import { ActionPill, HeaderButton } from './HeaderButton';
import type { RootNavigation } from './rootStack';

/**
 * Search and the bell, in one pill at the far end of a page's top.
 *
 * The two things done from anywhere: looking for something, and seeing what
 * is new. They are in the same corner of every tab and of the pages to
 * browse behind them, so neither has to be found twice. Search was a tab of
 * its own, a place to go and stand in before typing; it opens from here now,
 * over wherever you are, and Back returns you there.
 */
export function GlobalActions(): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  return (
    <ActionPill>
      <HeaderButton icon="search" label={t('nav.search')} onPress={() => navigation.navigate('Search')} testID="top-search" />
      <NotificationBell />
    </ActionPill>
  );
}

/**
 * The top of a tab: what the tab is at the reading edge, and at the far end
 * the tab's own one action and the pill of search and the bell.
 *
 * The four tabs each wrote their own top, and no two agreed: a wordmark
 * with three bare icons, a 34pt title with a row of numbers, a bar with a
 * pencil over a title that scrolled, a name with a menu. The far end is the
 * same on all four now, so the bell and search are always where they were
 * on the last tab, and the reading edge is the one thing that changes: the
 * app's name on Home, the streak and the purse on Learn, the tab's own name
 * on Messages, yours on Profile.
 *
 * `action` is the one thing this tab does that no other does (write a post,
 * start a conversation, open your menu), in a disc of its own before the
 * pill. One: a second would be a third shape in the corner.
 *
 * The tab's name is the page's heading for a screen reader. Where something
 * else stands at the reading edge (`lead`), each part of it says what it is,
 * and the bar of tabs, which names the place, is what says where this is.
 */
export function TabHeader({
  title,
  lead,
  action,
  style,
}: {
  /** The tab's name, large, at the reading edge. */
  title?: string;
  /** What stands at the reading edge instead of a name: Learn's streak, goal and purse. */
  lead?: ReactNode;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const dir = useDirection();
  return (
    <View style={[styles.head, { paddingTop: insets.top + spacing.xs, flexDirection: dir.row }, style]}>
      {lead ? (
        <View style={[styles.lead, { flexDirection: dir.row }]}>{lead}</View>
      ) : (
        <Text
          style={[styles.title, dir.text, { color: colors.textPrimary }]}
          numberOfLines={1}
          // one line beside the actions: grown without limit it is cut off after a few letters
          maxFontSizeMultiplier={fontScaleCap.heading}
          // a long name ("الملف الشخصي" beside the menu at 320 wide) is set a little smaller rather than cut
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          accessibilityRole="header"
        >
          {title}
        </Text>
      )}
      {action ?? null}
      <GlobalActions />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: layout.gutter, paddingBottom: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  // the title takes the room, so the actions are pushed to the far end
  title: { ...display(typography.sizes.xl), flex: 1 },
  lead: { flex: 1, alignItems: 'center' },
});
