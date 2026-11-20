import { CLEAN_LEVELS, levelsOf, type PictureLevels } from './image-scan.js';

/**
 * The picture checker seam: given a picture's bytes, how sure it is that the picture shows something in each category,
 * and which model said so. A failure of any kind throws, and the caller holds the picture for a person; it never
 * clears one. The vision implementation is vision-scanner.ts; the stub here is for tests and local development only.
 */
export interface PictureScanReport {
  levels: PictureLevels;
  model: string;
}

export interface ImageScanner {
  scan(input: { bytes: Buffer }): Promise<PictureScanReport>;
}

/** The checker could not give an answer (refused, malformed, timed out, down); the picture waits for a person. */
export class ScanUnavailable extends Error {
  constructor(readonly why: string) {
    super(`the picture check gave no answer: ${why}`);
    this.name = 'ScanUnavailable';
  }
}

type StubAnswer = Partial<PictureLevels> | 'unavailable';

/**
 * Finds nothing in any picture, unless told otherwise: answers queued for the next scans (taken in order), or a
 * standing answer. Never used in production (app.ts refuses it there).
 */
export class StubImageScanner implements ImageScanner {
  readonly model = 'stub-clean-v2';
  private readonly queued: StubAnswer[] = [];
  private standing: StubAnswer = {};
  /** how many pictures it was asked about */
  calls = 0;

  /** The answers for the next scans, one each, before the standing one applies again. */
  queue(...answers: StubAnswer[]): this {
    this.queued.push(...answers);
    return this;
  }

  /** The answer for every scan nothing is queued for. */
  answer(answer: StubAnswer): this {
    this.standing = answer;
    return this;
  }

  /** Back to finding nothing, with nothing queued. */
  reset(): this {
    this.queued.length = 0;
    this.standing = {};
    this.calls = 0;
    return this;
  }

  async scan(): Promise<PictureScanReport> {
    this.calls++;
    const answer = this.queued.length > 0 ? this.queued.shift()! : this.standing;
    if (answer === 'unavailable') throw new ScanUnavailable('stub told to be unavailable');
    return { levels: Object.keys(answer).length ? levelsOf(answer) : CLEAN_LEVELS, model: this.model };
  }
}
