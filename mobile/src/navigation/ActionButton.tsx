import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { Icon, type IconName } from '../theme/Icon';
import { LensRim } from '../theme/LensRim';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { TAB_BAR_HEIGHT, TAB_BAR_MARGIN } from './tabBarLayout';

/** One thing the button opens. */
export interface Action {
  key: string;
  labelKey: TranslationKey;
  icon: IconName;
  onPress: () => void;
}

const SIZE = 56;
/** Clear of the island, by the same gap the island keeps from the screen edge. */
const GAP = 12;
const DURATION = 220;

/**
 * Where the two study screens went when the bar came down to four.
 *
 * Learn and Dictionary were tabs. The bar is Home, Search, Inbox and Profile
 * now, so they needed somewhere that is one tap from anywhere and is not a
 * fifth tab — and the answer every app that has had this problem arrived at is
 * a round button floating above the bar.
 *
 * Instagram, TikTok and X put theirs in the middle of the bar; Gmail, Maps and
 * most of Material put it in the bottom trailing corner. Both are in what the
 * thumb-zone work calls the natural arc — the part of the screen a thumb
 * reaches without the hand moving. The corner wins here for one reason: the
 * middle of the bar is already a tab, and taking it would make a five-item bar
 * with a hole in it, which is exactly the shape that was being reduced.
 *
 * Tapping it raises a short stack of labelled pills rather than a sheet. A
 * sheet is a modal — it covers the screen, takes a drag to dismiss, and for
 * two destinations is more ceremony than the choice deserves. The pills appear
 * where the thumb already is.
 *
 * Open, it is a close button, and the scrim behind it dismisses. Nothing here
 * traps you.
 */
export function ActionButton({ actions }: { actions: readonly Action[] }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration: DURATION,
      easing: Easing.out(Easing.sin),
      useNativeDriver: true,
    }).start();
  }, [open, anim]);

  const bottom = Math.max(insets.bottom, TAB_BAR_MARGIN) + TAB_BAR_HEIGHT + GAP;

  return (
    <>
      {/*
        The scrim only exists while the stack is open.

        It is not merely transparent when closed — a full-screen view that is
        always mounted would swallow every tap on the screen behind it, which
        is what `pointerEvents` is for, but an unmounted one cannot get that
        wrong.
      */}
      {open ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: anim }]}
          />
        </Pressable>
      ) : null}

      <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
        {open
          ? actions.map((a, i) => (
              <Animated.View
                key={a.key}
                style={{
                  opacity: anim,
                  transform: [
                    {
                      // each pill rises a little further than the one below it,
                      // so the stack unfolds rather than appearing all at once
                      translateY: anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [(actions.length - i) * 10, 0],
                      }),
                    },
                  ],
                }}
              >
                <Pressable
                  onPress={() => {
                    setOpen(false);
                    a.onPress();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t(a.labelKey)}
                  style={({ pressed }) => [
                    styles.pill,
                    { backgroundColor: colors.glassFill, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <LensRim radius={MIN_TOUCH_TARGET / 2} axis="x" />
                  <Icon name={a.icon} size={20} color={colors.textPrimary} />
                  <Text style={[styles.pillText, { color: colors.textPrimary }]} numberOfLines={1}>
                    {t(a.labelKey)}
                  </Text>
                </Pressable>
              </Animated.View>
            ))
          : null}

        <Pressable
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={t(open ? 'common.close' : 'nav.actions')}
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: colors.primary,
              shadowColor: colors.softShadow,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Animated.View
            style={{
              transform: [
                { rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] }) },
              ],
            }}
          >
            <Icon name="plus" size={24} color={colors.textOnPrimary} />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: TAB_BAR_MARGIN, alignItems: 'flex-end', gap: spacing.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  pillText: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  fab: {
    width: SIZE,
    height: SIZE,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 8,
  },
});
