import * as FileSystem from 'expo-file-system/legacy';
import type { ApiClient } from '../api/client';
import type { Translate } from '../api/errors';
import { normalizeContentType } from '../profile/photoUploadResult';

/**
 * Upload the bytes of a picture that is about to become a post.
 *
 * Two steps, and the order matters: `POST /images/upload` validates the file,
 * resizes, compresses, signs and scans it, and only then does `POST /images`
 * accept the id it hands back. The bytes are stored whether or not the post is
 * created, so a failure at the second step is worth saying out loud rather than
 * silently dropping what the user chose.
 *
 * Binary bodies cannot go through `ApiClient.request()`, which JSON-encodes, so
 * this streams the file with expo-file-system and attaches the token itself —
 * the same shape as the profile-photo upload next door.
 */
export type UploadedImage = { ok: true; imageMediaId: string } | { ok: false; error: string };

export async function uploadPostImage(
  client: ApiClient,
  photo: { uri: string; contentType: string },
  t: Translate,
): Promise<UploadedImage> {
  try {
    const token = await client.getAccessToken();
    if (!token) return { ok: false, error: t('upload.sessionExpired') };

    const res = await FileSystem.uploadAsync(`${client.baseUrl}/images/upload`, photo.uri, {
      httpMethod: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': normalizeContentType(photo.contentType),
      },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });

    if (res.status >= 200 && res.status < 300) {
      try {
        const body = JSON.parse(res.body) as { imageMediaId?: string };
        if (body.imageMediaId) return { ok: true, imageMediaId: body.imageMediaId };
      } catch {
        // fall through to the generic failure below
      }
      return { ok: false, error: t('picture.noIdReturned') };
    }

    // the one code worth its own sentence: the deployment has no media storage
    // configured, which is not something trying again will fix
    let code: string | undefined;
    try {
      code = (JSON.parse(res.body) as { code?: string }).code;
    } catch {
      // body was not JSON; the status alone decides below
    }
    if (code === 'MEDIA_UNAVAILABLE') return { ok: false, error: t('picture.storageOff') };
    return { ok: false, error: t('picture.uploadFailed') };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? t('picture.uploadFailed') };
  }
}
