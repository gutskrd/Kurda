import { createContext, useCallback, useContext } from 'react';
import { Animated, Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { sectionLabel } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useDirection } from '../reports/direction';
import { useEdgePanel } from './edgePanel';

/**
 * How much of the screen the panel covers. The strip left over shows the app is still behind it, and a tap there closes
 * it.
 */
const WIDTH_RATIO = 0.84;

export interface MenuLink {
  key: string;
  labelKey: TranslationKey;
  icon: IconName;
  onPress: () => void;
  /** A count at the end of the row, already capped by `unreadBadge` ("3", "9+"). */
  badge?: string;
}

export interface MenuGroup {
  /** Null for the first group, which needs no heading. */
  titleKey: TranslationKey | null;
  links: MenuLink[];
}

/**
 * The menu panel: the places with no tab of their own. It belongs to Profile and slides in over the app, on a scrim,
 * from the edge its button is on. It moves with `useEdgePanel` (React Native's `Animated` and `PanResponder`), shared
 * with the new-message panel, so one panel needs no extra native dependencies.
 */
export function SideMenu({
  open,
  onClose,
  groups,
  side = 'start',
}: {
  open: boolean;
  onClose: () => void;
  groups: MenuGroup[];
  /** The edge it comes from: the side its button is on. Mirrored in a right-to-left language. */
  side?: 'start' | 'end';
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  // Which physical edge: the end is the right in a left-to-right language.
  const fromRight = (side === 'end') !== (dir.row === 'row-reverse');
  const sign = fromRight ? 1 : -1;
  const insets = useSafeAreaInsets();
  const width = Math.round(Dimensions.get('window').width * WIDTH_RATIO);
  // The motion every edge panel shares: the interface spring, a drag to close, and Android's back.
  const { away, panHandlers } = useEdgePanel({ open, onClose, width, sign });

  const renderLink = useCallback(
    (link: MenuLink) => (
      <Pressable
        key={link.key}
        onPress={() => {
          onClose();
          link.onPress();
        }}
        accessibilityRole="button"
        style={({ pressed }) => [styles.link, { flexDirection: dir.row }, pressed && { backgroundColor: colors.controlTrack }]}
      >
        <Icon name={link.icon} size={20} color={colors.textSecondary} />
        <Text style={[styles.linkText, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
          {t(link.labelKey)}
        </Text>
        {link.badge ? (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.badgeText, { color: colors.textOnPrimary }]}>{link.badge}</Text>
          </View>
        ) : null}
      </Pressable>
    ),
    [colors.controlTrack, colors.primary, colors.textOnPrimary, colors.textPrimary, colors.textSecondary, dir, onClose, t],
  );

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={open ? 'box-none' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.scrim, opacity: away.interpolate({ inputRange: [0, width], outputRange: [1, 0], extrapolate: 'clamp' }) },
        ]}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
        />
      </Animated.View>

      <Animated.View
        {...panHandlers}
        accessibilityViewIsModal={open}
        style={[
          styles.panel,
          fromRight ? styles.panelRight : styles.panelLeft,
          {
            width,
            backgroundColor: colors.background,
            paddingTop: insets.top + spacing.md,
            paddingBottom: insets.bottom,
            transform: [{ translateX: away.interpolate({ inputRange: [0, 1], outputRange: [0, sign] }) }],
          },
        ]}
      >
        {/* Past the screen's edge, so a panel pulled further open shows more panel rather than a gap. */}
        <View pointerEvents="none" style={[styles.skirt, fromRight ? styles.skirtRight : styles.skirtLeft, { width, backgroundColor: colors.background }]} />

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {groups.map((group, i) => (
            <View key={group.titleKey ?? 'group-' + i} style={styles.group}>
              {group.titleKey ? (
                <Text style={[styles.groupTitle, dir.text, { color: colors.textSecondary }]}>{t(group.titleKey)}</Text>
              ) : null}
              {group.links.map(renderLink)}
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/** Lets any screen open the panel without a callback: the tab shell owns the panel, since it must cover the tab bar. */
const OpenMenu = createContext<() => void>(() => {});

export const MenuProvider = OpenMenu.Provider;

/** Returns a function that opens the side panel, or a no-op outside the tabs. */
export function useOpenMenu(): () => void {
  return useContext(OpenMenu);
}


const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  panelLeft: { left: 0 },
  panelRight: { right: 0 },
  skirt: { position: 'absolute', top: 0, bottom: 0 },
  skirtLeft: { right: '100%' },
  skirtRight: { left: '100%' },
  body: { paddingBottom: spacing.lg },
  group: { paddingVertical: spacing.xs },
  groupTitle: { ...sectionLabel, paddingHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.xs },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.sm,
  },
  linkText: { fontSize: typography.ios.row, flexShrink: 1, flex: 1 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
});
