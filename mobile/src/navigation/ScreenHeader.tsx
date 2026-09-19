import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/fonts';
import { spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { useScreenTopInset } from './tabBarLayout';

/**
 * The bar at the top of a screen that is not a tab.
 *
 * Twenty-five screens wrote their own, and no two agreed. The titles came in
 * five sizes — the display face at 20, at 26 and at 34, plus the system face at
 * 16 bold and at 26 bold — and eight of the twenty-five centred the title while
 * seventeen did not. The way back came in four: `‹ Back`, a bare chevron glyph,
 * an `✕`, and nothing at all. The top padding came in five, and two screens had
 * none, so their first row sat under the status bar on a notched phone.
 *
 * Worse, the ones that did centre the title mostly did not. They put a
 * `<View style={{ width: 40 }} />` on the trailing side to balance the back
 * button — and "‹ Back" is 53pt wide in English, so the title sat 13pt left of
 * centre. In German the label is "Zurück" and it sits further still. Centring a
 * title by guessing the width of the thing opposite it only works in the
 * language you guessed in.
 *
 * So the two sides are `flex: 1` and the title is between them: equal shares of
 * whatever is left means the middle is the middle, whatever either side holds
 * and whatever language it holds it in. That is what UINavigationBar does.
 *
 * The bar itself is 44pt tall — the same minimum a fingertip needs, which is
 * not a coincidence, because the back button is the thing in it.
 */
export function ScreenHeader({
  title,
  onBack,
  leading = 'back',
  backLabel,
  right,
  hairline = false,
  style,
}: {
  /** Centred, one line, truncated rather than wrapped — a bar is one line tall. */
  title?: string;
  /** Omitted on a screen you cannot leave upwards (a lesson in progress, a game). */
  onBack?: () => void;
  /**
   * `back` on a screen that was pushed, `close` on one that was presented over
   * what you were doing. iOS makes the same distinction and so should we: a
   * chevron says "the thing behind this is where you came from", an ✕ says
   * "this is on top of what you were doing".
   */
  leading?: 'back' | 'close';
  /**
   * What a screen reader should call the way back, when "Back" is vaguer
   * than it needs to be — the dictionary entry's says "Back to search".
   * The visible word does not change; iOS keeps that short on purpose.
   */
  backLabel?: string;
  /** A trailing action, if the screen has one. */
  right?: ReactNode;
  /**
   * A hairline under the bar, for screens whose content scrolls beneath it.
   *
   * Drawn with `separator`, not `glassBorder`: this is a line between two
   * regions of a screen, which is the same job the composer line at the bottom
   * of a chat does. Chat had one of each, and they were two different greys.
   */
  hairline?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const topInset = useScreenTopInset();

  return (
    <View
      style={[
        styles.wrap,
        { paddingTop: topInset },
        hairline && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
        style,
      ]}
    >
      <View style={styles.bar}>
        <View style={styles.side}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={backLabel ?? (leading === 'close' ? t('common.cancel') : t('common.back'))}
              hitSlop={10}
              style={({ pressed }) => [styles.leading, pressed && styles.pressed]}
            >
              {leading === 'close' ? (
                <Icon name="close" size={22} color={colors.primary} />
              ) : (
                <>
                  <Icon name="chevron-left" size={20} color={colors.primary} />
                  <Text style={[styles.backLabel, { color: colors.primary }]} numberOfLines={1}>
                    {t('common.back')}
                  </Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>

        {title ? (
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
        ) : null}

        <View style={[styles.side, styles.sideEnd]}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH_TARGET, gap: spacing.sm },
  // equal shares of what the title does not use, so the title is centred
  // without anybody having to guess how wide the word "Back" is
  side: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  sideEnd: { justifyContent: 'flex-end' },
  leading: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH_TARGET, paddingRight: spacing.sm },
  pressed: { opacity: 0.6 },
  // the chevron already carries the spacing; -2 closes the gap the glyph's own
  // side bearing leaves, which is what makes it read as one control
  backLabel: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium, marginLeft: -2 },
  title: { ...display(typography.sizes.lg), flexShrink: 1, textAlign: 'center' },
});
