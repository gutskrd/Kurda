import * as FileSystem from 'expo-file-system/legacy';
import type { ApiClient } from '../api/client';
import { describeUploadFailure, normalizeContentType, type UploadResult } from './photoUploadResult';

export type { UploadResult } from './photoUploadResult';

/**
 * Upload a picked/cropped image as the user's profile photo (KUR-177, through-server).
 *
 * POSTs the raw image bytes to `/me/profile-picture`; the server validates the
 * *actual* file type, resizes to ≤512 px, re-encodes to WebP ≤250 KB, enforces the
 * storage / op / rate limits, stores it, and swaps out the old one — returning the
 * public URL. The client's declared content-type is a hint only; the server sniffs.
 *
 * Binary bodies can't go through `ApiClient.request()` (it JSON-encodes), so this
 * streams the file with expo-file-system and attaches the access token directly.
 */
export async function uploadProfilePhoto(
  client: ApiClient,
  photo: { uri: string; contentType: string },
): Promise<UploadResult> {
  try {
    const token = await client.getAccessToken();
    if (!token) return { ok: false, error: 'Your session expired. Please sign in again.' };

    const res = await FileSystem.uploadAsync(`${client.baseUrl}/me/profile-picture`, photo.uri, {
      httpMethod: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': normalizeContentType(photo.contentType),
      },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });

    if (res.status >= 200 && res.status < 300) {
      try {
        const body = JSON.parse(res.body) as { profilePhotoUrl?: string };
        if (body.profilePhotoUrl) return { ok: true, url: body.profilePhotoUrl };
      } catch {
        // fall through to the generic error below
      }
      return { ok: false, error: 'The upload finished but no photo was returned. Please try again.' };
    }

    return { ok: false, error: describeUploadFailure(res.status, res.body) };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'Could not upload the photo.' };
  }
}
