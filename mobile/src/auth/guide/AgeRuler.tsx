import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type AccessibilityActionEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { haptic } from '../../feedback/haptics';
import { formatNumber } from '../../i18n/format';
import { useI18n } from '../../i18n/I18nContext';
import type { Locale } from '../../i18n/translations';
import { display } from '../../theme/fonts';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';
import { RULER, ageAtOffset, ageRange, offsetForAge, stepAge } from './age';

/** A tick is felt no more often than this, however fast the ruler flies. */
const TICK_HAPTIC_MS = 40;

/** How wide the fade at each end of the ruler is, in points. */
const FADE = 56;

/** How tall the big number is drawn. */
const NUMBER_SIZE = 72;

/**
 * "How old are you?", answered by scrolling a ruler.
 *
 * A huge number, "years old" under it, and under that a ruler of tick marks
 * — one a year, a tall one with its number every ten — with a pointer in the
 * middle in the brand's colour. The ruler scrolls sideways and snaps a year
 * at a time; the number counts with it, and every year that passes under the
 * pointer is a tick in the hand. The ends fade out, so the ruler reads as
 * going on past the screen.
 *
 * To a screen reader it is one adjustable control: it says the age, and a
 * swipe up or down moves it a year (`increment`, `decrement`), scrolling the
 * ruler there. The years it offers run from one to the earliest the server
 * takes (guide/age.ts), the young ones too, since leaving them out would say
 * which to pick.
 */
export function AgeRuler({
  value,
  onChange,
  now,
  testID = 'age-ruler',
}: {
  value: number;
  onChange: (age: number) => void;
  /** today, for the tests; the range of ages runs up from it */
  now?: Date;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const range = useMemo(() => ageRange(now), [now]);
  const [width, setWidth] = useState(0);
  const scroller = useRef<ScrollView>(null);
  // the age under the pointer as last read, so a scroll that stays on a year changes nothing
  const shown = useRef(value);
  const lastTick = useRef(0);
  const side = Math.max(0, width / 2 - RULER.tick / 2);

  // onto the age it starts on, once the ruler knows how wide it is
  useEffect(() => {
    if (width > 0) scroller.current?.scrollTo({ x: offsetForAge(shown.current, range.min), animated: false });
  }, [width, range.min]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const age = ageAtOffset(e.nativeEvent.contentOffset.x, range);
    if (age === shown.current) return;
    shown.current = age;
    const at = Date.now();
    if (at - lastTick.current >= TICK_HAPTIC_MS) {
      lastTick.current = at;
      haptic('select');
    }
    onChange(age);
  };

  const adjust = (e: AccessibilityActionEvent): void => {
    const name = e.nativeEvent.actionName;
    if (name !== 'increment' && name !== 'decrement') return;
    const next = stepAge(shown.current, name, range);
    if (next === shown.current) return;
    shown.current = next;
    scroller.current?.scrollTo({ x: offsetForAge(next, range.min), animated: true });
    haptic('select');
    onChange(next);
  };

  const spoken = t('guide.age.value', { age: formatNumber(value, locale) });
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t('guide.age.label')}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      aria-valuenow={value}
      aria-valuetext={spoken}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={adjust}
      style={styles.root}
      testID={testID}
    >
      <Text style={[styles.number, { color: colors.textPrimary }]} testID="age-ruler-number">
        {formatNumber(value, locale)}
      </Text>
      <Text style={[styles.unit, { color: colors.textSecondary }]}>{t('guide.age.yearsOld')}</Text>

      <View style={styles.ruler} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        {/* the ticks are not read out one by one: the control above says the age */}
        <View aria-hidden style={styles.ticks} testID="age-ruler-ticks">
          <ScrollView
            ref={scroller}
            horizontal
            snapToInterval={RULER.tick}
            snapToAlignment="start"
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={onScroll}
            contentContainerStyle={{ paddingHorizontal: side }}
            testID="age-ruler-scroll"
          >
            <Ticks min={range.min} max={range.max} colour={colors.textSecondary} numberColour={colors.textPrimary} locale={locale} />
          </ScrollView>
        </View>
        {/* the pointer, over the middle of the ruler; the ruler itself runs under it */}
        <View pointerEvents="none" style={[styles.pointer, { backgroundColor: colors.primary }]} />
        <LinearGradient colors={[colors.background, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fade, styles.fadeStart]} pointerEvents="none" />
        <LinearGradient colors={['transparent', colors.background]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fade, styles.fadeEnd]} pointerEvents="none" />
      </View>
    </View>
  );
}

/** The tick marks, drawn once: they change only with the colours and the language the numbers are written in. */
const Ticks = memo(function Ticks({
  min,
  max,
  colour,
  numberColour,
  locale,
}: {
  min: number;
  max: number;
  colour: string;
  numberColour: string;
  locale: Locale;
}): React.JSX.Element {
  const ages = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <>
      {ages.map((age) => {
        const tall = age % RULER.every === 0;
        return (
          <View key={age} style={styles.slot}>
            <View style={[styles.tick, { height: tall ? RULER.tall : RULER.short, backgroundColor: tall ? numberColour : colour }]} />
            {tall ? <Text style={[styles.tickLabel, { color: numberColour }]}>{formatNumber(age, locale)}</Text> : null}
          </View>
        );
      })}
    </>
  );
});

/** How wide a tick's number may be, centred on its tick. */
const LABEL_WIDTH = 44;

const styles = StyleSheet.create({
  root: { alignItems: 'center' },
  number: { ...display(NUMBER_SIZE), lineHeight: Math.round(NUMBER_SIZE * 1.05), fontVariant: ['tabular-nums'] },
  unit: { fontSize: typography.sizes.md, marginTop: -spacing.xs, marginBottom: spacing.lg },
  ruler: { alignSelf: 'stretch', height: RULER.tall + 28, justifyContent: 'flex-start' },
  ticks: { flex: 1 },
  slot: { width: RULER.tick, alignItems: 'center', height: RULER.tall + 28 },
  tick: { width: 2, borderRadius: radii.pill },
  tickLabel: {
    position: 'absolute',
    top: RULER.tall + spacing.xs,
    width: LABEL_WIDTH,
    left: (RULER.tick - LABEL_WIDTH) / 2,
    textAlign: 'center',
    fontSize: typography.sizes.xs,
    fontVariant: ['tabular-nums'],
  },
  pointer: { position: 'absolute', top: -spacing.xs, left: '50%', marginLeft: -2, width: 4, height: RULER.tall + spacing.sm, borderRadius: radii.pill },
  fade: { position: 'absolute', top: 0, bottom: 0, width: FADE },
  fadeStart: { left: 0 },
  fadeEnd: { right: 0 },
});
