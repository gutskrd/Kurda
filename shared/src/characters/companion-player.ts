import {
  COMPANION_WORDS,
  CompanionMotion,
  companionLook,
  companionSvg,
  companionTransforms,
  type CompanionField,
  type CompanionFrame,
  type CompanionLooks,
  type CompanionStatus,
  type CompanionTone,
  type CompanionTransforms,
  type CompanionWord,
} from './companion.js';
import type { CharacterPoint, EyeState } from './types.js';

/**
 * The companion in a browser page, for the website and the admin console
 * alike: it draws him into an element, watches the forms in another (which
 * box has the focus, the caret, a key, a password shown) and the pointer, and
 * plays `CompanionMotion` frame by frame.
 *
 * Light by design. Frames are drawn only while something moves; between
 * times it sleeps until the next blink or glance is due, and not at all while
 * he is off screen or the tab is put away. Each frame writes only what
 * changed. The breath is the stylesheet's, on the element itself, so the
 * drawing is not redrawn for it. For whoever asks for less motion every part
 * goes straight to where it is going.
 *
 * Imported by path (`@kurda/shared/src/characters/companion-player`), not from
 * the package's index, which the server and the phone app read too.
 */

const PARTS: Record<keyof CompanionTransforms, string> = {
  body: 'body',
  head: 'head',
  crown: 'crown',
  ears: 'ears',
  face: 'face',
  features: 'features',
  gaze: 'gaze',
  earLeft: 'ear-left',
  earRight: 'ear-right',
  pupilLeft: 'pupil-left',
  pupilRight: 'pupil-right',
  nose: 'nose',
  legs: 'legs',
  arms: 'arms',
  legGate: 'leg-gate',
  armLeft: 'arm-left',
  armRight: 'arm-right',
  legLeft: 'leg-left',
  legRight: 'leg-right',
  shadowLeft: 'shadow-left',
  shadowRight: 'shadow-right',
};

/** How long his eyes stay where a finger left the screen (ms). */
const LINGER_MS = 1500;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Whether a box is for an address and what is in it looks like a whole one. */
const wholeAddress = (input: HTMLInputElement | null): boolean => input?.type === 'email' && EMAIL.test(input.value.trim());

const now = (): number => performance.now();

/** The input a focused element stands for: itself, or the box beside a button in the same wrapper (a password's show button). */
function inputOf(el: Element | null): HTMLInputElement | null {
  if (!el) return null;
  if (el instanceof HTMLInputElement) return el;
  if (el instanceof HTMLButtonElement) return el.parentElement?.querySelector('input') ?? null;
  return null;
}

/** What kind of box an input is to him: a password (and whether it is shown), a code of digits, words, or nothing to watch. */
export function companionField(input: HTMLInputElement | null): { field: CompanionField; shown: boolean } {
  if (!input) return { field: 'none', shown: false };
  const fill = (input.getAttribute('autocomplete') ?? '').toLowerCase();
  // a shown password is a text box, but its autocomplete still says what it is
  if (input.type === 'password' || fill.includes('password')) return { field: 'secret', shown: input.type !== 'password' };
  if (fill === 'one-time-code' || input.inputMode === 'numeric') return { field: 'code', shown: false };
  if (['text', 'email', 'search', 'tel', 'url'].includes(input.type)) return { field: 'text', shown: false };
  return { field: 'none', shown: false };
}

/**
 * Where the caret is in a box, on the screen: from the characters before it,
 * at about half the font's size each, so as not to measure the text on every
 * key. Near enough for his eyes, which look its way rather than at a letter.
 */
export function companionCaret(input: HTMLInputElement): CharacterPoint {
  const box = input.getBoundingClientRect();
  const style = window.getComputedStyle(input);
  const start = Number.parseFloat(style.paddingLeft) || 0;
  const end = Number.parseFloat(style.paddingRight) || 0;
  const size = Number.parseFloat(style.fontSize) || 16;
  const typed = input.selectionEnd ?? input.value.length;
  const width = typed * size * 0.52;
  const rtl = style.direction === 'rtl';
  const x = rtl ? box.right - end - width + input.scrollLeft : box.left + start + width - input.scrollLeft;
  return { x: Math.min(box.right - end, Math.max(box.left + start, x)), y: box.top + box.height / 2 };
}

export interface CompanionPlayerOptions {
  tone: CompanionTone;
  /** starts every id in the drawing; unique on the page */
  prefix: string;
}

