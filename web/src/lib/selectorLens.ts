import { lensAt, magnifier, planSwitch, retarget, type LensFrame, type SelectorMove } from '@kurda/shared';
import { playsMotion } from './motion';

/**
 * The website's selectors moving as the phone's do (shared selector-lens.ts): a run of the shared motion turned into
 * compositor keyframes for the capsule's pieces, the lens over them and the magnified copy of the row inside the lens,
 * so the move stays smooth however busy the page is. A tap during a move sends it on from where it is.
 */

/** The selector's size in pixels: one place's width, the row's height and its whole width. */
export interface SelectorBox {
  slot: number;
  height: number;
  width: number;
}

/**
 * The elements that move: the dark capsule's two round ends and the span between them, their group, and the lens. Inside
 * the lens: the copy of the row it shows magnified (the row's size, placed from its top left corner), the capsule's tint
 * drawn over the lens's ground, and its rim.
 */
export interface SelectorParts {
  group: HTMLElement;
  start: HTMLElement;
  end: HTMLElement;
  span: HTMLElement;
  lens: HTMLElement | null;
  copy?: HTMLElement | null;
  tint?: HTMLElement | null;
  rim?: HTMLElement | null;
}

/** How much of the capsule's colour shows at rest (tokens.css `--tab-capsule-fill`), read from the page. */
function restFill(el: HTMLElement): number {
  const v = parseFloat(getComputedStyle(el).getPropertyValue('--tab-capsule-fill'));
  return Number.isFinite(v) ? v : 1;
}

/** The pieces' transforms and opacities for one frame, from the reading edge, the capsule squeezed against the walls. */
export function selectorStyles(f: LensFrame, box: SelectorBox, fill: number) {
  const { slot, height, width } = box;
  const centre = (f.at + f.lead + 0.5) * slot;
  const tall = f.scale * f.squash;
  const w = slot * (1 + f.stretch) * f.scale;
  const h = height * f.scale;
  // The lens may reach a hair past the bar's ends, never further; the capsule beneath stops at them.
  const left = Math.max(centre - w / 2, -2);
  const right = Math.min(centre + w / 2, width + 2);
  const along = Math.max(right - left - h, 0);
  const m = magnifier({ left, right, slot, height, tall }, f.magnify);
  return {
    start: `translateX(${left}px) scale(${f.scale}, ${tall})`,
    end: `translateX(${right - height}px) scale(${f.scale}, ${tall})`,
    span: `translateX(${left + h / 2}px) scale(${slot > 0 ? along / slot : 0}, ${tall})`,
    lens: `translateX(${left}px) scale(${slot > 0 ? (right - left) / slot : 0}, ${tall})`,
    copy: `translate(${m.x}px, ${m.y}px) scale(${m.sx}, ${m.sy})`,
    group: fill * f.tint,
    // The lens is drawn whole the moment it lifts: at first it looks just as the capsule and the row it covers do, with
    // their tint inside it, so nothing shows through or doubles while the tint drains and the rim comes up.
    lensOpacity: f.lens > 0 ? 1 : 0,
    rim: f.lens,
  };
}

const REST = (at: number): LensFrame => ({ phase: 'rest', at, velocity: 0, scale: 1, stretch: 0, tint: 1, lens: 0, squash: 1, lead: 0, magnify: 1 });

/** Runs one selector's moves. */
export class SelectorLens {
  private move: SelectorMove | null = null;
  private running: Animation[] = [];
  private at = 0;

  constructor(
    private parts: SelectorParts,
    private box: SelectorBox,
  ) {}

  /** Puts the capsule at `at` without a move: the first draw, or after the selector is resized. */
  place(at: number, box: SelectorBox = this.box): void {
    this.box = box;
    this.stop();
    this.move = null;
    this.at = at;
    this.apply(REST(at));
  }

  /** Moves to `to`: the lens lifts, glides and settles, or under Reduce Motion the capsule fades in at its new place. */
  moveTo(to: number): void {
    if (to === this.at && !this.move) return;
    const now = performance.now();
    if (!playsMotion() || typeof this.parts.group.animate !== 'function') {
      // No lens and no glide: the capsule is simply there, faded in where something can fade.
      this.place(to);
      this.parts.group.animate?.([{ opacity: 0 }, { opacity: restFill(this.parts.group) }], { duration: 200, easing: 'ease-out' });
      return;
    }
    this.move = this.move ? retarget(this.move, to, now) : planSwitch(this.at, to, now);
    this.at = to;
    this.stop();
    const fill = restFill(this.parts.group);
    // The move sampled every frame of a 60 Hz screen, until it rests.
    const frames: ReturnType<typeof selectorStyles>[] = [];
    let t = now;
    for (;;) {
      const f = lensAt(this.move, t);
      frames.push(selectorStyles(f, this.box, fill));
      if (f.phase === 'rest') break;
      t += 1000 / 60;
    }
    const duration = t - now;
    const move = this.move;
    const run = (el: HTMLElement | null | undefined, key: 'start' | 'end' | 'span' | 'lens' | 'copy') =>
      el ? el.animate(frames.map((s) => ({ transform: s[key] })), { duration, easing: 'linear', fill: 'forwards' }) : null;
    this.running = [
      run(this.parts.start, 'start'),
      run(this.parts.end, 'end'),
      run(this.parts.span, 'span'),
      run(this.parts.lens, 'lens'),
      run(this.parts.copy, 'copy'),
      this.parts.group.animate(frames.map((s) => ({ opacity: s.group })), { duration, easing: 'linear', fill: 'forwards' }),
      this.parts.lens?.animate(frames.map((s) => ({ opacity: s.lensOpacity })), { duration, easing: 'linear', fill: 'forwards' }) ?? null,
      this.parts.tint?.animate(frames.map((s) => ({ opacity: s.group })), { duration, easing: 'linear', fill: 'forwards' }) ?? null,
      this.parts.rim?.animate(frames.map((s) => ({ opacity: s.rim })), { duration, easing: 'linear', fill: 'forwards' }) ?? null,
    ].filter((a): a is Animation => a !== null);
    this.running[0]?.finished.then(
      () => {
        if (this.move !== move) return;
        this.move = null;
        this.stop();
        this.apply(REST(to));
      },
      () => undefined,
    );
  }

  /** Ends any move under way, leaving the pieces where their own styles put them. */
  stop(): void {
    for (const a of this.running) a.cancel();
    this.running = [];
  }

  private apply(f: LensFrame): void {
    const s = selectorStyles(f, this.box, restFill(this.parts.group));
    this.parts.start.style.transform = s.start;
    this.parts.end.style.transform = s.end;
    this.parts.span.style.transform = s.span;
    this.parts.group.style.opacity = String(s.group);
    if (this.parts.lens) {
      this.parts.lens.style.transform = s.lens;
      this.parts.lens.style.opacity = String(s.lensOpacity);
    }
    if (this.parts.copy) this.parts.copy.style.transform = s.copy;
    if (this.parts.tint) this.parts.tint.style.opacity = String(s.group);
    if (this.parts.rim) this.parts.rim.style.opacity = String(s.rim);
  }
}
