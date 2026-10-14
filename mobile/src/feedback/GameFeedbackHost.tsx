import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { NavigationContainerRefContext } from '@react-navigation/native';
import { Animated, Easing, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_FEEDBACK_DELAY_MS } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { radii, spacing } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { getFeedbackState, storeReviewPrompted } from './api';
import { APP_VERSION, appPlatform } from './appInfo';
import { onGameFinished, onResultsLeft, type GameFinish } from './gameFinished';
import { RatingBox } from './RatingBox';
import { feedbackSession, type FeedbackSession } from './session';
import { requestStoreReview } from './storeReview';

/** A second or two into the results, never as the game ends. */
export const STORE_PROMPT_DELAY_MS = 1800;

/**
 * Where the rating box appears, over whichever game has just finished.
 *
 * Mounted once, beside the screens. Every game calls `reportGameFinished` on
 * the transition into finished; this asks the API whether the account is due
 * and decides, once per session (session.ts):
 *
 * - the box: after the first finished game of the account's life, ~1.2 s into
 *   the results, as a small card over the bottom of the screen — the results
 *   stay on screen and usable above it, and "Not now" is one tap. It belongs
 *   to those results: leaving them (Back, another tab, a new game on the same
 *   screen) closes it, and it does not open once the player has left them;
 * - or the system's own store prompt: after a game won or a personal best,
 *   when the API says this phone may (a few games over more than one day, an
 *   adult, once per version, months apart), a moment into the results;
 * - or, nearly always, nothing.
 */
export function GameFeedbackHost({ session = feedbackSession }: { session?: FeedbackSession }): React.JSX.Element | null {
  const { client, user } = useAuth();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  // the app's navigation, to know which screen the results were on; null
  // outside a NavigationContainer (a test, a screen shown on its own)
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
            // gone from the results before it could appear: it was never
            // seen, so a later game this session may still offer it
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
            // not there after all (an old build, TestFlight): this session may still show the box
            else session.storeAsked = false;
          });
        });
      }
    },
    [client, user?.minor, session, currentRoute],
  );

  // Leaving the results closes the box. It is not answered, so the server is
  // not told it was shown and another session may offer it again; this one
  // will not (session.boxShown stays true).
  useEffect(() => {
    if (!open || !nav) return;
    return nav.addListener('state', () => {
      if (currentRoute() !== resultsRoute.current) setOpen(false);
    });
  }, [open, nav, currentRoute]);

  useEffect(() => onGameFinished((finish) => void handle(finish)), [handle]);
  // a game that plays again on the same screen (Race again) leaves its results too
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
    Animated.timing(enter, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [open, reduceMotion, enter]);

  if (!open) return null;

  return (
    <KeyboardAvoidingView
      style={StyleSheet.absoluteFill}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      pointerEvents="box-none"
    >
      <View style={styles.dock} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.background,
              shadowColor: colors.softShadow,
              // a shadow does not show on a dark screen: the edge does it there
              borderColor: scheme === 'dark' ? colors.glassBorder : colors.separator,
              marginBottom: Math.max(insets.bottom, spacing.md),
              opacity: enter,
              transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
            },
          ]}
        >
          {/* lifted a step above the screen behind it, as a raised surface is in the dark theme */}
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
  // the clipping sits inside, so iOS still draws the card's shadow
  lift: { flexShrink: 1, borderRadius: radii.xl, overflow: 'hidden' },
  scroll: { padding: spacing.md },
});
