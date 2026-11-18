import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { haptic } from '../../feedback/haptics';
import { useI18n } from '../../i18n/I18nContext';
import { useHardwareBack } from '../../navigation/hardwareBack';
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
import { heldDim } from '../../theme/MotionParts';

/**
 * How a step's turn with the server ended: on to the next, or refused, with the line for under the field (null when the
 * screen said it its own way), the step the refusal is really about when it is an earlier one, and what Hevalo says in
 * place of his usual line.
 */
export type StepOutcome = { ok: true } | { ok: false; error: string | null; at?: string; says?: string };

/** What a step's field is given, to take part in the flow. */
export interface StepTools {
  /** Go on, as the Continue button does: for the keyboard's return key. */
  submit: () => void;
  /** The answer changed: the line that refused the last one goes. */
  edited: () => void;
  /** Why this step was refused, for the field to show it. */
  error: string | null;
  /** The server has the answer and the flow is waiting on it. */
  busy: boolean;
}

/** One question of a guided flow. */
export interface FlowStep {
  /** Names the step, for the slides and for a refusal that points back at it. */
  key: string;
  /** The question, as the large heading. */
  question: string;
  /** What Hevalo says on arriving at it. */
  says: string;
  /** The one field or control under the question. */
  render: (tools: StepTools) => ReactNode;
  /** Why the answer cannot go on, or null: said under the field with a shake, before the server is asked. */
  check?: () => string | null;
  /** The server's turn, after the check; the flow waits on it. */
  commit?: () => Promise<StepOutcome>;
  /** The button's word, where it is not Continue (Create account, Start learning). */
  action?: string;
  /** Under the field: a Forgot link, the terms line. */
  footer?: ReactNode;
}

/**
 * One question per screen, with Hevalo as the guide: a segmented progress bar, a chevron back a step (or out, on the
 * first), Hevalo saying the step's line, the question over one field, and Continue above the keyboard. Steps slide the
 * way the reader reads. A refused answer shakes, shows one line under the field and gets Hevalo's tilt (plus an error
 * buzz when the server refused it); a passing one gets a tick, his cheer, and the next question. Under Reduce Motion
 * everything is simply its end state.
 *
 * The flow owns which step shows and the refusals; the screen owns the answers and the steps (`FlowStep`). A `notice`
 * from the screen shows over the current step's field.
 */
export function StepFlow({
  steps,
  onFinish,
  onExit,
  presented = false,
  notice,
  progress = true,
  testID = 'step-flow',
}: {
  steps: readonly FlowStep[];
  /** The last step went through. */
  onFinish: () => void;
  /** Back from the first step; without it the first step has no way back. */
  onExit?: () => void;
  /** Opened over the app rather than pushed: the first step's way out is ✕, as on every presented page. */
  presented?: boolean;
  notice?: ReactNode;
  /** False leaves the bar out: a flow of one question (the emailed code) has nothing to count. */
  progress?: boolean;
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
  // What Hevalo says in place of the step's line, after a refusal.
  const [said, setSaid] = useState<string | null>(null);
  const { reaction, react } = useGuideReaction();
  const shake = useShake();

  const step = steps[Math.min(index, steps.length - 1)]!;
  const canBack = index > 0 || onExit !== undefined;
  const closes = presented && index === 0;

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
        // The server refused something that was asked for: felt as well as seen. An answer the screen turns back itself
        // is not, since that field is still being typed in.
        haptic('error');
        // A refusal about an earlier answer: back to that step, with the line under its field.
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
  // Android's back goes back a question as the chevron does; from the first it leaves as any screen does.
  useHardwareBack(index > 0 ? back : null);

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
              <Pressable
                onPress={back}
                accessibilityRole="button"
                accessibilityLabel={t(closes ? 'common.close' : 'common.back')}
                hitSlop={8}
                style={({ pressed }) => [styles.back, pressed && heldDim]}
                testID="step-back"
              >
                {closes ? (
                  <Icon name="close" size={24} color={colors.textPrimary} />
                ) : (
                  <Icon name="chevron-left" size={26} color={colors.textPrimary} style={dir.flip ?? undefined} />
                )}
              </Pressable>
            ) : (
              <View style={styles.back} />
            )}
            {progress ? (
              <Progress count={steps.length} filled={index + 1} mirrored={dir.row === 'row-reverse'} label={t('guide.step', { step: index + 1, count: steps.length })} />
            ) : (
              <View style={styles.flex} />
            )}
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
 * Where the flow is: a bar in one piece per step, the done and current ones filled in the brand's colour. A piece fills
 * from its start side on the standard spring, as a transform so the row is not laid out again; under Reduce Motion it
 * is simply full.
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
