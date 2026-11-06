import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { haptic } from '../../feedback/haptics';
import { useI18n } from '../../i18n/I18nContext';
import { useDirection } from '../../reports/direction';
import { springTo, useShake } from '../../theme/animate';
import { display } from '../../theme/fonts';
import { ClayButton, GradientBackground } from '../../theme/glass';
import { Icon } from '../../theme/Icon';
import { SlideSwap, type SlideDirection } from '../../theme/SlideSwap';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';
import { GAZE_AT_FIELD, HevaloGuide } from './HevaloGuide';
import { useGuideReaction } from './reaction';

/**
 * How a step's turn with the server ended: on to the next, or refused — with
 * the line to show under the field (null when the screen has said it in its
 * own way, with a notice), the step the refusal is really about when it is
 * an earlier one (a password found in a leak, said on the password step), and
 * what Hevalo says about it in place of his usual "have another look".
 */
export type StepOutcome = { ok: true } | { ok: false; error: string | null; at?: string; says?: string };

/** What a step's field is given, to take part in the flow. */
export interface StepTools {
  /** go on, as the Continue button does: for the keyboard's return key */
  submit: () => void;
  /** the answer changed: the line that refused the last one goes */
  edited: () => void;
  /** why this step was refused, for the field to show it was */
  error: string | null;
  /** the server has the answer and the flow is waiting on it */
  busy: boolean;
}

/** One question of a guided flow. */
export interface FlowStep {
  /** names the step, for the slides and for a refusal that points back at it */
  key: string;
  /** the question, as the large heading */
  question: string;
  /** what Hevalo says on arriving at it */
  says: string;
  /** the one field or control under the question */
  render: (tools: StepTools) => ReactNode;
  /** why the answer cannot go on, or null: said under the field with a shake, before the server is asked */
  check?: () => string | null;
  /** the server's turn, after the check; the flow waits on it */
  commit?: () => Promise<StepOutcome>;
  /** the button's word, where it is not Continue (Create account, Start learning) */
  action?: string;
  /** under the field: a Forgot link, the terms line */
  footer?: ReactNode;
}

/**
 * One question per screen, with Hevalo as the guide.
 *
 * A thin segmented bar at the top fills a step at a time on a spring; a
 * chevron goes back a step (or out of the flow, on the first); Hevalo stands
 * under the bar saying the step's line; the question is a large heading over
 * one field; and the Continue button sits at the foot of the screen, above
 * the keyboard. Steps turn the way the reader reads (SlideSwap, mirrored for
 * Soranî and Arabic). An answer that is refused shakes, shows one line under
 * the field, and gets Hevalo's tilt of the head; one that passes gets a light
 * tick and his cheer, and the next question. Under Reduce Motion the bar,
 * the slides and the shake are simply the end state.
 *
 * The flow owns which step is showing and the refusals; the screen owns the
 * answers, in its own state, and what each step is (`FlowStep`). A `notice`
 * from the screen — an address that may already have an account — is shown
 * over the field of whichever step is up.
 */
