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
import { RULER, ageRange, chosenAtOffset, offsetForAge, stepAge } from './age';

/** A tick is felt no more often than this, however fast the ruler flies. */
const TICK_HAPTIC_MS = 40;

/** How wide the fade at each end of the ruler is, in points. */
const FADE = 56;

/** How tall the big number is drawn. */
const NUMBER_SIZE = 72;

/** What stands where the number goes while no age is chosen: a mark, not a word, so it needs no translating. */
const NO_NUMBER = '–';

/**
 * "How old are you?", answered by scrolling a ruler: a large number over a ruler with a tick a year (a tall numbered
 * one every ten), snapping a year at a time with a haptic tick under the pointer. Its ends fade, so it reads as going
 * on past the screen.
 *
 * It starts with no age (guide/age.ts): resting at its young end with a dash for the number and a grey pointer; the
 * first scroll off the resting year chooses one, so nobody is given an age they did not pick. To a screen reader it is
 * one adjustable control moving a year per swipe, with two more actions moving ten years, since a year a swipe from the
 * young end is a long way. It offers every year the server takes, the young ones too, since leaving them out would hint
 * which to pick.
 */
/** What each of the control's actions does to the age: a year a swipe, or ten from the actions menu. */
const ACTION_STEP: Record<string, { action: 'increment' | 'decrement'; by: number } | undefined> = {
  increment: { action: 'increment', by: 1 },
  decrement: { action: 'decrement', by: 1 },
  tenOlder: { action: 'increment', by: 10 },
  tenYounger: { action: 'decrement', by: 10 },
};

export function AgeRuler({
  value,
  onChange,
  now,
}: {
  /** The age chosen, or null while none is. */
  value: number | null;
  onChange: (age: number) => void;
  /** Today, for the tests; the range of ages runs up from it. */
  now?: Date;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const range = useMemo(() => ageRange(now), [now]);
  const [width, setWidth] = useState(0);
  const scroller = useRef<ScrollView>(null);
  // The age under the pointer as last read, so a scroll that stays on a year changes nothing; null until one is chosen.
  const shown = useRef(value);
  const lastTick = useRef(0);
  const side = Math.max(0, width / 2 - RULER.tick / 2);

  // Onto the chosen age once the ruler knows its width; with none chosen it stays at rest, at its start.
  useEffect(() => {
    if (width > 0 && shown.current !== null) scroller.current?.scrollTo({ x: offsetForAge(shown.current, range.min), animated: false });
  }, [width, range.min]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const age = chosenAtOffset(e.nativeEvent.contentOffset.x, shown.current, range);
    if (age === null) return;
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
    const move = ACTION_STEP[name];
    if (!move) return;
    const next = stepAge(shown.current ?? range.min, move.action, range, move.by);
    if (next === shown.current) return;
    shown.current = next;
    scroller.current?.scrollTo({ x: offsetForAge(next, range.min), animated: true });
    haptic('select');
    onChange(next);
  };

  const chosen = value !== null;
  const spoken = chosen ? t('guide.age.value', { age: formatNumber(value, locale) }) : t('guide.age.unset');
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t('guide.age.label')}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      aria-valuenow={value ?? undefined}
      aria-valuetext={spoken}
      accessibilityActions={[
        { name: 'increment' },
        { name: 'decrement' },
        { name: 'tenOlder', label: t('guide.age.tenOlder') },
        { name: 'tenYounger', label: t('guide.age.tenYounger') },
      ]}
      onAccessibilityAction={adjust}
      style={styles.root}
      testID="age-ruler"
    >
      <Text style={[styles.number, { color: chosen ? colors.textPrimary : colors.textSecondary }]} testID="age-ruler-number">
        {chosen ? formatNumber(value, locale) : NO_NUMBER}
      </Text>
      <Text style={[styles.unit, { color: colors.textSecondary }]} testID="age-ruler-unit">
        {chosen ? t('guide.age.yearsOld') : t('guide.age.prompt')}
      </Text>

      <View style={styles.ruler} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        {/* The ticks are not read out one by one: the control above says the age. */}
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
        {/* The pointer over the ruler's middle; it takes the brand's colour once an age is chosen. */}
        <View pointerEvents="none" style={[styles.pointer, { backgroundColor: chosen ? colors.primary : colors.textSecondary }]} />
        <LinearGradient colors={[colors.background, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fade, styles.fadeStart]} pointerEvents="none" />
        <LinearGradient colors={['transparent', colors.background]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fade, styles.fadeEnd]} pointerEvents="none" />
      </View>
    </View>
  );
}

/** The tick marks, drawn once: they change only with the colours and the numerals' language. */
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
