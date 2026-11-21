import { useEffect, type RefObject } from 'react';
import {
  PEEK_LEAN,
  PEEK_TURN,
  TURN_SPRING,
  bentNeck,
  characterArt,
  leanFor,
  partTransforms,
  peekParts,
  pieceTransform,
  readPiece,
  shareYaw,
  sinkTransform,
  snoutSlices,
  stepLean,
  tiltFromOrientation,
  swingAngle,
  turnForMotion,
  turnedHead,
  type HeadPiece,
  type LeanState,
} from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';

type Settling = LeanState & { settled?: boolean };

/**
 * Hevalo moving with the phone on the website, as in the phone app (shared peek-lean.ts): the browser's motion events
 * carry the tilt and the swing round, the shared springs carry him, `--peek-lean` on `ref` leans him and his shadows,
 * and his whole head turns as the phone tilts and swings: its antlers and ears as `data-turn` groups (head-turn.ts)
 * showing their depth (`data-sink`), every shape of his face as a `data-piece` group placed on his turned head, his
 * muzzle's side in slices, and his neck bent to ride round under it (head-round.ts), the other way round when
 * `mirrored`. It never
 * asks for motion access: where a browser would ask first, or has no sensor, he simply stays as he is. Off under Reduce
 * Motion; each frame runs only while he is moving.
 */
export function usePeekMotion(ref: RefObject<HTMLElement | null>, active: boolean, mirrored: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el || typeof window.DeviceOrientationEvent === 'undefined' || prefersReducedMotion()) return;
    const art = characterArt('hevalo');
    let lean: Settling = { angle: 0, speed: 0 };
    let turn: Settling = { angle: 0, speed: 0 };
    const target = { lean: 0, turn: 0 };
    // How far the phone has swung round from the way it is held, and how far it is tilted, in degrees.
    let swung = 0;
    let tilted = 0;
    let frame: number | null = null;
    let last = 0;
    let heard = 0;
    // The pieces of his face as drawn, read once, and again should the drawing be replaced (he dozes off, say).
    const read = () =>
      [...el.querySelectorAll<SVGElement>('[data-piece]')].map((node) => ({ node, piece: readPiece(node.dataset.piece ?? 'skull') as HeadPiece }));
    // His neck's shapes as drawn, read the same way.
    const readNeck = () =>
      [...el.querySelectorAll<SVGPathElement>('[data-neck]')].map((node) => ({ node, d: node.getAttribute('d') ?? '', throat: node.dataset.neck === 'throat' }));
    let pieces = read();
    let neck = readNeck();
    let placed = false;
    const place = (share: number): void => {
      if (pieces.length > 0 && !pieces[0]!.node.isConnected) pieces = read();
      if (neck.length > 0 && !neck[0]!.node.isConnected) neck = readNeck();
      const yaw = shareYaw(share);
      for (const { node, piece } of pieces) {
        if (yaw === 0) node.removeAttribute('transform');
        else node.setAttribute('transform', pieceTransform(piece, yaw));
      }
      // His outline redrawn for the turn, and his muzzle's side coming into view.
      const head = turnedHead(yaw);
      for (const path of el.querySelectorAll('[data-shape="head"]')) path.setAttribute('d', head);
      const slices = snoutSlices(yaw);
      for (const snout of el.querySelectorAll('[data-shape="snout"]')) {
        if (yaw === 0) snout.setAttribute('display', 'none');
        else snout.removeAttribute('display');
        [...snout.children].forEach((slice, i) => slice.setAttribute('transform', slices[i] ?? ''));
      }
      // The depth of his ears and antlers: what sits back moves aside, and what shows only turned comes out.
      for (const g of el.querySelectorAll<SVGGElement>('[data-sink]')) {
        if (yaw === 0) {
          g.removeAttribute('transform');
          if (g.hasAttribute('data-behind')) g.setAttribute('display', 'none');
        } else {
          g.setAttribute('transform', sinkTransform(Number(g.dataset.sink), yaw));
          g.removeAttribute('display');
        }
      }
      for (const { node, d, throat } of neck) node.setAttribute('d', bentNeck(d, yaw, throat));
      placed = yaw !== 0;
    };
    const show = (): void => {
      el.style.setProperty('--peek-lean', `${lean.angle.toFixed(2)}deg`);
      const share = mirrored ? -turn.angle : turn.angle;
      const transforms = partTransforms(peekParts(art, share));
      for (const group of el.querySelectorAll<SVGGElement>('[data-turn]')) {
        const name = group.dataset.turn as keyof typeof transforms;
        if (transforms[name]) group.setAttribute('transform', transforms[name]);
      }
      place(share);
    };
    const tick = (now: number): void => {
      const seconds = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      lean = stepLean(lean, target.lean, seconds);
      turn = stepLean(turn, target.turn, seconds, TURN_SPRING);
      show();
      frame = lean.settled && turn.settled ? null : requestAnimationFrame(tick);
    };
    const wake = (): void => {
      if (frame != null) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    };
    const onTilt = (event: DeviceOrientationEvent): void => {
      const tilt = tiltFromOrientation(event.beta, event.gamma, screen.orientation?.angle ?? 0);
      if (tilt == null) return;
      tilted = tilt;
      const wanted = leanFor(tilt);
      if (Math.abs(wanted - target.lean) >= PEEK_LEAN.wakeDeg) {
        target.lean = wanted;
        wake();
      }
      turnTo();
    };
    // His head's turn, for the swing and the tilt together.
    const turnTo = (): void => {
      const wanted = turnForMotion(swung, tilted);
      if (Math.abs(wanted - target.turn) < PEEK_TURN.wakeShare && !(wanted === 0 && target.turn !== 0)) return;
      target.turn = wanted;
      wake();
    };
    // The turn about the phone's upright line, in degrees a second.
    const onSwing = (event: DeviceMotionEvent): void => {
      const rate = event.rotationRate?.gamma;
      if (rate == null) return;
      const now = performance.now();
      swung = swingAngle(swung, rate, heard ? (now - heard) / 1000 : PEEK_LEAN.sampleMs / 1000);
      heard = now;
      turnTo();
    };
    window.addEventListener('deviceorientation', onTilt);
    window.addEventListener('devicemotion', onSwing);
    return () => {
      window.removeEventListener('deviceorientation', onTilt);
      window.removeEventListener('devicemotion', onSwing);
      if (frame != null) cancelAnimationFrame(frame);
      el.style.removeProperty('--peek-lean');
      if (placed) place(0);
    };
  }, [ref, active, mirrored]);
}
