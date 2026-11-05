import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  FOREHEAD,
  deerSilhouetteSvg,
  dialectDirection,
  learnGame,
  meaningIn,
  type GameDialect,
  type Meanings,
  type WhoAmIAsked,
  type WhoAmIQuestion,
  type WhoAmITile,
} from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { TONES } from '../coursemap/path';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { ClayButton } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

/**
 * Who Am I?'s stage on the phone, the same for a round alone and for the
 * race (the website's whoami/WhoAmIStage.tsx): Hevalo's silhouette with the
 * hidden word's card on his forehead, the deck of Kurdish questions — a tap
 * shows what one means, Ask asks it, and its answer is stamped on it in the
 * dialect's own yes or no — and the tiles to guess from, a wrong one crossed
 * out. Kurdish keeps its own direction everywhere; with Reduce Motion the
 * card and the stamps simply appear.
 */

export const WHO_AM_I_TONE = learnGame('who-am-i').tone;

const CATEGORY_KEY: Record<string, TranslationKey> = {
  animal: 'games.whoAmI.cat.animal',
  object: 'games.whoAmI.cat.object',
  profession: 'games.whoAmI.cat.profession',
  food: 'games.whoAmI.cat.food',
  place: 'games.whoAmI.cat.place',
};

const PAPER = '#fbf6e9';
const PAPER_INK = '#2a2a33';
const YES = '#2e7a52';
const NO = '#a9532f';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** The dialect's own yes or no, from the catalogue. */
export function yesNo(dialect: GameDialect, answer: boolean, t: Translate): string {
  if (dialect === 'ckb') return t(answer ? 'games.whoAmI.yesCkb' : 'games.whoAmI.noCkb');
  return t(answer ? 'games.whoAmI.yesKmr' : 'games.whoAmI.noKmr');
}

function kurdish(dialect: GameDialect): { writingDirection: 'rtl' | 'ltr' } {
  return { writingDirection: dialectDirection(dialect).dir };
}

const STAGE = 220;
const CARD_W = STAGE * FOREHEAD.width;
const CARD_H = 64;

export function ForeheadCard({
  dialect,
  category,
  identity,
}: {
  dialect: GameDialect;
  /** what kind of thing it is, when the card may say (every tile that kind); null when it may not */
  category: string | null;
  identity: { word: string; meanings: Meanings } | null;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const { scheme } = useTheme();
  const reduce = useReducedMotion();
  const tone = TONES[scheme][WHO_AM_I_TONE];
  const svg = useMemo(() => deerSilhouetteSvg(tone.lip, STAGE, t('games.whoAmI.card')), [tone.lip, t]);
  const turn = useRef(new Animated.Value(identity && !reduce ? 0 : 1)).current;
  const shown = !!identity;
  useEffect(() => {
    if (!shown || reduce) {
      turn.setValue(1);
      return;
    }
    turn.setValue(0);
    const anim = Animated.timing(turn, { toValue: 1, duration: 480, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [shown, reduce, turn]);
  const rotateY = turn.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '0deg'] });
  const kind = category !== null && CATEGORY_KEY[category] ? t(CATEGORY_KEY[category]!) : null;
  return (
    <View style={styles.stage}>
      <View accessible={false} importantForAccessibility="no-hide-descendants">
        <SvgXml xml={svg} width={STAGE} height={STAGE} />
      </View>
      <Animated.View
        style={[
          styles.card,
          { left: STAGE * FOREHEAD.x - CARD_W / 2, top: STAGE * FOREHEAD.y - CARD_H / 2, borderColor: tone.fill },
          { transform: [{ perspective: 600 }, { rotateY }, { rotate: '-2deg' }] },
        ]}
        accessibilityLiveRegion="polite"
      >
        {identity ? (
          <>
            <Text style={[styles.cardWord, kurdish(dialect)]} numberOfLines={1} adjustsFontSizeToFit>
              {identity.word}
            </Text>
            <Text style={styles.cardKind} numberOfLines={1}>
              {meaningIn(identity.meanings, locale) ?? identity.meanings.en}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.cardMark} accessibilityLabel={t('games.whoAmI.card')}>
              ?
            </Text>
            {kind ? <Text style={styles.cardKind}>{kind}</Text> : null}
          </>
        )}
      </Animated.View>
    </View>
  );
}

function Stamp({ dialect, answer }: { dialect: GameDialect; answer: boolean }): React.JSX.Element {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const land = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    const anim = Animated.spring(land, { toValue: 1, useNativeDriver: true, friction: 6 });
    anim.start();
    return () => anim.stop();
  }, [land, reduce]);
  const scale = land.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] });
  const colour = answer ? YES : NO;
  return (
    <Animated.Text
      style={[styles.stamp, kurdish(dialect), { color: colour, borderColor: colour, opacity: land, transform: [{ rotate: '-8deg' }, { scale }] }]}
     
    >
      {yesNo(dialect, answer, t)}
    </Animated.Text>
  );
}

