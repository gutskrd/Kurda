import type { Translate } from '../api/errors';
import * as FileSystem from 'expo-file-system/legacy';
import type { ApiClient } from '../api/client';
import { describeUploadFailure, uploadWasLimited, normalizeContentType, type UploadResult } from './photoUploadResult';

export type { UploadResult } from './photoUploadResult';

/**
 * Upload a picked and cropped image as the user's profile photo: the raw bytes to `/me/profile-picture`, where the
 * server checks the real file type, resizes to at most 512px, re-encodes to WebP, enforces its limits, stores it and
 * replaces the old one, returning the public URL. Binary bodies cannot go through `ApiClient.request()` (it
 * JSON-encodes), so the file is streamed with expo-file-system with the access token attached.
 */
export async function uploadProfilePhoto(
  client: ApiClient,
  photo: { uri: string; contentType: string },
  t: Translate,
  /** The app's language, so a limit's end is said as the reader would say it. */
  locale?: string,
): Promise<UploadResult> {
  return uploadPicture(client, '/me/profile-picture', 'profilePhotoUrl', photo, t, locale);
}

/**
 * A group's picture, the same way: raw bytes to `/groups/:id/photo`, where the server checks you are its owner or an
 * admin and applies every guard a profile photo gets.
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
  // The bytes bypass the client, which renews an expired session (15 minutes): a refusal for that is answered by asking
  // for the account through the client, which renews it, and sending once more.
  const attempt = async (): Promise<FileSystem.FileSystemUploadResult | null> => {
    const token = await client.getAccessToken();
    if (!token) return null;
    return FileSystem.uploadAsync(`${client.baseUrl}${path}`, photo.uri, {
      httpMethod: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': normalizeContentType(photo.contentType),
      },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });
  };
  try {
    let res = await attempt();
    if (res?.status === 401) {
      await client.get('/me');
      res = await attempt();
    }
    if (!res) return { ok: false, error: t('upload.sessionExpired') };

    if (res.status >= 200 && res.status < 300) {
      try {
        const body = JSON.parse(res.body) as Record<string, string | undefined>;
        const url = body[field];
        if (url) return { ok: true, url };
      } catch {
        // Fall through to the generic error below.
      }
      return { ok: false, error: t('upload.noPhotoReturned') };
    }

    return { ok: false, error: describeUploadFailure(res.status, res.body, t, locale), limited: uploadWasLimited(res.status, res.body) };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? t('upload.photoFailed') };
  }
}
