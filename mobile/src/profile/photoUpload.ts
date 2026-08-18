import * as FileSystem from 'expo-file-system/legacy';
import type { ApiClient } from '../api/client';
import { describeError } from '../api/errors';
import { base64ToBytes, sha256Hex } from './photoHash';

/** The signed-upload ticket from the API (KUR-177). */
interface UploadTicket {
  key: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  publicUrl: string;
}

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Upload a picked/cropped image as the user's profile photo (KUR-180):
 * hash + size the file → request a signed PUT (#177) → binary-PUT the bytes →
 * confirm (moderation-gated, #181) which sets it and returns the public URL.
 *
 * The hashing is pure + tested; the network steps require live object storage
 * (S3/R2) configured on the API — they can't be exercised without it.
 */
export async function uploadProfilePhoto(
  client: ApiClient,
  photo: { uri: string; contentType: string },
): Promise<UploadResult> {
  try {
    const base64 = await FileSystem.readAsStringAsync(photo.uri, { encoding: FileSystem.EncodingType.Base64 });
    const bytes = base64ToBytes(base64);

    const ticketRes = await client.post<UploadTicket>('/me/profile-picture/upload-url', {
      contentType: photo.contentType,
      contentLength: bytes.length,
      sha256Hex: sha256Hex(bytes),
    });
    if (!ticketRes.ok) return { ok: false, error: describeError(ticketRes.error).message };
    const ticket = ticketRes.data;

    const put = await FileSystem.uploadAsync(ticket.uploadUrl, photo.uri, {
      httpMethod: 'PUT',
      headers: ticket.requiredHeaders,
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });
    if (put.status < 200 || put.status >= 300) {
      return { ok: false, error: `Upload failed (${put.status}). Please try again.` };
    }

    const confirm = await client.post<{ profilePhotoUrl: string }>('/me/profile-picture', { key: ticket.key });
    if (!confirm.ok) return { ok: false, error: describeError(confirm.error).message };
    return { ok: true, url: confirm.data.profilePhotoUrl };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'Could not upload the photo.' };
  }
}
