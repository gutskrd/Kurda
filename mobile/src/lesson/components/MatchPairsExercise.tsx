import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { pairKey, tapLive, type MatchPair, type PickedCard } from '@kurda/shared';
import { spacing, typography } from '../../theme/tokens';
import { display } from '../../theme/fonts';
import { isLeftMatched, isRightMatched, tapLeft, tapRight, type MatchState } from '../match';
import type { Exercise } from '../types';
import { useI18n } from '../../i18n/I18nContext';
import { useDirection } from '../../reports/direction';
import { haptic } from '../../feedback/haptics';
import { AnswerMotion } from '../../theme/MotionParts';
import { Tile, type TileState } from '../../theme/Tile';
import { useAudio } from '../useAudio';
import { CARD } from '../valley';
import { ExerciseHeadline } from './ExerciseHeadline';

interface Props {
  exercise: Exercise;
  state: MatchState;
  onChange: (state: MatchState) => void;
  disabled: boolean;
  /** How the pairs were graded, once they have been: they pop, or shake once. */
  verdict?: 'right' | 'wrong' | null;
}

/** How long a just-tried pair shows its result before settling: spent when right, waiting again when wrong. */
export const PAIR_FLASH_MS = { right: 650, wrong: 550 } as const;

/** A just-tried pair, still showing its result. */
interface Flash extends MatchPair {
  id: number;
  /** A correct pair, made; otherwise one tried and not made. */
  made: boolean;
}

/**
 * Match Kurdish cards with their meanings, tapping either side first. A Kurdish card with a recording plays it when
 * tapped, as on the website.
 *
 * When the server says which cards pair (`pairOf`), each pair is graded as it is made: right flashes green with a
 * spark and haptic, then settles spent; wrong flashes red, shakes once and both cards wait again. Screen readers
 * hear each. The last pair submits by itself. From an older server, pairs are made freely and graded together at
 * Check, and tapping a made pair undoes it.
 */
export function MatchPairsExercise({ exercise, state, onChange, disabled, verdict = null }: Props) {
  const { t } = useI18n();
  const dir = useDirection();
  const say = useCardSound();
  const lefts = useMemo(() => exercise.lefts ?? [], [exercise.lefts]);
  const rights = useMemo(() => exercise.rights ?? [], [exercise.rights]);
  const key = useMemo(() => pairKey(lefts, rights, exercise.pairOf), [lefts, rights, exercise.pairOf]);
  const [picked, setPicked] = useState<PickedCard | null>(null);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const nextFlash = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const own = timers.current;
    return () => own.forEach(clearTimeout);
  }, []);

  const flash = (pair: MatchPair, made: boolean): void => {
    const id = nextFlash.current++;
    setFlashes((now) => [...now, { ...pair, id, made }]);
    const timer = setTimeout(
      () => {
        timers.current.delete(timer);
        setFlashes((now) => now.filter((f) => f.id !== id));
      },
      made ? PAIR_FLASH_MS.right : PAIR_FLASH_MS.wrong,
    );
    timers.current.add(timer);
  };

  const tap = (side: 'left' | 'right', text: string): void => {
    // The Kurdish card plays itself, unless its pair is already made.
    if (side === 'left' && !isLeftMatched(state, text)) say(exercise.audio?.[text]);
    if (!key) {
      if (side === 'left' && !isLeftMatched(state, text)) haptic('select');
      onChange(side === 'left' ? tapLeft(state, text) : tapRight(state, text));
      return;
    }
    const tried = tapLive({ matches: state.matches, picked }, key, side, text);
    setPicked(tried.state.picked);
    if (tried.outcome === 'picked' || tried.outcome === 'unpicked') haptic('select');
    if (!tried.pair) return;
    const { left, right } = tried.pair;
    if (tried.outcome === 'matched') {
      haptic('correct');
      flash(tried.pair, true);
      AccessibilityInfo.announceForAccessibility(t('lesson.match.matched', { left, right }));
      onChange({ matches: tried.state.matches, selectedLeft: null });
    } else {
      haptic('wrong');
      flash(tried.pair, false);
      AccessibilityInfo.announceForAccessibility(t('lesson.match.missed', { left, right }));
    }
  };

  // The latest try a card was in, while it still shows.
  const shown = (side: 'left' | 'right', text: string): Flash | undefined => {
    for (let i = flashes.length - 1; i >= 0; i--) if ((side === 'left' ? flashes[i]!.left : flashes[i]!.right) === text) return flashes[i];
    return undefined;
  };
  const stateOf = (side: 'left' | 'right', text: string): TileState => {
    const made = side === 'left' ? isLeftMatched(state, text) : isRightMatched(state, text);
    if (!key) return made ? 'right' : side === 'left' && state.selectedLeft === text ? 'picked' : disabled ? 'disabled' : 'idle';
    const now = shown(side, text);
    if (now) return now.made ? 'right' : 'wrong';
    if (made) return 'spent';
    if (disabled) return 'disabled';
    return picked?.side === side && picked.text === text ? 'picked' : 'idle';
  };

  const card = (side: 'left' | 'right', text: string) => {
    const tileState = stateOf(side, text);
    return (
      <AnswerMotion key={text} verdict={tileState === 'wrong' ? 'wrong' : null}>
        <Tile
          label={text}
          state={tileState}
          disabled={disabled}
          sweep={!!key}
          onPress={() => tap(side, text)}
          faceStyle={styles.card}
          textStyle={side === 'left' ? styles.kurdish : styles.meaning}
        />
      </AnswerMotion>
    );
  };

  return (
    <View style={styles.container}>
      <ExerciseHeadline>{t('lesson.match.prompt')}</ExerciseHeadline>
      <AnswerMotion verdict={verdict} style={[styles.columns, { flexDirection: dir.row }]}>
        <View style={styles.column}>{lefts.map((left) => card('left', left))}</View>
        <View style={styles.column}>{rights.map((right) => card('right', right))}</View>
      </AnswerMotion>
    </View>
  );
}

/** One player for all cards: a tap loads that card's recording and plays it once loaded; tapping again replays it. */
function useCardSound(): (url: string | undefined) => void {
  const [wanted, setWanted] = useState<{ url: string; n: number } | null>(null);
  const { source, play } = useAudio(wanted?.url);
  const played = useRef(0);
  useEffect(() => {
    if (!wanted || source !== wanted.url || played.current === wanted.n) return;
    played.current = wanted.n;
    play(1);
  }, [wanted, source, play]);
  return useCallback((url: string | undefined) => {
    if (url) setWanted((was) => ({ url, n: (was?.n ?? 0) + 1 }));
  }, []);
}

const styles = StyleSheet.create({
  container: { gap: spacing.xl },
  columns: { gap: spacing.md },
  column: { flex: 1, gap: spacing.sm + 2 },
  // The lesson's cards: 16 round, on a hairline edge.
  card: { minHeight: 60, borderRadius: CARD.radius },
  // The Kurdish in the headings' display face, its meaning in the reader's own.
  kurdish: { ...display(typography.sizes.text) },
  meaning: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
});