export class CompanionPlayer {
  private readonly motion: CompanionMotion;
  private readonly svg: SVGSVGElement | null;
  private readonly parts: Partial<Record<keyof CompanionTransforms, Element>> = {};
  private readonly lids: Record<'left' | 'right', Element[]>;
  private readonly mouths: Element[];
  private readonly emotes: Element[];
  private readonly bubble: HTMLElement | null;
  private readonly written: Record<string, string> = {};
  private readonly cleanups: (() => void)[] = [];
  private unwatch: (() => void) | null = null;
  private input: HTMLInputElement | null = null;
  /** whether the address in the box being typed in looks whole */
  private whole = false;
  private pointer: CharacterPoint | null = null;
  private linger = 0;
  private frame = 0;
  private timer = 0;
  private onScreen = true;
  private still: boolean;
  private dead = false;

  constructor(
    private readonly host: HTMLElement,
    { tone, prefix }: CompanionPlayerOptions,
  ) {
    host.innerHTML = companionSvg({ prefix }) + (tone === 'playful' ? '<span class="cp-say" hidden></span>' : '');
    this.svg = host.querySelector('svg');
    for (const [key, name] of Object.entries(PARTS) as [keyof CompanionTransforms, string][]) {
      const el = host.querySelector(`[data-cp="${name}"]`);
      if (el) this.parts[key] = el;
    }
    this.lids = { left: [...host.querySelectorAll('[data-eye="left"] [data-lid]')], right: [...host.querySelectorAll('[data-eye="right"] [data-lid]')] };
    this.mouths = [...host.querySelectorAll('[data-mouth]')];
    this.emotes = [...host.querySelectorAll('[data-emote]')];
    this.bubble = host.querySelector<HTMLElement>('.cp-say');
    this.motion = new CompanionMotion(tone);

    const reduce = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.still = reduce?.matches === true;
    const onReduce = (): void => {
      this.still = reduce?.matches === true;
      this.wake();
    };
    reduce?.addEventListener?.('change', onReduce);
    this.cleanups.push(() => reduce?.removeEventListener?.('change', onReduce));

    const onPointer = (e: PointerEvent): void => {
      window.clearTimeout(this.linger);
      this.pointer = { x: e.clientX, y: e.clientY };
      // a finger is only there while it touches: his eyes stay there a moment, then look about again
      if (e.type === 'pointerup' && e.pointerType === 'touch') this.linger = window.setTimeout(() => (this.pointer = null), LINGER_MS);
      this.wake();
    };
    const onLeave = (e: PointerEvent): void => {
      if (e.relatedTarget === null) this.pointer = null;
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });
    window.addEventListener('pointerup', onPointer, { passive: true });
    document.addEventListener('pointerout', onLeave, { passive: true });
    this.cleanups.push(() => {
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('pointerup', onPointer);
      document.removeEventListener('pointerout', onLeave);
      window.clearTimeout(this.linger);
    });

    // a tap on him is a hello
    const onTap = (): void => {
      this.motion.react('greet', now());
      this.wake();
    };
    host.addEventListener('pointerdown', onTap);
    this.cleanups.push(() => host.removeEventListener('pointerdown', onTap));

