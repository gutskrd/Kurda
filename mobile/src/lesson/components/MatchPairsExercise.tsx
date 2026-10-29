import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { pairKey, tapLive, type MatchPair, type PickedCard } from '@kurda/shared';
import { spacing, typography } from '../../theme/tokens';
import { isLeftMatched, isRightMatched, tapLeft, tapRight, type MatchState } from '../match';
import type { Exercise } from '../types';
import { useI18n } from '../../i18n/I18nContext';
import { useDirection } from '../../reports/direction';
import { haptic } from '../../feedback/haptics';
import { AnswerMotion } from '../../theme/MotionParts';
import { Tile, type TileState } from '../../theme/Tile';
import { useAudio } from '../useAudio';
import { ExerciseHeadline } from './ExerciseHeadline';

interface Props {
  exercise: Exercise;
  state: MatchState;
  onChange: (state: MatchState) => void;
  disabled: boolean;
  /** how the pairs were graded, once they have been: they pop, or shake once */
  verdict?: 'right' | 'wrong' | null;
}

/** How long a pair just tried shows what it was before it settles: spent when right, back to waiting when not. */
export const PAIR_FLASH_MS = { right: 650, wrong: 550 } as const;

/** A pair just tried, still showing whether it was one. */
interface Flash extends MatchPair {
  id: number;
  /** a right pair, made; else one tried and not made */
  made: boolean;
}

/**
 * Tap a Kurdish card and its meaning — or the meaning first. A Kurdish card
 * with a recording says it as it is tapped, hearing the word while deciding
 * what it means, as the website's cards do.
 *
 * When the server says which card pairs with which (`pairOf`), each pair is
 * answered as it is made: a right one flashes green with a light crossing it
 * and a spark, is felt and heard as right, then settles spent; a wrong one
 * flashes red and shakes once, is felt as a gentle miss, and both cards wait
 * again. A screen reader hears each. The last pair made sends the answer by
 * itself (the lesson's own doing; there is no Check). From an older server,
 * pairs are made freely and graded together at Check, as they always were:
 * tapping a made pair undoes it.
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
    // the Kurdish card says itself, unless its pair is already made
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

  // the latest try a card was in, while it still shows
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
          textStyle={styles.cardText}
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

/**
 * One player for the cards: a tap loads that card's recording and plays it as
 * soon as it has loaded, and the same card tapped again plays it again.
 */
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
  card: { minHeight: 60 },
  cardText: { fontSize: typography.sizes.md + 1 },
});
