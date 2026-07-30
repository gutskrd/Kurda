import {
  evaluateImageForSurface,
  onScannerError,
  type ImageScanResult,
  type ImageSurface,
  type ImageVerdict,
} from './image-scan.js';

/**
 * Provider-agnostic image-scan seam (KUR-294). A cloud vision moderation API or
 * a self-hosted model + a CSAM hashing service implements `scan`; call sites
 * never know which. Returns NSFW/violence scores, a CSAM hash-match flag, and
 * the model/hash-db version (stored for audit + tuning). Kept thin so vendors
 * swap by config.
 */
export interface ImageScanReport extends ImageScanResult {
  modelVersion: string;
}

export interface ImageScanner {
  scan(mediaKey: string): Promise<ImageScanReport>;
}

/**
 * Default scanner until a provider is configured: reports every image clean.
 * A per-key override map lets tests (and a staging harness) inject NSFW/CSAM
 * verdicts deterministically without real content.
 */
export class StubImageScanner implements ImageScanner {
  readonly modelVersion = 'stub-clean-v1';
  private readonly overrides = new Map<string, ImageScanResult>();

  /** Force a scan result for a key (test/staging only). */
  setVerdict(mediaKey: string, result: ImageScanResult): void {
    this.overrides.set(mediaKey, result);
  }

  async scan(mediaKey: string): Promise<ImageScanReport> {
    const r = this.overrides.get(mediaKey) ?? { nsfwScore: 0, violenceScore: 0, csamMatch: false };
    return { ...r, modelVersion: this.modelVersion };
  }
}

/**
 * Scan + evaluate against a surface policy. **Fails closed** on any scanner
 * error — an unscanned image is gated (withheld), never served — since there is
 * no safe fail-open for image uploads.
 */
export async function scanImageForSurface(
  scanner: ImageScanner,
  mediaKey: string,
  surface: ImageSurface,
): Promise<{ verdict: ImageVerdict; report: ImageScanReport | null }> {
  try {
    const report = await scanner.scan(mediaKey);
    return { verdict: evaluateImageForSurface(report, surface), report };
  } catch {
    return { verdict: onScannerError(), report: null };
  }
}
