import type { AppConfig } from '../config/env.js';
import { StubImageScanner, type ImageScanner } from './image-scanner.js';
import { VisionImageScanner } from './vision-scanner.js';

/**
 * Which picture checker a server runs, decided once at start-up: the vision service when its key is set; in production
 * without one, none, so every picture waits for a person; elsewhere the stub that finds nothing, so local development
 * and tests never call out. A test may pass its own scanner, but the stub is refused in production.
 */
export function pictureScannerFor(
  config: Pick<AppConfig, 'NODE_ENV' | 'ANTHROPIC_API_KEY' | 'IMAGE_SCAN_MODEL' | 'IMAGE_REVIEW_MODE'>,
  log: { warn: (obj: object, msg: string) => void },
  override?: ImageScanner | null,
): ImageScanner | null {
  const production = config.NODE_ENV === 'production';
  if (override !== undefined) {
    if (production && override instanceof StubImageScanner) throw new Error('the stub picture checker must never run in production');
    return override;
  }
  if (config.ANTHROPIC_API_KEY) return new VisionImageScanner({ apiKey: config.ANTHROPIC_API_KEY, model: config.IMAGE_SCAN_MODEL });
  if (production) {
    log.warn(
      { mode: config.IMAGE_REVIEW_MODE },
      'no picture checker configured (ANTHROPIC_API_KEY): every picture waits for a person on the Picture checks page',
    );
    return null;
  }
  return new StubImageScanner();
}
