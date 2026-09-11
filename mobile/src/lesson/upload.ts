import type { ApiClient } from '../api/client';

/**
 * What to tell the server the bytes are.
 *
 * This is a hint, not a claim the server acts on: it decides which body parser
 * reads the request, and then the server sniffs the actual header and uses what
 * it finds. It used to be a claim — the recorder produces WebM on Chrome and
 * Firefox, this relabelled it `audio/mp4`, and the server stored the mislabelled
 * bytes because the upload never passed through it. WebM is recognised now, so
 * saying what it really is finally means something.
 */
function recordedType(mimeType: string): 'audio/mpeg' | 'audio/mp4' | 'audio/webm' {
  if (mimeType.includes('mpeg')) return 'audio/mpeg';
  if (mimeType.includes('webm')) return 'audio/webm';
  return 'audio/mp4';
}

/**
 * Upload a recording and return the storage key to submit as the speaking
 * answer (KUR-036).
 *
 * The bytes go to the API, which checks what they are, counts them against the
 * storage budget and stores them. It used to go the other way — ask for a signed
 * URL, PUT straight to the bucket — which meant nothing ever looked at what was
 * being stored. Returns null if the platform cannot upload, or the server
 * refused the file; the caller falls back to the skip path.
 */
export async function uploadRecording(
  client: ApiClient,
  blob: Blob,
  mimeType: string,
): Promise<string | null> {
  const bytes = await blob.arrayBuffer();
  const res = await client.postRaw<{ key: string }>('/media/uploads', bytes, recordedType(mimeType));
  return res.ok ? res.data.key : null;
}
