import { useEffect, useState } from 'react';
import type { StoryGameView } from '@kurda/shared';

/**
 * The few times a story game mentions time (contract §A1). Nobody sees a clock while reading or on an untimed
 * question; these sentences replace one, alongside a timed question's countdown.
 */

/** Whole seconds until `iso` by the server's clock; null without a deadline. */
export function secondsLeft(iso: string | null, serverNow: number): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((Date.parse(iso) - serverNow) / 1000));
}

/**
 * Reading in a duo or group: after the soft cap everyone is told the host may start the questions (and to take
 * their time); in the last minute before the hard cap, that the questions start in about a minute.
 */
export function readingNote(view: Pick<StoryGameView, 'mode' | 'status' | 'readingSoftCapAt' | 'readingHardCapAt'>, serverNow: number): 'host-may-start' | 'starting-soon' | null {
  if (view.mode === 'solo' || view.status !== 'reading') return null;
  const hard = view.readingHardCapAt ? Date.parse(view.readingHardCapAt) : null;
  if (hard !== null && hard - serverNow <= 60_000) return 'starting-soon';
  const soft = view.readingSoftCapAt ? Date.parse(view.readingSoftCapAt) : null;
  if (soft !== null && serverNow >= soft) return 'host-may-start';
  return null;
}

/** An untimed duo or group question says it closes soon in the last 30 s of its cap, and nothing before. */
export function closesSoon(view: Pick<StoryGameView, 'mode' | 'status' | 'phaseEndsAt' | 'settings'>, serverNow: number): boolean {
  if (view.mode === 'solo' || view.status !== 'question' || view.settings.timerSeconds !== 0) return false;
  const left = secondsLeft(view.phaseEndsAt, serverNow);
  return left !== null && left <= 30;
}

/** A timed question shows a countdown to its own deadline, doubled with extra time. */
export function isTimed(view: Pick<StoryGameView, 'status' | 'phaseEndsAt' | 'settings'>): boolean {
  return view.status === 'question' && view.settings.timerSeconds > 0 && view.phaseEndsAt !== null;
}

/** Re-renders every `ms` while `active`, for a countdown or a time-based note. */
export function useTicker(ms: number, active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return tick;
}
