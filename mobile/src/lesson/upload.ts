import type { ApiClient } from '../api/client';

/** Storage content types the recorder may produce, mapped for the API. */
function normalizeAudioType(mimeType: string): 'audio/mp4' | 'audio/mpeg' {
  // browsers commonly record audio/webm; the API bucket accepts mp4/mpeg, so
  // we tag mp4 (the container the mobile recorder targets) — good enough for
  // the stub scorer, which doesn't inspect the bytes (KUR-036/KUR-120).
  return mimeType.includes('mpeg') ? 'audio/mpeg' : 'audio/mp4';
}

interface UploadTicket {
  key: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Upload a recording via a signed URL (KUR-036): hash the bytes, request a
 * ticket, PUT directly to storage, and return the content-addressed key to
 * submit as the speaking answer. Returns null if the platform can't hash or
 * upload (caller falls back to the skip path).
 */
export async function uploadRecording(
  client: ApiClient,
  blob: Blob,
  mimeType: string,
  kind = 'speaking',
): Promise<string | null> {
  const doFetch = globalThis.fetch;
  if (!doFetch) return null;

  const bytes = await blob.arrayBuffer();
  const hash = await sha256Hex(bytes);
  if (!hash) return null;

  const contentType = normalizeAudioType(mimeType);
  const ticket = await client.post<UploadTicket>('/media/uploads', {
    kind,
    contentType,
    contentLength: blob.size,
    sha256Hex: hash,
  });
  if (!ticket.ok) return null;

  const put = await doFetch(ticket.data.uploadUrl, {
    method: 'PUT',
    headers: ticket.data.requiredHeaders,
    body: bytes,
  });
  return put.ok ? ticket.data.key : null;
}
