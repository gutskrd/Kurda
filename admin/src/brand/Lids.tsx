import { useId } from 'react';
import type { EyeState } from '@kurda/shared';

type Pt = readonly [number, number];

/** A stroke that is thick in the middle and thin at its ends, as an outline through both its sides. */
function taper(spine: readonly Pt[], widths: readonly number[]): string {
  const left: Pt[] = [];
  const right: Pt[] = [];
  const last = spine.length - 1;
  spine.forEach((p, i) => {
    const a = spine[Math.max(0, i - 1)]!;
    const b = spine[Math.min(last, i + 1)]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / l;
    const ny = (b[0] - a[0]) / l;
    const half = (widths[i] ?? 0) / 2;
    left.push([p[0] + nx * half, p[1] + ny * half]);
    right.push([p[0] - nx * half, p[1] - ny * half]);
  });
  const ring = [...left, ...right.reverse()];
  const mid = (a: Pt, b: Pt): string => `${((a[0] + b[0]) / 2).toFixed(2)},${((a[1] + b[1]) / 2).toFixed(2)}`;
  let d = `M${mid(ring[ring.length - 1]!, ring[0]!)}`;
  ring.forEach((p, i) => {
    d += `Q${p[0].toFixed(2)},${p[1].toFixed(2)} ${mid(p, ring[(i + 1) % ring.length]!)}`;
  });
  return `${d}Z`;
}

/** How a picture's lids look: how far past the white they reach (to cover a soft glow round it), and the fur's colours there. */
export interface LidLook {
  /** the lid's size against the white's */
  cover: number;
  /** the fur in the middle of the lid, and at its edge */
  centre: string;
  edge: string;
  /** fade out at the edge, for a white with a soft glow round it rather than a sharp edge */
  soft: boolean;
}

/** The line the lids meet along, and their edge, in the colour of the pupils. */
const LASH = '#4a2822';

/**
 * One eye's lids, drawn over its white as the Hevalo character's are
 * (@kurda/shared characters): half shut, the lid down to a soft curve with a
 * dark edge; shut, the whole eye the fur's colour with the lashes along a
 * curve below the middle; pleased, shut along a curve the other way up.
 * Open, nothing. The measures are the character's, as shares of the white
 * (its white is 53.4 by 60.6 across from the middle).
 */
export function Lids({ side, state, width, height, look }: { side: 'left' | 'right'; state: EyeState; width: number; height: number; look: LidLook }): React.JSX.Element {
  const id = useId().replace(/:/g, '');
  const rx = width / 2;
  const ry = height / 2;
  const scale = rx / 53.4;
  const at = (x: number, y: number): Pt => [x * rx, y * ry];
  const w = (...widths: number[]): number[] => widths.map((v) => v * scale);
  const disk = { rx: rx * look.cover + 1.5, ry: ry * look.cover + 1.5 };
  const fill = `url(#${id}-fur)`;
  return (
    <svg className={`hevalo-lids is-${side}`} data-eye={state} viewBox={`${-rx} ${-ry} ${width} ${height}`} overflow="visible" aria-hidden="true" focusable="false">
      {state !== 'open' && (
        <defs>
          <radialGradient id={`${id}-fur`} cx="50%" cy="45%" r="55%">
            <stop offset="0" stopColor={look.centre} />
            <stop offset={look.soft ? '0.72' : '0.8'} stopColor={look.centre} />
            <stop offset={look.soft ? '0.86' : '1'} stopColor={look.edge} />
            {look.soft && <stop offset="1" stopColor={look.edge} stopOpacity="0" />}
          </radialGradient>
          <clipPath id={`${id}-eye`}>
            <ellipse rx={disk.rx} ry={disk.ry} />
          </clipPath>
        </defs>
      )}
      {state === 'half' && (
        <g>
          {/* the lid comes down to a soft curve, lowest in the middle, as a sleepy eye's does */}
          <path
            clipPath={`url(#${id}-eye)`}
            fill={fill}
            d={`M${-disk.rx},${-disk.ry}H${disk.rx}V${-0.28 * ry}C${0.75 * rx},${-0.1 * ry} ${0.37 * rx},${-0.05 * ry} 0,${-0.05 * ry}C${-0.37 * rx},${-0.05 * ry} ${-0.75 * rx},${-0.1 * ry} ${-disk.rx},${-0.28 * ry}Z`}
          />
          <path fill={LASH} fillOpacity={0.85} d={taper([at(-0.97, -0.25), at(-0.49, -0.08), at(0, -0.03), at(0.49, -0.08), at(0.97, -0.25)], w(1.4, 5, 6, 5, 1.4))} />
        </g>
      )}
      {state === 'closed' && (
        <g>
          <ellipse rx={disk.rx} ry={disk.ry} fill={fill} />
          <path fill={LASH} d={taper([at(-0.86, 0.18), at(-0.47, 0.43), at(0, 0.51), at(0.47, 0.43), at(0.86, 0.18)], w(2, 6.4, 7.4, 6.4, 2))} />
        </g>
      )}
      {state === 'happy' && (
        <g>
          <ellipse rx={disk.rx} ry={disk.ry} fill={fill} />
          <path fill={LASH} d={taper([at(-0.79, 0.38), at(-0.45, 0.05), at(0, -0.08), at(0.45, 0.05), at(0.79, 0.38)], w(2.4, 7, 8.4, 7, 2.4))} />
        </g>
      )}
    </svg>
  );
}
