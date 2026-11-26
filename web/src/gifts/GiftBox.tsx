import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import {
  GIFT_BOX_EXIT,
  GIFT_BOX_FOOT,
  GIFT_BOX_GLINT_PHASES,
  GIFT_BOX_IDLE,
  GIFT_BOX_LID_PARTS,
  GIFT_BOX_REST,
  GIFT_BOX_SHUT,
  GIFT_BOX_UNWRAPS,
  giftBoxDrawing,
  giftBoxGlint,
  giftBoxGlintKeys,
  type GiftBoxKey,
  type GiftBoxLayer,
  type GiftBoxPart,
  type GiftBoxPlay,
  type GiftBoxTrack,
  type GiftTier,
} from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';
import { useSvgId } from './useSvgId';
import './gift-box.css';

/**
 * The wrapped gift (shared art/gift-box.ts), drawn and moved as on the phone. Each part is its own small picture over
 * the same frame, so the browser moves them by transform and opacity alone and nothing is drawn again: `idle` hops now
 * and then with a glint between, `unwrap` plays the tier's opening and stays open and lit, and `exit` lets the open
 * box give way to the gift. Under Reduce Motion, or where the browser cannot animate, it stands still. Decorative
 * (aria-hidden); the words beside it say what it is.
 */
export type GiftBoxMotion = 'still' | 'idle' | 'unwrap' | 'exit';

/** The play behind each motion. */
function playOf(motion: GiftBoxMotion, tier: GiftTier): GiftBoxPlay | null {
  if (motion === 'idle') return GIFT_BOX_IDLE;
  if (motion === 'unwrap') return GIFT_BOX_UNWRAPS[tier];
  if (motion === 'exit') return GIFT_BOX_EXIT;
  return null;
}

/** A seed's share of the idle round, so boxes side by side do not all hop at once. */
function offsetOf(seed: string): number {
  let h = 7;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

const pct = (v: number, of: number): string => `${Math.round((v / of) * 100000) / 1000}%`;

/** Where a layer's box lies on the canvas, as shares of it. */
function placeOf(layer: GiftBoxLayer, view: number): CSSProperties {
  const { x, y, w, h } = layer.box;
  return { left: pct(x, view), top: pct(y, view), width: pct(w, view), height: pct(h, view) };
}

const frame = (k: GiftBoxKey, unit: number): Keyframe => ({
  offset: k.at,
  transform: `translate(${Math.round(k.x * unit * 100) / 100}px, ${Math.round(k.y * unit * 100) / 100}px) rotate(${k.rot}deg) scale(${k.sx}, ${k.sy})`,
  opacity: k.o,
});

export function GiftBox({
  tier,
  size = 120,
  className,
  limited,
  motion = 'still',
  seed = '',
}: {
  tier: GiftTier;
  /** the canvas's width and height in pixels; the box fills most of it */
  size?: number;
  className?: string;
  /** a season's gift, with a Newroz flame for its tag; a legendary one is unless told otherwise */
  limited?: boolean;
  motion?: GiftBoxMotion;
  /** what tells this box's idle round from its neighbours', such as the gift's id */
  seed?: string;
}): React.JSX.Element {
  const id = useSvgId('gb');
  const drawing = useMemo(() => giftBoxDrawing(tier, { size, idPrefix: id, limited }), [tier, size, id, limited]);
  const play = playOf(motion, tier);
  const glints = useMemo(() => (play && play.glints.length > 0 ? GIFT_BOX_GLINT_PHASES.map((phase, i) => giftBoxGlint(phase, { idPrefix: `${id}g${i}` })) : []), [play, id]);
  const parts = useRef<Partial<Record<GiftBoxTrack, HTMLElement | null>>>({});
  const glintRefs = useRef<Array<HTMLElement | null>>([]);
  const view = drawing.view.w;

  useEffect(() => {
    if (!play || prefersReducedMotion()) return;
    const unit = size / view;
    const timing: KeyframeAnimationOptions = {
      duration: play.ms,
      iterations: play.loop ? Infinity : 1,
      fill: 'both',
      delay: play.loop ? Math.round(600 + offsetOf(seed || id) * play.ms * 0.4) : 0,
    };
    const runs: Animation[] = [];
    for (const [name, keys] of Object.entries(play.tracks) as [GiftBoxTrack, readonly GiftBoxKey[]][]) {
      const el = parts.current[name];
      if (el && typeof el.animate === 'function') runs.push(el.animate(keys.map((k) => frame(k, unit)), timing));
    }
    giftBoxGlintKeys(play).forEach((keys, i) => {
      const el = glintRefs.current[i];
      if (el && typeof el.animate === 'function') runs.push(el.animate(keys.map((k) => ({ offset: k.at, opacity: k.o })), timing));
    });
    return () => runs.forEach((r) => r.cancel());
  }, [play, size, view, seed, id]);

  const shown = (part: GiftBoxPart): boolean => play !== null || GIFT_BOX_SHUT.includes(part);
  /** A part's pivot, as shares of its own box; and where it rests before anything moves it. */
  const layerStyle = (part: GiftBoxPart): CSSProperties => {
    const layer = drawing.layers[part];
    const [px, py] = drawing.pivots[part];
    const rest = part in GIFT_BOX_REST ? GIFT_BOX_REST[part as GiftBoxTrack] : null;
    return {
      ...placeOf(layer, view),
      transformOrigin: `${pct(px - layer.box.x, layer.box.w)} ${pct(py - layer.box.y, layer.box.h)}`,
      opacity: rest ? rest.o : 1,
    };
  };
  const layerOf = (part: GiftBoxPart): React.JSX.Element | null =>
    shown(part) ? (
      <span
        key={part}
        className="gift-box-part"
        data-part={part}
        ref={(el) => void (parts.current[part as GiftBoxTrack] = el)}
        style={layerStyle(part)}
        dangerouslySetInnerHTML={{ __html: svgOf(drawing.layers[part]) }}
      />
    ) : null;
  const wrapOrigin = (pt: readonly [number, number]): CSSProperties => ({ transformOrigin: `${pct(pt[0], view)} ${pct(pt[1], view)}` });

  return (
    <span
      className={`gift-box gift-box-${tier}${className ? ` ${className}` : ''}`}
      data-motion={motion}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {layerOf('shadow')}
      {layerOf('splash')}
      <span className="gift-box-group" ref={(el) => void (parts.current.hop = el)} style={wrapOrigin(GIFT_BOX_FOOT)}>
        {(['body', 'ribbon', 'lidShade', 'inside', 'light'] as const).map(layerOf)}
        <span className="gift-box-group" ref={(el) => void (parts.current.lid = el)} style={wrapOrigin(drawing.pivots.lid)}>
          {GIFT_BOX_LID_PARTS.map(layerOf)}
        </span>
        {glints.map((g, i) => (
          <span
            key={`glint${i}`}
            className="gift-box-part"
            data-part="glint"
            ref={(el) => void (glintRefs.current[i] = el)}
            style={{ ...placeOf(g, view), opacity: 0 }}
            dangerouslySetInnerHTML={{ __html: svgOf(g) }}
          />
        ))}
        {layerOf('sparks')}
      </span>
    </span>
  );
}

/** A layer as its own picture, filling its box. */
function svgOf(layer: GiftBoxLayer): string {
  const { x, y, w, h } = layer.box;
  return `<svg viewBox="${x} ${y} ${w} ${h}" width="100%" height="100%" focusable="false">${layer.markup}</svg>`;
}
