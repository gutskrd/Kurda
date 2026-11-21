import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, BackHandler, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { haptic } from './haptics';
import {
  APP_FEEDBACK_CATEGORIES,
  APP_FEEDBACK_COMMENT_MAX,
  feedbackFollowUp,
  type AppFeedbackCategory,
  type AppFeedbackSource,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { display } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { HevaloDeer } from './HevaloDeer';
import { dismissFeedback, sendFeedback } from './api';
import { APP_VERSION, appPlatform } from './appInfo';
import { heldDim } from '../theme/MotionParts';
import { useDirection } from '../reports/direction';

const CATEGORY_LABEL: Record<AppFeedbackCategory, TranslationKey> = {
  lessons: 'appFeedback.category.lessons',
  games: 'appFeedback.category.games',
  stories: 'appFeedback.category.stories',
  bugs: 'appFeedback.category.bugs',
  too_hard: 'appFeedback.category.tooHard',
  too_easy: 'appFeedback.category.tooEasy',
  other: 'appFeedback.category.other',
};

const STAR_LABEL: Record<number, TranslationKey> = {
  1: 'appFeedback.stars.1',
  2: 'appFeedback.stars.2',
  3: 'appFeedback.stars.3',
  4: 'appFeedback.stars.4',
  5: 'appFeedback.stars.5',
};

/**
 * "How are you enjoying Hevalo?": the deer holds up a board of five stars.
 *
 * After a first finished game (source `first_game`) it asks for stars first: under three, "what could be better?"
 * with chips and a box; three and up, a thank-you and an optional "what do you love?". From Settings (source
 * `settings`) it shows the whole form at once with stars optional.
 *
 * Every answer goes to the admin feedback inbox and ends in a thank-you from a happy deer. Nothing here links to
 * a store: sending only happy users to rate the app is review gating, which store and consumer rules forbid
 * (shared/src/feedback.ts). "Not now" closes it and counts as shown.
 */
export function RatingBox({
  source,
  onClose,
}: {
  source: AppFeedbackSource;
  /** `answered`: something was sent; `dismissed`: "Not now". */
  onClose: (how: 'answered' | 'dismissed') => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [stars, setStars] = useState(0);
  const [categories, setCategories] = useState<AppFeedbackCategory[]>([]);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const settings = source === 'settings';
  const followUp = stars > 0 ? feedbackFollowUp(stars) : null;

  // Screen readers hear the question when the box appears (the user did not open it) and the thank-you once sent.
  useEffect(() => {
    if (source === 'first_game' || sent) {
      AccessibilityInfo.announceForAccessibility?.(sent ? t('appFeedback.thanksRead') : t('appFeedback.question'));
    }
  }, [sent, source, t]);

  const toggle = (c: AppFeedbackCategory) =>
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const trimmed = comment.trim();
  const canSend = settings ? stars > 0 || categories.length > 0 || trimmed.length > 0 : stars > 0;

  const send = async () => {
    if (!canSend || sending) return;
    setSending(true);
    setError(null);
    const res = await sendFeedback(client, {
      ...(stars > 0 ? { stars } : {}),
      // The chips belong to "what could be better?", so a happy answer sends none.
      ...(categories.length > 0 && (settings || followUp === 'improve') ? { categories } : {}),
      ...(trimmed ? { comment: trimmed } : {}),
      source,
      platform: appPlatform(Platform.OS),
      appVersion: APP_VERSION,
      locale,
    });
    setSending(false);
    if (res.ok) setSent(true);
    else setError(describeError(res.error, t));
  };

  const notNow = () => {
    // Counts as shown on every device; if this fails the box may ask again, which is harmless. Stars already
    // tapped are an answer, and every answer reaches the admin, so they are sent.
    if (!settings) {
      if (stars > 0) {
        void sendFeedback(client, { stars, source, platform: appPlatform(Platform.OS), appVersion: APP_VERSION, locale });
      } else void dismissFeedback(client);
    }
    onClose('dismissed');
  };

  // Over a game's results, Android's back means "Not now", not a step back underneath. From Settings it sits in a
  // sheet that handles back itself.
  const notNowRef = useRef(notNow);
  notNowRef.current = notNow;
  const thanksRef = useRef<() => void>(() => onClose('answered'));
  thanksRef.current = () => onClose('answered');
  useEffect(() => {
    if (settings || Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sent) thanksRef.current();
      else notNowRef.current();
      return true;
    });
    return () => sub.remove();
  }, [settings, sent]);

  if (sent) {
    return (
      <View style={styles.box}>
        {/* The stars they gave, never more (the smile is never sad); text without stars gets a heart. */}
        <HevaloDeer size={settings ? 120 : 96} board={stars > 0 ? { kind: 'stars', stars } : { kind: 'letters', letters: '♥' }} />
        <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header" accessibilityLiveRegion="polite">
          {t('appFeedback.thanksRead')}
        </Text>
        <ClayButton label={t('common.close')} tone="primary" onPress={() => onClose('answered')} style={styles.stretch} />
      </View>
    );
  }

  return (
    <View style={styles.box}>
      {settings ? (
        <>
          <HevaloDeer size={110} board={{ kind: 'stars', stars }} />
          <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
            {t('appFeedback.settingsTitle')}
          </Text>
          <Text style={[styles.lead, { color: colors.textSecondary }]}>{t('appFeedback.question')}</Text>
        </>
      ) : (
        // Over a game's results it starts small (deer, question, stars, "Not now") so the results stay in sight,
        // and grows only once a star is tapped.
        <View style={[styles.head, { flexDirection: dir.row }]}>
          <HevaloDeer size={72} board={{ kind: 'stars', stars }} />
          <Text style={[styles.title, styles.headTitle, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
            {t('appFeedback.question')}
          </Text>
        </View>
      )}

      {/* The stars fill from the reading-start side, and chosen ones are violet like any choice; gold is kept for what is earned. */}
      <View style={[styles.stars, { flexDirection: dir.row }]} accessibilityRole="radiogroup" accessibilityLabel={t('appFeedback.question')}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = n <= stars;
          return (
            <Pressable
              key={n}
              onPress={() => {
                if (n !== stars) haptic('select');
                setStars(n);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: n === stars }}
              accessibilityLabel={t(STAR_LABEL[n]!)}
              style={({ pressed }) => [styles.star, pressed && heldDim]}
            >
              <Icon name={on ? 'star-fill' : 'star'} size={36} color={on ? colors.primary : colors.textSecondary} />
            </Pressable>
          );
        })}
      </View>

      {followUp === 'love' && !settings ? (
        <Text style={[styles.follow, { color: colors.textPrimary }]} accessibilityLiveRegion="polite">
          {t('appFeedback.thanksLove')}
        </Text>
      ) : null}
      {followUp === 'improve' && !settings ? (
        <Text style={[styles.follow, { color: colors.textPrimary }]} accessibilityLiveRegion="polite">
          {t('appFeedback.improve')}
        </Text>
      ) : null}

      {settings || followUp === 'improve' ? (
        // What it is about, as many as apply: one that is on is solid violet, as every chosen chip is.
        <View style={[styles.chips, { flexDirection: dir.row }]}>
          {APP_FEEDBACK_CATEGORIES.map((c) => {
            const on = categories.includes(c);
            return (
              <Pressable
                key={c}
                onPress={() => toggle(c)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={({ pressed }) => [styles.chip, { backgroundColor: on ? colors.primary : colors.controlTrack }, pressed && heldDim]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn, { color: on ? colors.textOnPrimary : colors.textPrimary }]}>
                  {t(CATEGORY_LABEL[c])}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* A field is labelled in persistent text, not only a placeholder, unless the line just above already asks it (the under-3 thank-you does). */}
      {settings || followUp === 'love' ? (
        <Text style={[styles.fieldLabel, dir.text, { color: colors.textSecondary }]}>
          {t(followUp === 'love' && !settings ? 'appFeedback.loveLabel' : 'appFeedback.improveLabel')}
        </Text>
      ) : null}
      {settings || followUp ? (
        <TextInput
          value={comment}
          onChangeText={setComment}
          multiline
          maxLength={APP_FEEDBACK_COMMENT_MAX}
          placeholder={t('appFeedback.improvePlaceholder')}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={t(followUp === 'love' && !settings ? 'appFeedback.loveLabel' : 'appFeedback.improveLabel')}
          // Right to left, what is typed starts at the right.
          style={[styles.input, dir.row === 'row-reverse' && styles.inputMirrored, { color: colors.textPrimary, backgroundColor: colors.controlTrack }]}
        />
      ) : null}

      {error ? (
        <Text style={[styles.error, { color: colors.danger }]} accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}

      {settings || followUp ? (
        <ClayButton
          label={followUp === 'love' && !trimmed && !settings ? t('common.done') : t('appFeedback.send')}
          tone="primary"
          busy={sending}
          disabled={!canSend}
          onPress={() => void send()}
          style={styles.stretch}
        />
      ) : null}
      {!settings ? (
        <Pressable onPress={notNow} accessibilityRole="button" style={({ pressed }) => [styles.notNow, pressed && heldDim]} hitSlop={6}>
          <Text style={[styles.notNowText, { color: colors.textSecondary }]}>{t('appFeedback.notNow')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', gap: spacing.sm },
  title: { ...display(typography.sizes.text), textAlign: 'center' },
  head: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headTitle: { flex: 1, textAlign: 'auto' },
  lead: { fontSize: typography.sizes.text, textAlign: 'center' },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 2 },
  star: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  follow: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: typography.sizes.text, fontWeight: typography.weights.medium },
  chipTextOn: { fontWeight: typography.weights.semibold },
  fieldLabel: { alignSelf: 'stretch', fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  input: {
    alignSelf: 'stretch',
    minHeight: 84,
    maxHeight: 160,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: typography.sizes.text,
    textAlignVertical: 'top',
  },
  inputMirrored: { textAlign: 'right' },
  error: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
  notNow: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.md },
  notNowText: { fontSize: typography.sizes.text, fontWeight: typography.weights.medium },
});
