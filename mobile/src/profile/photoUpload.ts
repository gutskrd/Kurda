import type { Translate } from '../api/errors';
import * as FileSystem from 'expo-file-system/legacy';
import type { ApiClient } from '../api/client';
import { describeUploadFailure, uploadWasLimited, normalizeContentType, type UploadResult } from './photoUploadResult';

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
  t: Translate,
  /** the app's language, so a limit's end is said as the reader would say it */
  locale?: string,
): Promise<UploadResult> {
  return uploadPicture(client, '/me/profile-picture', 'profilePhotoUrl', photo, t, locale);
}

/**
 * A group's picture, the same way: the raw bytes to `/groups/:id/photo`, where
 * the server checks that you are its owner or an admin and puts the picture
 * through every guard a profile photo goes through.
 */
export async function uploadGroupPhoto(
  client: ApiClient,
  groupId: string,
  photo: { uri: string; contentType: string },
  t: Translate,
  locale?: string,
): Promise<UploadResult> {
  return uploadPicture(client, `/groups/${groupId}/photo`, 'photoUrl', photo, t, locale);
}

async function uploadPicture(
  client: ApiClient,
  path: string,
  field: 'profilePhotoUrl' | 'photoUrl',
  photo: { uri: string; contentType: string },
  t: Translate,
  locale?: string,
): Promise<UploadResult> {
  try {
    const token = await client.getAccessToken();
    if (!token) return { ok: false, error: t('upload.sessionExpired') };

    const res = await FileSystem.uploadAsync(`${client.baseUrl}${path}`, photo.uri, {
      httpMethod: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': normalizeContentType(photo.contentType),
      },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });

    if (res.status >= 200 && res.status < 300) {
      try {
        const body = JSON.parse(res.body) as Record<string, string | undefined>;
        const url = body[field];
        if (url) return { ok: true, url };
      } catch {
        // fall through to the generic error below
      }
      return { ok: false, error: t('upload.noPhotoReturned') };
    }

    return { ok: false, error: describeUploadFailure(res.status, res.body, t, locale), limited: uploadWasLimited(res.status, res.body) };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? t('upload.photoFailed') };
  }
}
