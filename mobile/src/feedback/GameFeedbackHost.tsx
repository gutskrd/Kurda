import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { NavigationContainerRefContext } from '@react-navigation/native';
import { Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_FEEDBACK_DELAY_MS } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { timing } from '../theme/animate';
import { duration } from '../theme/motion';
import { radii, spacing } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { getFeedbackState, storeReviewPrompted } from './api';
import { APP_VERSION, appPlatform } from './appInfo';
import { onGameFinished, onResultsLeft, setRatingBoxInset, type GameFinish } from './gameFinished';
import { RatingBox } from './RatingBox';
import { feedbackSession, type FeedbackSession } from './session';
import { requestStoreReview } from './storeReview';

/** A second or two into the results, never as the game ends. */
export const STORE_PROMPT_DELAY_MS = 1800;

/**
 * Shows the rating box over whichever game just finished. Mounted once beside the screens. Each game calls
 * `reportGameFinished` on entering its finished state; this asks the API whether the account is due and decides
 * once per session (session.ts):
 *
 * - the box: after the account's first finished game, about 1.2 s into the results, as a small card at the bottom
 *   with the results still usable above it and "Not now" one tap away. Leaving those results closes it, and it does
 *   not open once they are left;
 * - or the system store prompt: after a win or personal best, when the API allows it for this phone (a few games
 *   over
 *   more than a day, an adult, once per version, months apart);
 * - or, nearly always, nothing.
 */
export function GameFeedbackHost({ session = feedbackSession }: { session?: FeedbackSession }): React.JSX.Element | null {
  const { client, user } = useAuth();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  // The app's navigation, to know which screen the results were on; null outside a NavigationContainer (tests, a
  // standalone screen).
  const nav = useContext(NavigationContainerRefContext);
  const [open, setOpen] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** The screen the game finished on. */
  const resultsRoute = useRef<string | undefined>(undefined);
  /** Bumped when the results are left, so a box still waiting to appear does not. */
  const visit = useRef(0);
  const currentRoute = useCallback(() => (nav?.isReady() ? nav.getCurrentRoute()?.key : undefined), [nav]);
  const enter = useRef(new Animated.Value(0)).current;

  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const handle = useCallback(
    async (finish: GameFinish) => {
      const finishedOn = currentRoute();
      const thisVisit = visit.current;
      const platform = appPlatform(Platform.OS);
      const res = await getFeedbackState(client, platform, APP_VERSION);
      const decision = session.decide({
        state: res.ok ? res.data : null,
        finish,
        platform,
        minor: user?.minor === true,
      });
      if (decision === 'box') {
        session.boxShown = true;
        later(APP_FEEDBACK_DELAY_MS, () => {
          if (currentRoute() !== finishedOn || visit.current !== thisVisit) {
            // Left the results before it appeared: it was never seen, so a later game this session may still offer it.
            session.boxShown = false;
            return;
          }
          resultsRoute.current = finishedOn;
          setOpen(true);
        });
      } else if (decision === 'store') {
        session.storeAsked = true;
        later(STORE_PROMPT_DELAY_MS, () => {
          void requestStoreReview().then((asked) => {
            if (asked) void storeReviewPrompted(client, APP_VERSION);
            // Not there after all (an old build, TestFlight): this session may still show the box.
            else session.storeAsked = false;
          });
        });
      }
    },
    [client, user?.minor, session, currentRoute],
  );

  // Leaving the results closes the box unanswered, so the server is not told it was shown and another session may
  // offer it again; this one will not (session.boxShown stays true).
  useEffect(() => {
    if (!open || !nav) return;
    return nav.addListener('state', () => {
      if (currentRoute() !== resultsRoute.current) setOpen(false);
    });
  }, [open, nav, currentRoute]);

  useEffect(() => onGameFinished((finish) => void handle(finish)), [handle]);
  // A game that plays again on the same screen (Race again) leaves its results too.
  useEffect(
    () =>
      onResultsLeft(() => {
        visit.current += 1;
        setOpen(false);
      }),
    [],
  );
  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    if (reduceMotion) {
      enter.setValue(1);
      return;
    }
    enter.setValue(0);
    timing(enter, 1, duration.slow).start();
  }, [open, reduceMotion, enter]);

  // Nothing covers the results once it has gone.
  useEffect(() => {
    if (!open) setRatingBoxInset(0);
  }, [open]);
  useEffect(() => () => setRatingBoxInset(0), []);

  if (!open) return null;

  return (
    <KeyboardAvoidingView
      style={StyleSheet.absoluteFill}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      pointerEvents="box-none"
    >
      <View style={styles.dock} pointerEvents="box-none">
        <Animated.View
          onLayout={(e) => setRatingBoxInset(e.nativeEvent.layout.height + Math.max(insets.bottom, spacing.md))}
          style={[
            styles.card,
            {
              backgroundColor: colors.background,
              shadowColor: colors.softShadow,
              // A shadow does not show on a dark screen: the edge does it there.
              borderColor: scheme === 'dark' ? colors.glassBorder : colors.separator,
              marginBottom: Math.max(insets.bottom, spacing.md),
              opacity: enter,
              transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
            },
          ]}
        >
          {/* Lifted a step above the screen behind it, as a raised surface is in the dark theme. */}
          <View style={[styles.lift, scheme === 'dark' ? { backgroundColor: colors.glassFill } : null]}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bounces={false}>
              <RatingBox source="first_game" onClose={() => setOpen(false)} />
            </ScrollView>
          </View>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  dock: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: spacing.md },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '86%',
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 12,
  },
  // The clipping sits inside, so iOS still draws the card's shadow.
  lift: { flexShrink: 1, borderRadius: radii.xl, overflow: 'hidden' },
  scroll: { padding: spacing.md },
});