export function QuestionDeck({
  dialect,
  questions,
  asked,
  disabled,
  onAsk,
}: {
  dialect: GameDialect;
  questions: readonly WhoAmIQuestion[];
  asked: readonly WhoAmIAsked[];
  disabled: boolean;
  onAsk: (question: string) => void;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const answers = new Map(asked.map((a) => [a.question, a.answer]));
  const order = [...asked.map((a) => questions.find((q) => q.id === a.question)).filter((q): q is WhoAmIQuestion => !!q), ...questions.filter((q) => !answers.has(q.id))];
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
        {t('games.whoAmI.questions')}
      </Text>
      <Text style={[styles.muted, { color: colors.textSecondary }]}>{t('games.whoAmI.tapToSee')}</Text>
      {order.map((q) => {
        const answer = answers.get(q.id);
        const shown = open === q.id;
        return (
          <View key={q.id} style={[styles.question, { borderColor: colors.controlTrack, backgroundColor: answer === undefined ? 'transparent' : colors.controlTrack }]}>
            <Pressable
              onPress={() => setOpen(shown ? null : q.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded: shown }}
              accessibilityLabel={q.ku}
              style={styles.questionText}
            >
              <Text style={[styles.questionKu, kurdish(dialect), { color: colors.textPrimary }]}>
                {q.ku}
              </Text>
              {shown ? <Text style={[styles.muted, { color: colors.textSecondary }]}>{meaningIn(q.meanings, locale) ?? q.meanings.en}</Text> : null}
            </Pressable>
            {answer !== undefined ? (
              <Stamp dialect={dialect} answer={answer} />
            ) : (
              <ClayButton label={t('games.whoAmI.ask')} tone="primary" variant="outline" disabled={disabled} onPress={() => onAsk(q.id)} />
            )}
          </View>
        );
      })}
    </View>
  );
}

export function GuessTiles({
  dialect,
  tiles,
  crossed,
  right,
  disabled,
  onGuess,
}: {
  dialect: GameDialect;
  tiles: readonly WhoAmITile[];
  crossed: readonly string[];
  right: string | null;
  disabled: boolean;
  onGuess: (tile: string) => void;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const [picked, setPicked] = useState<string | null>(null);
  const can = picked !== null && !crossed.includes(picked) && !disabled;
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
        {t('games.whoAmI.guessTitle')}
      </Text>
      <View style={styles.tiles} accessibilityRole="radiogroup">
        {tiles.map((tile) => {
          const out = crossed.includes(tile.id);
          const on = picked === tile.id;
          const isRight = right === tile.id;
          return (
            <Pressable
              key={tile.id}
              onPress={() => setPicked(tile.id)}
              disabled={disabled || out}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: disabled || out }}
              accessibilityLabel={out ? `${tile.word}, ${t('games.whoAmI.notThis')}` : tile.word}
              style={[
                styles.tile,
                { borderColor: isRight ? YES : on ? colors.primary : colors.controlTrack, backgroundColor: on ? colors.controlTrack : 'transparent', opacity: out ? 0.5 : 1 },
              ]}
            >
              <Text style={[styles.tileWord, kurdish(dialect), { color: colors.textPrimary, textDecorationLine: out ? 'line-through' : 'none' }]}>
                {tile.word}
              </Text>
              {tile.meanings ? <Text style={[styles.muted, { color: colors.textSecondary }]}>{meaningIn(tile.meanings, locale) ?? tile.meanings.en}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      {!disabled ? <ClayButton label={t('games.whoAmI.guess')} tone="primary" disabled={!can} onPress={() => (picked ? onGuess(picked) : undefined)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: STAGE, height: STAGE, alignSelf: 'center' },
  card: {
    position: 'absolute',
    width: CARD_W,
    minHeight: CARD_H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 3,
    backgroundColor: PAPER,
  },
  cardMark: { fontSize: 28, fontWeight: typography.weights.bold, color: PAPER_INK },
  cardWord: { fontSize: 20, fontWeight: typography.weights.bold, color: PAPER_INK },
  cardKind: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: '#5b5b66' },
  section: { gap: spacing.sm },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  muted: { fontSize: typography.sizes.sm },
  question: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radii.md, padding: 6 },
  questionText: { flex: 1, minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: 6 },
  questionKu: { fontSize: 18, fontWeight: typography.weights.semibold },
  stamp: { minWidth: 64, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 3, borderRadius: radii.sm, fontWeight: typography.weights.bold, fontSize: 17, textAlign: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { minWidth: 120, flexGrow: 1, minHeight: 56, borderWidth: 2, borderRadius: radii.md, padding: spacing.sm, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tileWord: { fontSize: 18, fontWeight: typography.weights.bold },
});
