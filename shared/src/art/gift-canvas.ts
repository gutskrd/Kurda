/**
 * The drawing a gift is painted into (gift-art.ts), which remembers which named layer of its round (gift-loop.ts) each
 * stroke belongs to. Painted whole it is the still picture: the base, then each layer as the round's first frame
 * shows it. Painted apart it is the base and each layer as its own picture, for the apps to stack and move.
 */
import { GIFT_LOOP_SCALE, giftLoopMatrix, type GiftLoop, type GiftLoopLayer } from './gift-loop.js';
import { CANVAS, Drawing, escapeXml, n2, n3 } from './svg.js';

interface Chunk {
  layer: string | null;
  markup: string;
}

export class GiftCanvas extends Drawing {
  private readonly chunks: Chunk[] = [];
  private current: string | null = null;
  private readonly painted: string[] = [];

  constructor(
    prefix: string,
    readonly loop: GiftLoop | null,
  ) {
    super(prefix);
  }

  override add(markup: string): void {
    // A layer is stacked over the whole base, so base paint after a layer would end up under it once apart.
    if (this.current === null && this.painted.length > 0) throw new Error('art: base painted over a moving layer');
    this.chunks.push({ layer: this.current, markup });
  }

  /** Paints `draw` into the layer `name`, which the gift's round must name, and in the round's order. */
  layer(name: string, draw: () => void): void {
    const spec = this.spec(name);
    if (this.current !== null) throw new Error(`art: layer ${name} painted inside ${this.current}`);
    if (this.painted.includes(name)) throw new Error(`art: layer ${name} painted twice`);
    const order = this.loop!.layers.map((l) => l.name);
    const last = this.painted[this.painted.length - 1];
    if (last !== undefined && order.indexOf(spec.name) < order.indexOf(last)) throw new Error(`art: layer ${name} painted out of its order`);
    this.current = name;
    this.painted.push(name);
    try {
      draw();
    } finally {
      this.current = null;
    }
  }

  /** The layers painted, in order. */
  layers(): readonly string[] {
    return this.painted;
  }

  /** Whether anything was painted outside the layers. */
  hasBase(): boolean {
    return this.chunks.some((c) => c.layer === null);
  }

  /** The still picture: the base, then each layer posed as its round begins; one that begins unseen is left out. */
  override svg(size: number, title: string): string {
    let body = '';
    for (const name of [null, ...this.painted]) {
      const markup = this.markupOf(name);
      if (name === null) {
        body += markup;
        continue;
      }
      const spec = this.spec(name);
      const pose = spec.keys[0]!;
      if (pose.o <= 0) continue;
      const [a, b, c, d, e, f] = giftLoopMatrix(spec, pose);
      const still = a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0;
      const attrs = `${still ? '' : ` transform="matrix(${[a, b, c, d, e, f].map(n3).join(' ')})"`}${pose.o < 1 ? ` opacity="${n2(pose.o)}"` : ''}`;
      body += attrs ? `<g${attrs}>${markup}</g>` : markup;
    }
    const t = `${this.prefix}t`;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2(size)}" viewBox="0 0 ${CANVAS} ${CANVAS}" role="img" aria-labelledby="${t}">` +
      `<title id="${t}">${escapeXml(title)}</title>${this.defsFor(body)}${body}</svg>`
    );
  }

  /**
   * One part as its own picture at the files' scale: `base` over the whole frame, or a layer over its box and drawn
   * unmoved, for a renderer that stacks and moves the parts itself. Decorative, so it has no title.
   */
  partSvg(name: 'base' | string, scale = GIFT_LOOP_SCALE): string {
    const markup = this.markupOf(name === 'base' ? null : name);
    const [x, y, w, h] = name === 'base' ? [0, 0, CANVAS, CANVAS] : this.spec(name).box;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(w * scale)}" height="${n2(h * scale)}" viewBox="${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)}">` +
      `${this.defsFor(markup)}${markup}</svg>`
    );
  }

  private spec(name: string): GiftLoopLayer {
    const spec = this.loop?.layers.find((l) => l.name === name);
    if (!spec) throw new RangeError(`art: no layer ${name} in this gift’s round`);
    return spec;
  }

  private markupOf(layer: string | null): string {
    return this.chunks
      .filter((c) => c.layer === layer)
      .map((c) => c.markup)
      .join('');
  }

  /** Only the defs a part refers to, so each part stays light. */
  private defsFor(markup: string): string {
    const used = this.defs.filter((d) => {
      const id = /\sid="([^"]+)"/.exec(d)?.[1];
      return id !== undefined && markup.includes(`#${id})`);
    });
    return used.length > 0 ? `<defs>${used.join('')}</defs>` : '';
  }
}

/** Paints `draw` into a named layer of the gift's round; on any other drawing it simply paints. */
export function layer(dr: Drawing, name: string, draw: () => void): void {
  if (dr instanceof GiftCanvas && dr.loop) dr.layer(name, draw);
  else draw();
}
