import { Platform } from 'react-native';
import { PEEK_LEAN, tiltFromGravity, tiltFromOrientation } from '@kurda/shared';

/**
 * The phone's sideways tilt, for Hevalo leaning with it (shared peek-lean.ts). Everyone listening shares one reading
 * of the motion sensor, which runs only while someone listens: each Hevalo listens only while his screen is in front
 * and Reduce Motion is off. The sensor needs no permission and nothing it reads is kept. The web build reads the
 * browser's orientation events without asking; where a browser would ask first, he simply stands still. Without the
 * native module (tests, an older binary) nothing is read.
 */

type Listener = (tiltDeg: number) => void;

interface DeviceMotion {
  setUpdateInterval(ms: number): void;
  addListener(listener: (reading: { accelerationIncludingGravity?: { x: number; y: number; z: number } | null }) => void): {
    remove(): void;
  };
}

const listeners = new Set<Listener>();
let stopReading: (() => void) | null = null;

function emit(tilt: number | null): void {
  if (tilt == null) return;
  for (const listener of listeners) listener(tilt);
}

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
      // The app is held upright only, so the sensor's axes are the screen's. Gravity here points toward the ground.
      const subscription = motion.addListener(({ accelerationIncludingGravity: g }) => {
        if (g) emit(tiltFromGravity(g.x, g.y, g.z));
      });
      return () => subscription.remove();
    } catch {
      return () => undefined;
    }
  }
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => undefined;
  const onTurn = (event: Event): void => {
    const { beta, gamma } = event as DeviceOrientationEvent;
    emit(tiltFromOrientation(beta, gamma, screenAngle()));
  };
  window.addEventListener('deviceorientation', onTurn);
  return () => window.removeEventListener('deviceorientation', onTurn);
}

/** Hears the phone's tilt to the right in degrees, a few dozen times a second, until the returned function is called. */
export function onDeviceTilt(listener: Listener): () => void {
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
