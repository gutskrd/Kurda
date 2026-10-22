import { useEffect, useRef } from 'react';
import { VERTEX_SHADER, fitScene, fragmentShader } from './ribbons';

/** How often the ribbons are drawn: a little over thirty times a second, as smooth as the loop they were made from. */
const FRAME_MS = 32;
/** A still picture, for whoever asks the system for less motion: the ribbons as they are this far in. */
const STILL_AT = 2.4;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

/**
 * Starts the ribbons on a canvas at the screen's own resolution and keeps it
 * the window's size; returns what stops them. They move only while the page
 * is in view, and stand still for anyone who asks for less motion. Without a
 * graphics chip to draw them (an old browser, a test) it does nothing, and the
 * dark violet behind the canvas stays.
 */
export function startRibbons(canvas: HTMLCanvasElement): () => void {
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power' });
  } catch {
    return () => undefined;
  }
  if (!gl) return () => undefined;
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentShader());
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return () => undefined;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return () => undefined;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const corner = gl.getAttribLocation(program, 'corner');
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
  const at = {
    size: gl.getUniformLocation(program, 'size'),
    scale: gl.getUniformLocation(program, 'scale'),
    top: gl.getUniformLocation(program, 'top'),
    t: gl.getUniformLocation(program, 't'),
  };
  const ctx = gl;

  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let last = 0;
  // the ribbons' own clock, which stops while the page is hidden so they carry on from where they were
  let clock = STILL_AT;

  const draw = (): void => {
    ctx.uniform1f(at.t, clock);
    ctx.drawArrays(ctx.TRIANGLES, 0, 3);
  };

  const size = (): void => {
    // sharp on a high-density screen, but no more than twice over: the finest line is under a pixel already
    const pixels = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(window.innerWidth * pixels);
    const height = Math.round(window.innerHeight * pixels);
    canvas.width = width;
    canvas.height = height;
    ctx.viewport(0, 0, width, height);
    const fit = fitScene(width, height);
    ctx.uniform2f(at.size, width, height);
    ctx.uniform1f(at.scale, fit.scale);
    ctx.uniform1f(at.top, fit.top);
    draw();
  };

  const tick = (now: number): void => {
    frame = requestAnimationFrame(tick);
    const since = last ? now - last : FRAME_MS;
    if (since < FRAME_MS) return;
    last = now;
    // a long gap (the tab was asleep) does not jump the ribbons ahead
    clock += Math.min(since, 100) / 1000;
    draw();
  };

  const play = (): void => {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    if (motion?.matches) clock = STILL_AT;
    if (motion?.matches || document.hidden) {
      draw();
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  size();
  play();
  window.addEventListener('resize', size);
  document.addEventListener('visibilitychange', play);
  motion?.addEventListener?.('change', play);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', size);
    document.removeEventListener('visibilitychange', play);
    motion?.removeEventListener?.('change', play);
  };
}

/**
 * The admin's backdrop (ribbons.ts): violet ribbons on black behind every
 * page, fixed, so they never scroll. Decorative, so hidden from assistive
 * technology.
 */
export function Backdrop(): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => (canvas.current ? startRibbons(canvas.current) : undefined), []);
  return (
    <div className="ribbons" aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}
