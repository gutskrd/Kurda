import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { pictureUploadPath, type PictureRejection, type PictureReviewState } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { Translate } from '../api/errors';
import { normalizeContentType } from '../profile/photoUploadResult';
import { rejectionInBody, reviewStateOf } from '../pictures/review';
import { describePictureFailure } from './errors';

/**
 * Upload one picture for a post, reporting progress. Pictures go up as soon as they are attached, so Post is instant;
 * the server keeps an upload unconfirmed until a post uses it and clears unused ones after a day.
 *
 * "I made this" decides the address (`pictureUploadPath`): on, the picture gets the small Hevalo signature with the
 * poster's handle; off, none, since a signature would claim somebody else's picture. The bytes go straight from the
 * file (`ApiClient.request()` would JSON-encode them), via expo-file-system's upload task on a phone and XMLHttpRequest
 * on the web, both with progress. A token that expired since the screen opened is refreshed once and the upload
 * retried. A picture held for a person comes back with an owner-only link; one refused says why (pictures/review.ts).
 */
export type PictureUpload =
  | { ok: true; mediaKey: string; url: string | null; width: number | null; height: number | null; review: PictureReviewState }
  | { ok: false; error: string; rejection?: PictureRejection };

interface Raw {
  status: number;
  body: string;
}

export interface UploadDeps {
  send: (url: string, uri: string, headers: Record<string, string>, onProgress: (sent: number, total: number) => void) => Promise<Raw>;
}

const nativeSend: UploadDeps['send'] = async (url, uri, headers, onProgress) => {
  const task = FileSystem.createUploadTask(
    url,
    uri,
    { httpMethod: 'POST', headers, uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT },
    (p) => onProgress(p.totalBytesSent, p.totalBytesExpectedToSend),
  );
  const res = await task.uploadAsync();
  if (!res) throw new Error('upload cancelled');
  return { status: res.status, body: res.body };
};

const webSend: UploadDeps['send'] = async (url, uri, headers, onProgress) => {
  const blob = await (await fetch(uri)).blob();
  return new Promise<Raw>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => onProgress(e.loaded, e.lengthComputable ? e.total : blob.size);
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(blob);
  });
};

const defaultUploadDeps: UploadDeps = { send: Platform.OS === 'web' ? webSend : nativeSend };

export async function uploadPicture(
  client: ApiClient,
  picture: { uri: string; contentType: string; ownWork: boolean },
  t: Translate,
  onProgress: (fraction: number) => void,
  deps: UploadDeps = defaultUploadDeps,
  /** The app's language, for the date a limit on the account ends. */
  locale?: string,
): Promise<PictureUpload> {
  const attempt = async (): Promise<Raw | null> => {
    const token = await client.getAccessToken();
    if (!token) return null;
    return deps.send(
      `${client.baseUrl}${pictureUploadPath(picture.ownWork)}`,
      picture.uri,
      { authorization: `Bearer ${token}`, 'content-type': normalizeContentType(picture.contentType) },
      (sent, total) => onProgress(total > 0 ? Math.min(1, sent / total) : 0),
    );
  };
  try {
    let res = await attempt();
    if (res?.status === 401) {
      // Any call through the client refreshes an expired token; then once more.
      await client.get('/me');
      res = await attempt();
    }
    if (!res) return { ok: false, error: t('upload.sessionExpired') };
    if (res.status >= 200 && res.status < 300) {
      try {
        const body = JSON.parse(res.body) as { imageMediaId?: string; url?: string | null; width?: number; height?: number; review?: unknown };
        if (body.imageMediaId) {
          return {
            ok: true,
            mediaKey: body.imageMediaId,
            url: body.url ?? null,
            width: body.width ?? null,
            height: body.height ?? null,
            review: reviewStateOf(body),
          };
        }
      } catch {
        // Not JSON: the generic failure below.
      }
      return { ok: false, error: t('picture.noIdReturned') };
    }
    const rejection = rejectionInBody(res.status, res.body);
    return { ok: false, error: describePictureFailure(res.status, res.body, t, locale), ...(rejection ? { rejection } : {}) };
  } catch {
    return { ok: false, error: t('error.offline') };
  }
}
