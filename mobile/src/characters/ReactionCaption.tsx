import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { REACTION_CAPTION_AFTER_MS, REACTION_NAMES, reactionMeaning } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { timing } from '../theme/animate';
import { duration } from '../theme/motion';
import { Pressable } from '../theme/Pressable';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { loadReactions, onReaction, type Speaking } from './reactions';
import { SpeakingCharacter } from './SpeakingCharacter';

/** Shown at least this long, however short the line. */
const LEAST_MS = 1800;
/** Kept this long after the meaning is opened, so it can be read. */
const READ_MS = 4000;
/** The face beside the words, head and neck. */
const FACE = 36;

/**
 * Hevalo's and Xezo's reaction lines (characters/reactions.ts) where they are read in the app, and the recorded takes
 * read for them. Mounted once at the root, over every screen.
 */
export function ReactionVoices(): React.JSX.Element | null {
  const { client } = useAuth();
  useEffect(() => {
    void loadReactions(client);
  }, [client]);
  return <ReactionCaption />;
}

/**
 * The line a character is saying, in a small caption at the top: the Kurmancî, with the character's face saying it when
 * the character is not drawn on screen already. A tap shows what it means in the reader's language (a Kurmancî reader
 * has it already). Gone a moment after the line ends.
 */
export function ReactionCaption(): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<Speaking | null>(null);
  const [open, setOpen] = useState(false);
  const opened = useRef(false);
  const since = useRef(0);
  const hide = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const arrive = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const off = onReaction((s) => {
      clearTimeout(hide.current);
      if (s) {
        since.current = Date.now();
        opened.current = false;
        setOpen(false);
        setShown(s);
        return;
      }
      const left = opened.current ? READ_MS : Math.max(REACTION_CAPTION_AFTER_MS, LEAST_MS - (Date.now() - since.current));
      hide.current = setTimeout(() => setShown(null), left);
    });
    return () => {
      off();
      clearTimeout(hide.current);
    };
  }, []);

  useEffect(() => {
    arrive.setValue(0);
    if (!shown) return;
    const run = timing(arrive, 1, duration.base);
    run.start();
    return () => run.stop();
  }, [shown, arrive]);

  if (!shown) return null;
  const { clip, drawn, clock } = shown;
  const meaning = reactionMeaning(clip.line, locale);
  const own = meaning === clip.line.ku;
  const translateY = reduce ? 0 : arrive.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] });
  const toggle = (): void => {
    const next = !open;
    opened.current = next;
    setOpen(next);
    clearTimeout(hide.current);
    hide.current = setTimeout(() => setShown(null), next ? READ_MS : REACTION_CAPTION_AFTER_MS);
  };
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + spacing.sm }]}>
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: colors.surfaceRaised, borderColor: colors.separator, shadowColor: colors.softShadow },
          { opacity: arrive, transform: [{ translateY }] },
        ]}
        testID="reaction-caption"
      >
        <Pressable
          onPress={own ? undefined : toggle}
          disabled={own}
          accessibilityRole={own ? 'text' : 'button'}
          accessibilityLabel={t('reactions.says', { name: REACTION_NAMES[clip.character], line: clip.line.ku })}
          accessibilityHint={own ? undefined : meaning}
          accessibilityState={own ? undefined : { expanded: open }}
          style={[styles.row, { flexDirection: dir.row }, drawn && styles.bare]}
        >
          {drawn ? null : (
            <View
              style={[styles.face, { backgroundColor: colors.controlTrack }]}
              aria-hidden
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              testID="reaction-caption-face"
            >
              <SpeakingCharacter
                speaker={clip.character}
                player={clock}
                playing
                source={clip.src}
                voice={clip.voice}
                text={clip.line.ku}
                crop="head"
                height={FACE}
                flip={dir.rtl}
              />
            </View>
          )}
          <View style={styles.words}>
            <Text style={[styles.ku, { color: colors.textPrimary }]}>{clip.line.ku}</Text>
            {open ? <Text style={[styles.means, dir.text, { color: colors.textSecondary }]}>{meaning}</Text> : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'center', zIndex: 120 },
  card: {
    maxWidth: 420,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  row: { minHeight: 48, alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs, paddingStart: spacing.xs, paddingEnd: spacing.md },
  bare: { paddingStart: spacing.md },
  face: { width: FACE, height: FACE, borderRadius: radii.pill, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end' },
  words: { flexShrink: 1 },
  ku: { fontSize: typography.sizes.text, fontWeight: '600', lineHeight: 20, writingDirection: 'ltr' },
  means: { fontSize: typography.sizes.text, lineHeight: 22 },
});
