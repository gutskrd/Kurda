import { Platform } from 'react-native';
import { PEEK_LEAN, tiltFromGravity, tiltFromOrientation } from '@kurda/shared';

/**
 * How the phone is held and moved, for Hevalo leaning and turning with it (shared peek-lean.ts): its sideways tilt, and
 * how fast it swings round its own upright line. Everyone listening shares one reading of the motion sensor, which runs
 * only while someone listens: each Hevalo listens only while his screen is in front and Reduce Motion is off. The
 * sensor needs no permission and nothing it reads is kept. The web build reads the browser's motion events without
 * asking; where a browser would ask first, he simply stays as he is. Without the native module (tests, an older binary)
 * nothing is read.
 */

/** One reading: the tilt to the right in degrees, and the swing in degrees a second (right side going back above 0), each when known. */
export interface Motion {
  tilt?: number;
  swing?: number;
}

type Listener = (motion: Motion) => void;

interface DeviceMotion {
  setUpdateInterval(ms: number): void;
  addListener(
    listener: (reading: {
      accelerationIncludingGravity?: { x: number; y: number; z: number } | null;
      rotationRate?: { beta: number } | null;
    }) => void,
  ): {
    remove(): void;
  };
}

const listeners = new Set<Listener>();
let stopReading: (() => void) | null = null;

function emit(motion: Motion): void {
  if (motion.tilt == null && motion.swing == null) return;
  for (const listener of listeners) listener(motion);
}

/** A number, or nothing for a missing or broken one. */
const known = (v: number | null | undefined): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function deviceMotion(): DeviceMotion | null {
  try {
    // Required rather than imported: the web bundle and tests must never evaluate a native module, and an old binary has none.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('expo-sensors') as { DeviceMotion: DeviceMotion }).DeviceMotion;
  } catch {
    return null;
  }
}

/** The page's own turn on screen, in degrees, for the web build. */
function screenAngle(): number {
  const angle = typeof screen !== 'undefined' ? screen.orientation?.angle : undefined;
  return typeof angle === 'number' ? angle : 0;
}

function startReading(): () => void {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    const motion = deviceMotion();
    if (!motion) return () => undefined;
    try {
      motion.setUpdateInterval(PEEK_LEAN.sampleMs);
      // The app is held upright only, so the sensor's axes are the screen's. Gravity here points toward the ground, and
      // both platforms give the turn about the phone's upright line as `beta`, in degrees a second.
      const subscription = motion.addListener(({ accelerationIncludingGravity: g, rotationRate: r }) => {
        emit({ tilt: g ? known(tiltFromGravity(g.x, g.y, g.z)) : undefined, swing: known(r?.beta) });
      });
      return () => subscription.remove();
    } catch {
      return () => undefined;
    }
  }
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => undefined;
  const onTilt = (event: Event): void => {
    const { beta, gamma } = event as DeviceOrientationEvent;
    emit({ tilt: known(tiltFromOrientation(beta, gamma, screenAngle())) });
  };
  // A browser gives the turn about the phone's upright line as `gamma`, in degrees a second.
  const onSwing = (event: Event): void => {
    emit({ swing: known((event as DeviceMotionEvent).rotationRate?.gamma) });
  };
  window.addEventListener('deviceorientation', onTilt);
  window.addEventListener('devicemotion', onSwing);
  return () => {
    window.removeEventListener('deviceorientation', onTilt);
    window.removeEventListener('devicemotion', onSwing);
  };
}

/** Hears how the phone is held and moved, a few dozen times a second, until the returned function is called. */
export function onDeviceMotion(listener: Listener): () => void {
  listeners.add(listener);
  stopReading ??= startReading();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stopReading) {
      stopReading();
      stopReading = null;
    }
  };
}
