import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import { useAuth } from '../auth/AuthContext';

/**
 * Search and the bell in one pill at the far end of a page's top, in the same corner on every tab and page to browse.
 * Search opens over the current page, and Back returns there.
 */
export function GlobalActions(): React.JSX.Element | null {
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  // A child's profile has no search and no notification list (family/ChildRoot).
  const { isChild } = useAuth();
  if (isChild) return null;
  return (
    <ActionPill>
      <HeaderButton icon="search" label={t('nav.search')} onPress={() => navigation.navigate('Search')} testID="top-search" />
      <NotificationBell />
    </ActionPill>
  );
}

/**
 * The top of a tab: the tab's name (or `lead`) at the reading edge, then the tab's one `action` and the pill of search
 * and the bell. The far end is the same on every tab; only the reading edge changes.
 *
 * `action` is the one thing this tab alone does (write a post, start a conversation, open the menu), in a disc of its
 * own. The name is the page's heading for a screen reader; where `lead` stands instead, the tab bar names the place.
 */
export function TabHeader({
  title,
  lead,
  action,
}: {
  /** The tab's name, large, at the reading edge. */
  title?: string;
  /** What stands at the reading edge instead of a name: Learn's streak, goal and purse. */
  lead?: ReactNode;
  action?: ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const dir = useDirection();
  return (
    <View style={[styles.head, { paddingTop: insets.top + spacing.xs, flexDirection: dir.row }]}>
      {lead ? (
        <View style={[styles.lead, { flexDirection: dir.row }]}>{lead}</View>
      ) : (
        <Text
          style={[styles.title, dir.text, { color: colors.textPrimary }]}
          numberOfLines={1}
          // One line beside the actions: grown without limit it would be cut off after a few letters.
          maxFontSizeMultiplier={fontScaleCap.heading}
          // A long name ("الملف الشخصي" beside the menu at 320pt, any name on a folded phone's cover screen) is set smaller
          // rather than cut, down to the text size.
          adjustsFontSizeToFit
          minimumFontScale={0.6}
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
  // The title takes the room, pushing the actions to the far end.
  title: { ...display(typography.sizes.title), flex: 1 },
  lead: { flex: 1, alignItems: 'center' },
});
