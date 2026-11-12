import { useEffect, useId, useMemo, useRef } from 'react';
import { GAME_EMBLEM_SAMPLES, gameEmblemLayers, gameEmblemLoopMs, gameEmblemSvg, type GameEmblem } from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';
import './game-art.css';

/**
 * A game's emblem on the website, drawn from the shared art
 * (shared/src/art/games.ts) so the phone shows the same picture.
 *
 * It is decoration beside the game's name, so it is hidden from a screen
 * reader. A page can show the same emblem twice (the featured game, and its
 * card under a filter), and a drawing's clip paths are found by id, so every
 * one drawn here gets ids of its own.
 *
 * `moving` plays the emblem's own loop: its layers are laid over one another
 * and each is given its acting as one animation of the browser's, transforms
 * and opacity only, so nothing is drawn again while it plays. `after` starts
 * the loop that far in, so a shelf of emblems does not move as one. A reader
 * who asked for less motion is shown the still emblem, and so is a browser
 * that cannot play it.
 */
export function GameArt({ game, size = 96, moving = false, after = 0 }: { game: GameEmblem; size?: number; moving?: boolean; after?: number }): React.JSX.Element {
  const idPrefix = `ga${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const plays = moving && !prefersReducedMotion();
  const still = useMemo(() => (plays ? null : { __html: gameEmblemSvg({ game, size, idPrefix }) }), [plays, game, size, idPrefix]);
  if (still) return <span className="gp-art" aria-hidden="true" dangerouslySetInnerHTML={still} />;
  return <MovingArt game={game} size={size} idPrefix={idPrefix} after={after} />;
}

function MovingArt({ game, size, idPrefix, after }: { game: GameEmblem; size: number; idPrefix: string; after: number }): React.JSX.Element {
  const layers = useMemo(() => gameEmblemLayers({ game, size, idPrefix }), [game, size, idPrefix]);
  const frame = useRef<HTMLSpanElement>(null);

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
      playing.push((el as HTMLElement).animate(keyframes, { duration: loop, iterations: Infinity, delay: -(after % loop), easing: 'linear' }));
    });
    // an emblem scrolled out of sight stops acting, and takes up where it left off
    const seen =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(([entry]) => {
            for (const a of playing) {
              if (entry?.isIntersecting) a.play();
              else a.pause();
            }
          })
        : null;
    seen?.observe(root);
    return () => {
      seen?.disconnect();
      for (const a of playing) a.cancel();
    };
  }, [layers, game, size, after]);

  return (
    <span ref={frame} className="gp-art gp-art--moving" aria-hidden="true" style={{ width: size, height: size }}>
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
