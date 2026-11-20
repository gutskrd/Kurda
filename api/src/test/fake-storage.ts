import { Readable } from 'node:stream';
import { PrivateStorageUnavailable, type MediaStorage } from '../media/storage.js';

/**
 * An in-memory media bucket and private evidence storage for the moderation suites: what is public, what is private,
 * and what the CDN was asked to forget. `failCopies` makes the next copies throw. Data exports go to `privateFiles`
 * only while `hasPrivateBucket` is true, as with real storage.
 */
export class FakeStorage {
  readonly publicObjects = new Map<string, { contentType: string | undefined }>();
  readonly evidence = new Map<string, { contentType: string | undefined; cacheControl: string }>();
  readonly privateFiles = new Map<string, Buffer>();
  readonly purged: string[] = [];
  failCopies = 0;
  purgeAnswer: boolean | null = true;
  hasPrivateBucket = true;

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
    this.privateFiles.delete(key);
  }

  async putPrivate(key: string, body: Buffer): Promise<void> {
    if (!this.hasPrivateBucket) throw new PrivateStorageUnavailable();
    this.privateFiles.set(key, body);
  }

  async copyToEvidence(key: string, target: string, contentType?: string): Promise<void> {
    if (this.failCopies > 0) {
      this.failCopies--;
      throw new Error('storage unavailable');
    }
    if (!this.publicObjects.has(key)) throw new Error('NoSuchKey');
    this.evidence.set(target, { contentType, cacheControl: 'private, no-store, max-age=0' });
  }

  async putEvidence(target: string, _body: Buffer, contentType: string): Promise<void> {
    this.evidence.set(target, { contentType, cacheControl: 'private, no-store, max-age=0' });
  }

  async publishFromEvidence(target: string, key: string, contentType: string): Promise<void> {
    if (!this.evidence.has(target)) throw new Error('NoSuchKey');
    this.publicObjects.set(key, { contentType });
  }

  async read(key: string): Promise<{ body: Readable; contentType?: string } | null> {
    const object = this.publicObjects.get(key);
    return object ? { body: Readable.from([Buffer.from('public')]), contentType: object.contentType } : null;
  }

  async readEvidence(target: string): Promise<Buffer | null> {
    return this.evidence.has(target) ? Buffer.from('evidence') : null;
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
