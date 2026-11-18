import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { GAME_EMBLEM_SAMPLES, gameEmblemLayers, gameEmblemLoopMs, gameEmblemSvg, type GameEmblem } from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';
import './game-art.css';

/**
 * A game's cover from the shared art (shared/src/art/games.ts), as on the phone, filling its square with rounded
 * corners that also clip moving parts (game-art.css). Decorative, and every copy gets its own clip-path ids, since a
 * page can show one cover twice.
 *
 * `moving` animates its layered parts with transform and opacity only; under Reduce Motion, or without animation
 * support, it stays still. A featured cover loops (`moving`, offset by `after`); a shelf cover plays once as it
 * appears (`moving="once"`, staggered by `after`) and again whenever `again` changes. `ref` is the cover's box, used
 * for the card-to-page transition (lib/viewTransition.tsx).
 */
export function GameArt({
  game,
  size = 96,
  moving = false,
  after = 0,
  again = 0,
  ref,
}: {
  game: GameEmblem;
  size?: number;
  moving?: boolean | 'once';
  after?: number;
  /** with `moving="once"`: each change plays the emblem through once more, unless it is already playing */
  again?: number;
  ref?: React.Ref<HTMLSpanElement>;
}): React.JSX.Element {
  const idPrefix = `ga${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const plays = moving !== false && !prefersReducedMotion();
  const still = useMemo(() => (plays ? null : { __html: gameEmblemSvg({ game, size, idPrefix }) }), [plays, game, size, idPrefix]);
  if (still) return <span ref={ref} className="gp-art" aria-hidden="true" dangerouslySetInnerHTML={still} />;
  return <MovingArt game={game} size={size} idPrefix={idPrefix} after={after} once={moving === 'once'} again={again} given={ref} />;
}

function MovingArt({
  game,
  size,
  idPrefix,
  after,
  once,
  again,
  given,
}: {
  game: GameEmblem;
  size: number;
  idPrefix: string;
  after: number;
  once: boolean;
  again: number;
  given?: React.Ref<HTMLSpanElement>;
}): React.JSX.Element {
  const layers = useMemo(() => gameEmblemLayers({ game, size, idPrefix }), [game, size, idPrefix]);
  const frame = useRef<HTMLSpanElement>(null);
  const acting = useRef<Animation[]>([]);
  // one box for two holders: the cover's own, which plays its parts, and the caller's
  const held = useCallback(
    (el: HTMLSpanElement | null) => {
      frame.current = el;
      const undo = typeof given === 'function' ? given(el) : undefined;
      if (given && typeof given !== 'function') given.current = el;
      return () => {
        frame.current = null;
        if (typeof undo === 'function') undo();
        else if (typeof given === 'function') given(null);
        else if (given) given.current = null;
      };
    },
    [given],
  );

  useEffect(() => {
    const root = frame.current;
    if (!root) return;
    const unit = size / 120;
    const loop = gameEmblemLoopMs(game);
    const playing: Animation[] = [];
    [...root.children].forEach((el, i) => {
      const poses = layers[i]?.poses;
      // a layer that never moves is simply there; a browser without the animations shows every layer at rest
      if (!poses || typeof (el as HTMLElement).animate !== 'function') return;
      const keyframes = poses.map((p, at) => ({
        offset: at / GAME_EMBLEM_SAMPLES,
        opacity: p.o,
        transform: `translate(${p.x * unit}px, ${p.y * unit}px) rotate(${p.r}deg) scale(${p.sx}, ${p.sy})`,
      }));
      // looping, it starts part-way in; played once, it waits its turn and then rests where it began
      const part = (el as HTMLElement).animate(
        keyframes,
        once ? { duration: loop, iterations: 1, delay: after, easing: 'linear' } : { duration: loop, iterations: Infinity, delay: -(after % loop), easing: 'linear' },
      );
      if (once) part.pause();
      playing.push(part);
    });
    acting.current = playing;
    // A loop pauses off screen and resumes where it left off; a play-once cover starts when first seen.
    let begun = false;
    const seen =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(([entry]) => {
            if (once) {
              if (!entry?.isIntersecting || begun) return;
              begun = true;
              for (const a of playing) a.play();
              return;
            }
            for (const a of playing) {
              if (entry?.isIntersecting) a.play();
              else a.pause();
            }
          })
        : null;
    seen?.observe(root);
    // nothing to watch with: it plays through as it is drawn
    if (once && !seen) for (const a of playing) a.play();
    return () => {
      seen?.disconnect();
      for (const a of playing) a.cancel();
      acting.current = [];
    };
  }, [layers, game, size, after, once]);

  // Asked to play again (its card hovered, focused or pressed): restart unless already playing.
  useEffect(() => {
    if (!once || again === 0) return;
    const parts = acting.current;
    if (parts.some((a) => a.playState === 'running')) return;
    for (const a of parts) {
      // past the wait it had as the shelf arrived: a hand on the card is answered at once
      a.currentTime = after;
      a.play();
    }
  }, [again, once, after]);

  return (
    <span ref={held} className="gp-art gp-art--moving" aria-hidden="true" style={{ width: size, height: size }}>
      {layers.map((layer, i) => (
        <span
          key={i}
          className="gp-art-layer"
          style={{ transformOrigin: `${(layer.pivot[0] / 120) * size}px ${(layer.pivot[1] / 120) * size}px` }}
          dangerouslySetInnerHTML={{ __html: layer.svg }}
        />
      ))}
    </span>
  );
}
