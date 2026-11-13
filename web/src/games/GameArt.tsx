import { useEffect, useId, useMemo, useRef } from 'react';
import { GAME_EMBLEM_SAMPLES, gameEmblemLayers, gameEmblemLoopMs, gameEmblemSvg, type GameEmblem } from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';
import './game-art.css';

/**
 * A game's cover on the website, drawn from the shared art
 * (shared/src/art/games.ts) so the phone shows the same picture.
 *
 * A cover is an illustration that fills its square, so it is shown edge to
 * edge with its corners rounded here (game-art.css): the rounding also keeps
 * a part that moves past the cover's edge from showing outside it.
 *
 * It is decoration beside the game's name, so it is hidden from a screen
 * reader. A page can show the same cover twice (the featured game, and its
 * card under a filter), and a drawing's clip paths are found by id, so every
 * one drawn here gets ids of its own.
 *
 * `moving` plays the cover's own acting: its parts are laid over one another
 * and each is given its part as one animation of the browser's, transforms
 * and opacity only, so nothing is drawn again while it plays. A part that is
 * only passing through the loop (a note sung, an answer given) is not shown
 * while nothing plays. A reader who asked for less motion is shown the still
 * cover, and so is a browser that cannot play it.
 *
 * How much it plays is the caller's to say, by how many covers it shows. One
 * cover with the screen to itself — the game put forward on the Games page,
 * a game's own start — loops (`moving`), and `after` starts the loop that far
 * in. A shelf of them does not: eight drawings all acting for ever is eight
 * things asking to be looked at. There each plays through once as it comes
 * into view (`moving="once"`, `after` a moment later than the card before
 * it) and then rests, and plays once more each time `again` changes — the
 * card under it hovered, focused or pressed.
 */
export function GameArt({
  game,
  size = 96,
  moving = false,
  after = 0,
  again = 0,
}: {
  game: GameEmblem;
  size?: number;
  moving?: boolean | 'once';
  after?: number;
  /** with `moving="once"`: each change plays the emblem through once more, unless it is already playing */
  again?: number;
}): React.JSX.Element {
  const idPrefix = `ga${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const plays = moving !== false && !prefersReducedMotion();
  const still = useMemo(() => (plays ? null : { __html: gameEmblemSvg({ game, size, idPrefix }) }), [plays, game, size, idPrefix]);
  if (still) return <span className="gp-art" aria-hidden="true" dangerouslySetInnerHTML={still} />;
  return <MovingArt game={game} size={size} idPrefix={idPrefix} after={after} once={moving === 'once'} again={again} />;
}

function MovingArt({ game, size, idPrefix, after, once, again }: { game: GameEmblem; size: number; idPrefix: string; after: number; once: boolean; again: number }): React.JSX.Element {
  const layers = useMemo(() => gameEmblemLayers({ game, size, idPrefix }), [game, size, idPrefix]);
  const frame = useRef<HTMLSpanElement>(null);
  const acting = useRef<Animation[]>([]);

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
    // a loop scrolled out of sight stops acting, and takes up where it left off; one played once begins as it is first seen
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

  // asked to play once more (its card hovered, focused or pressed): from the start, unless it is in the middle of it
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
    <span ref={frame} className="gp-art gp-art--moving" aria-hidden="true" style={{ width: size, height: size }}>
      {layers.map((layer, i) => (
        <span
          key={i}
          className="gp-art-layer"
          style={{ transformOrigin: `${(layer.pivot[0] / 120) * size}px ${(layer.pivot[1] / 120) * size}px`, opacity: layer.passing ? 0 : undefined }}
          dangerouslySetInnerHTML={{ __html: layer.svg }}
        />
      ))}
    </span>
  );
}