    const onPage = (): void => this.wake();
    document.addEventListener('visibilitychange', onPage);
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onPage));
    if (typeof IntersectionObserver === 'function') {
      const seen = new IntersectionObserver((entries) => {
        this.onScreen = entries.some((e) => e.isIntersecting);
        host.classList.toggle('is-shown', this.onScreen);
        this.wake();
      });
      seen.observe(host);
      this.cleanups.push(() => seen.disconnect());
    } else host.classList.add('is-shown');

    this.motion.arrive(now());
    this.wake();
  }

  /** Where the form is: being filled in, sent, refused, let in, or paused; with a word for getting in, on the website. */
  status(status: CompanionStatus, word?: CompanionWord): void {
    this.motion.set({ status }, now(), word);
    this.wake();
  }

  /** The element whose boxes he watches, or null for none. */
  watch(area: HTMLElement | null): void {
    this.unwatch?.();
    this.unwatch = null;
    if (!area) return;
    const look = (el: Element | null): void => {
      const input = inputOf(el);
      if (input !== this.input) this.whole = wholeAddress(input);
      this.input = input;
      this.motion.set(companionField(input), now());
      this.wake();
    };
    const onFocus = (e: FocusEvent): void => look(e.target as Element);
    const onBlur = (e: FocusEvent): void => {
      const next = e.relatedTarget as Element | null;
      look(next && area.contains(next) ? next : null);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') this.motion.react('keystroke', now());
      this.wake();
    };
    // a click may show or hide a password, which changes its box once the page has drawn it
    const onClick = (): void => void requestAnimationFrame(() => look(document.activeElement && area.contains(document.activeElement) ? document.activeElement : null));
    const onMove = (): void => this.wake();
    // an address that comes to look whole as it is typed gets a grin and a nod, once
    const onInput = (): void => {
      const whole = wholeAddress(this.input);
      if (whole && !this.whole) this.motion.react('approve', now());
      this.whole = whole;
      this.wake();
    };
    area.addEventListener('focusin', onFocus);
    area.addEventListener('focusout', onBlur);
    area.addEventListener('keydown', onKey);
    area.addEventListener('click', onClick);
    area.addEventListener('input', onInput);
    area.addEventListener('select', onMove);
    area.addEventListener('keyup', onMove);
    this.unwatch = () => {
      area.removeEventListener('focusin', onFocus);
      area.removeEventListener('focusout', onBlur);
      area.removeEventListener('keydown', onKey);
      area.removeEventListener('click', onClick);
      area.removeEventListener('input', onInput);
      area.removeEventListener('select', onMove);
      area.removeEventListener('keyup', onMove);
    };
    // a box that already has the focus (one given it as the page opened)
    if (document.activeElement && area.contains(document.activeElement)) look(document.activeElement);
  }

  destroy(): void {
    this.dead = true;
    cancelAnimationFrame(this.frame);
    window.clearTimeout(this.timer);
    this.unwatch?.();
    for (const undo of this.cleanups) undo();
    this.host.innerHTML = '';
  }

  /** Draw again soon: on the next frame, unless one is already coming or he cannot be seen. */
  private readonly wake = (): void => {
    if (this.dead || this.frame || !this.onScreen || document.visibilityState === 'hidden') return;
    window.clearTimeout(this.timer);
    this.timer = 0;
    this.frame = requestAnimationFrame(this.tick);
  };

  private readonly tick = (): void => {
    this.frame = 0;
    if (this.dead) return;
    const at = now();
    const f = this.motion.step(at, this.looks(), this.still);
    this.draw(f);
    if (f.moving) this.frame = requestAnimationFrame(this.tick);
    else if (f.wakeAt !== null) this.timer = window.setTimeout(this.wake, Math.max(16, f.wakeAt - at));
  };

  private looks(): CompanionLooks {
    const box = this.svg?.getBoundingClientRect();
    if (!box || !(box.width > 0)) return { pointer: null, caret: null };
    const caret = this.input && document.activeElement === this.input ? companionCaret(this.input) : null;
    return {
      pointer: this.pointer ? companionLook(box, this.pointer.x, this.pointer.y) : null,
      caret: caret ? companionLook(box, caret.x, caret.y) : null,
    };
  }

  /** Write what changed since the last frame. */
  private draw(f: CompanionFrame): void {
    const t = companionTransforms(f);
    for (const key of Object.keys(PARTS) as (keyof CompanionTransforms)[]) {
      if (this.written[key] !== t[key]) {
        this.parts[key]?.setAttribute('transform', t[key]);
        this.written[key] = t[key];
      }
    }
    const show = (els: Element[], attr: string, value: string | null): void => {
      for (const el of els) el.setAttribute('visibility', el.getAttribute(attr) === value ? 'visible' : 'hidden');
    };
    const once = (key: string, value: string, write: () => void): void => {
      if (this.written[key] === value) return;
      this.written[key] = value;
      write();
    };
    const eye = (s: EyeState): string | null => (s === 'open' ? null : s);
    once('eyeLeft', f.eyes[0], () => show(this.lids.left, 'data-lid', eye(f.eyes[0])));
    once('eyeRight', f.eyes[1], () => show(this.lids.right, 'data-lid', eye(f.eyes[1])));
    once('mouth', f.mouth, () => show(this.mouths, 'data-mouth', f.mouth));
    once('emote', f.emote ?? '', () => {
      show(this.emotes, 'data-emote', f.emote);
      // the stylesheet moves only the sign that is shown
      if (f.emote) this.host.dataset.emote = f.emote;
      else delete this.host.dataset.emote;
    });
    once('asleep', String(f.asleep), () => this.host.classList.toggle('is-asleep', f.asleep));
    once('say', f.say ?? '', () => {
      if (!this.bubble) return;
      if (f.say) this.bubble.textContent = COMPANION_WORDS[f.say];
      this.bubble.hidden = !f.say;
    });
  }
}
