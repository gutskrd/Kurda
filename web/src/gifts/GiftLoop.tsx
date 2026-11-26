import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { giftLoopMoves, giftLoopPicture, type GiftLoop, type GiftLoopKey, type GiftLoopLayer, type GiftLoopPicture } from '@kurda/shared';
import { playsMotion } from '../lib/motion';
import './gift-loop.css';

/**
 * A gift's picture alive (shared art/gift-loop.ts): its parts stacked over the still, each played by CSS keyframes on
 * transform and opacity alone, and only while the picture is on screen. The parts take the still's place once all of
 * them have loaded, and since the round starts on the still's own frame the swap cannot be seen. Under Reduce Motion,
 * or for a gift with no round, it is the still. Decorative: the words beside it say what it is.
 */
export function GiftLoopArt({ src, lazy = true }: { src: string; lazy?: boolean }): React.JSX.Element {
  const picture = useMemo(() => (playsMotion() ? giftLoopPicture(src) : null), [src]);
  if (!picture) return <img src={src} alt="" loading={lazy ? 'lazy' : undefined} decoding="async" />;
  return <Living key={src} src={src} picture={picture} lazy={lazy} />;
}

/** Whether a picture has a round to play here: a gift's still with one, where motion is wanted. */
export function hasGiftLoop(src: string | null | undefined): boolean {
  return giftLoopPicture(src) !== null;
}

function Living({ src, picture, lazy }: { src: string; picture: GiftLoopPicture; lazy: boolean }): React.JSX.Element {
  const root = useRef<HTMLSpanElement>(null);
  const [onScreen, setOnScreen] = useState(false);
  const [seen, setSeen] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [failed, setFailed] = useState(false);
  const parts = picture.layers.length + (picture.base && picture.base !== src ? 1 : 0);
  const ready = !failed && loaded >= parts;

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver !== 'function') {
      setOnScreen(true);
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      const visible = entry?.isIntersecting === true;
      setOnScreen(visible);
      if (visible) setSeen(true);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const onLoad = (): void => setLoaded((n) => n + 1);
  const onError = (): void => setFailed(true);
  const css = useMemo(() => loopCss(picture.id, picture.loop), [picture]);

  return (
    <span ref={root} className="gift-loop" data-ready={ready ? 'true' : 'false'} data-playing={ready && onScreen ? 'true' : 'false'}>
      <span className="gift-loop-frame">
        <img className="gift-loop-still" src={src} alt="" loading={lazy ? 'lazy' : undefined} decoding="async" />
        {seen && !failed && (
          <span className="gift-loop-parts">
            <style href={`gift-loop-${picture.id}`} precedence="default">
              {css}
            </style>
            {picture.base && (
              <img
                className="gift-loop-part gift-loop-base"
                src={picture.base}
                alt=""
                decoding="async"
                onLoad={picture.base === src ? undefined : onLoad}
                onError={onError}
              />
            )}
            {picture.layers.map(({ layer, src: part }) => (
              <img
                key={layer.name}
                className="gift-loop-part"
                data-layer={layer.name}
                src={part}
                alt=""
                decoding="async"
                style={partStyle(picture.id, layer)}
                onLoad={onLoad}
                onError={onError}
              />
            ))}
          </span>
        )}
      </span>
    </span>
  );
}

const CANVAS = 120;
const pct = (v: number, of: number): string => `${Math.round((v / of) * 100000) / 1000}%`;
const keyframesName = (id: string, layer: string): string => `gift-loop-${id}-${layer}`;

/** Where a layer's picture lies on the frame, the point it turns about, and its round. */
function partStyle(id: string, layer: GiftLoopLayer): CSSProperties {
  const [x, y, w, h] = layer.box;
  const [ox, oy] = layer.origin;
  const first = layer.keys[0]!;
  const fades = layer.keys.some((k) => k.o !== first.o);
  return {
    left: pct(x, CANVAS),
    top: pct(y, CANVAS),
    width: pct(w, CANVAS),
    height: pct(h, CANVAS),
    transformOrigin: `${pct(ox - x, w)} ${pct(oy - y, h)}`,
    ...(fades || giftLoopMoves(layer) ? { animation: `${keyframesName(id, layer.name)} ${layer.ms}ms linear infinite both` } : {}),
    ...(!fades && first.o < 1 ? { opacity: first.o } : {}),
  };
}

/** A pose as CSS: moved in shares of the layer's own box, so the keys hold at any size. */
function transformOf(layer: GiftLoopLayer, k: GiftLoopKey): string {
  const [, , w, h] = layer.box;
  const p = layer.plane;
  const turn = p ? `rotate(${p.tilt}deg) scaleY(${p.squash}) rotate(${k.rot}deg) scaleY(${Math.round(100000 / p.squash) / 100000}) rotate(${-p.tilt}deg)` : `rotate(${k.rot}deg)`;
  return `translate(${pct(k.x, w)}, ${pct(k.y, h)}) ${turn} scale(${k.sx}, ${k.sy})`;
}

/** The round's keyframes, one set per layer that moves or fades. */
export function loopCss(id: string, loop: GiftLoop): string {
  let css = '';
  for (const layer of loop.layers) {
    const moves = giftLoopMoves(layer);
    const fades = layer.keys.some((k) => k.o !== layer.keys[0]!.o);
    if (!moves && !fades) continue;
    const frames = layer.keys.map((k) => {
      const props = [moves ? `transform:${transformOf(layer, k)}` : '', fades ? `opacity:${k.o}` : ''].filter(Boolean).join(';');
      return `${Math.round(k.at * 100000) / 1000}%{${props}}`;
    });
    css += `@keyframes ${keyframesName(id, layer.name)}{${frames.join('')}}`;
  }
  return css;
}
