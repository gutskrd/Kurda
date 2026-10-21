import type { MediaStorage } from '../media/storage.js';

/**
 * An in-memory stand-in for the media bucket and the private evidence storage,
 * for the moderation suites: what is public, what is kept privately, and what
 * the CDN was asked to forget. `failCopies` makes the next copies throw, as a
 * storage outage would.
 */
export class FakeStorage {
  readonly publicObjects = new Map<string, { contentType: string | undefined }>();
  readonly evidence = new Map<string, { contentType: string | undefined; cacheControl: string }>();
  readonly purged: string[] = [];
  failCopies = 0;
  purgeAnswer: boolean | null = true;

  constructor(private readonly cdn = 'https://cdn.test') {}

  /** Put a public object, as an upload would. */
  upload(key: string, contentType = 'image/webp'): void {
    this.publicObjects.set(key, { contentType });
  }

  publicUrl(key: string): string {
    return `${this.cdn}/${key}`;
  }

  async put(key: string, _body: Buffer, contentType: string): Promise<void> {
    this.publicObjects.set(key, { contentType });
  }

  async exists(key: string): Promise<boolean> {
    return this.publicObjects.has(key);
  }

  async delete(key: string): Promise<void> {
    this.publicObjects.delete(key);
  }

  async copyToEvidence(key: string, target: string, contentType?: string): Promise<void> {
    if (this.failCopies > 0) {
      this.failCopies--;
      throw new Error('storage unavailable');
    }
    if (!this.publicObjects.has(key)) throw new Error('NoSuchKey');
    this.evidence.set(target, { contentType, cacheControl: 'private, no-store, max-age=0' });
  }

  async evidenceExists(target: string): Promise<boolean> {
    return this.evidence.has(target);
  }

  async deleteEvidence(target: string): Promise<void> {
    this.evidence.delete(target);
  }

  async createDownloadUrl(key: string, ttl = 900): Promise<string> {
    return `https://signed.test/public/${key}?ttl=${ttl}`;
  }

  async createPrivateDownloadUrl(key: string, ttl = 900): Promise<string> {
    return `https://signed.test/private/${key}?ttl=${ttl}`;
  }

  async createEvidenceDownloadUrl(target: string, ttl = 300): Promise<string> {
    return `https://signed.test/evidence/${target}?ttl=${ttl}`;
  }

  async purgePublic(keys: string[]): Promise<boolean | null> {
    if (this.purgeAnswer === null) return null;
    this.purged.push(...keys.map((k) => this.publicUrl(k)));
    return this.purgeAnswer;
  }

  get asStorage(): MediaStorage {
    return this as unknown as MediaStorage;
  }
}