export function StepFlow({
  steps,
  onFinish,
  onExit,
  notice,
  testID = 'step-flow',
}: {
  steps: readonly FlowStep[];
  /** the last step went through */
  onFinish: () => void;
  /** back from the first step; without it the first step has no way back */
  onExit?: () => void;
  notice?: ReactNode;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<SlideDirection>('forward');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // what Hevalo says in place of the step's line, after a refusal
  const [said, setSaid] = useState<string | null>(null);
  const { reaction, react } = useGuideReaction();
  const shake = useShake();

  const step = steps[Math.min(index, steps.length - 1)]!;
  const canBack = index > 0 || onExit !== undefined;

  const goTo = (next: number, way: SlideDirection): void => {
    setIndex(next);
    setDirection(way);
    setError(null);
    setSaid(null);
  };

  const refuse = (why: string | null, line?: string): void => {
    setError(why);
    setSaid(line ?? t('guide.refused.says'));
    if (why) shake.run();
    react('hmm');
  };

  const submit = async (): Promise<void> => {
    if (busy) return;
    const why = step.check?.() ?? null;
    if (why) {
      refuse(why);
      return;
    }
    if (step.commit) {
      setBusy(true);
      const out = await step.commit();
      setBusy(false);
      if (!out.ok) {
        // a refusal about an earlier answer: back to that step, with the line under its field
        const at = out.at !== undefined && out.at !== step.key ? steps.findIndex((s) => s.key === out.at) : -1;
        if (at >= 0) {
          goTo(at, at < index ? 'back' : 'forward');
          setError(out.error);
          setSaid(out.says ?? t('guide.refused.says'));
          react('hmm');
          return;
        }
        refuse(out.error, out.says);
        return;
      }
    }
    haptic('select');
    react('cheer');
    if (index >= steps.length - 1) onFinish();
    else goTo(index + 1, 'forward');
  };

  const back = (): void => {
    if (busy) return;
    if (index > 0) goTo(index - 1, 'back');
    else onExit?.();
  };

  const tools: StepTools = {
    submit: () => void submit(),
    edited: () => setError(null),
    error,
    busy,
  };

  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.flex, { paddingTop: insets.top + spacing.sm }]} testID={testID}>
          <View style={[styles.bar, { flexDirection: dir.row }]}>
            {canBack ? (
              <Pressable onPress={back} accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={8} style={styles.back} testID="step-back">
                <Icon name="chevron-left" size={26} color={colors.textPrimary} style={dir.flip ?? undefined} />
              </Pressable>
            ) : (
              <View style={styles.back} />
            )}
            <Progress count={steps.length} filled={index + 1} mirrored={dir.row === 'row-reverse'} label={t('guide.step', { step: index + 1, count: steps.length })} />
            <View style={styles.back} />
          </View>

          <HevaloGuide says={said ?? step.says} reaction={reaction} gaze={GAZE_AT_FIELD} style={styles.guide} />

          <ScrollView style={styles.flex} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <SlideSwap id={step.key} direction={direction} mirrored={dir.rtl}>
              <Animated.View style={{ transform: [{ translateX: shake.translateX }] }}>
                <Text style={[styles.question, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
                  {step.question}
                </Text>
                {notice}
                {step.render(tools)}
                {error ? (
                  <Text style={[styles.error, dir.text, { color: colors.danger }]} accessibilityLiveRegion="polite" testID="step-error">
                    {error}
                  </Text>
                ) : null}
                {step.footer}
              </Animated.View>
            </SlideSwap>
          </ScrollView>

          <View style={[styles.foot, { paddingBottom: insets.bottom + spacing.md }]}>
            <ClayButton label={step.action ?? t('common.continue')} tone="primary" size="large" busy={busy} onPress={() => void submit()} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

/**
 * Where the flow is: a thin bar in as many pieces as there are steps, the
 * ones done and the one up filled in the brand's colour. A piece fills by
 * growing from its start side on the standard spring — a transform, so it
 * never lays the row out again — and is simply full under Reduce Motion.
 */
function Progress({ count, filled, mirrored, label }: { count: number; filled: number; mirrored: boolean; label: string }): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const fills = useMemo(() => Array.from({ length: count }, (_, i) => new Animated.Value(i < filled ? 1 : 0)), [count]);

  useEffect(() => {
    const runs = fills.map((fill, i) => {
      const to = i < filled ? 1 : 0;
      if (reduce) {
        fill.setValue(to);
        return null;
      }
      const run = springTo(fill, to, 'standard');
      run.start();
      return run;
    });
    return () => runs.forEach((run) => run?.stop());
  }, [filled, reduce, fills]);

  return (
    <View
      style={[styles.progress, { flexDirection: mirrored ? 'row-reverse' : 'row' }]}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      aria-valuemin={0}
      aria-valuemax={count}
      aria-valuenow={filled}
      testID="step-progress"
    >
      {fills.map((fill, i) => (
        <View key={i} style={[styles.segment, { backgroundColor: colors.controlTrack }]}>
          <Animated.View
            style={[styles.segmentFill, { backgroundColor: colors.primary, transformOrigin: mirrored ? 'right center' : 'left center', transform: [{ scaleX: fill }] }]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { alignItems: 'center', paddingHorizontal: spacing.sm, gap: spacing.xs },
  back: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  progress: { flex: 1, gap: spacing.xs, height: 4 },
  segment: { flex: 1, height: 4, borderRadius: radii.pill, overflow: 'hidden' },
  segmentFill: { flex: 1, borderRadius: radii.pill },
  guide: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  body: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  question: { ...display(typography.sizes.xxl), marginBottom: spacing.lg },
  error: { fontSize: typography.sizes.sm, marginTop: spacing.sm, lineHeight: 20 },
  foot: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
