import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { pictureUploadPath } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { Translate } from '../api/errors';
import { normalizeContentType } from '../profile/photoUploadResult';
import { describePictureFailure } from './errors';

/**
 * Upload one picture for a post, reporting how far it has got.
 *
 * Pictures go up as soon as they are attached, X-style, so by the time the
 * words are written they are there and Post is instant. That is safe now:
 * the server keeps an upload unconfirmed until a post uses it and clears the
 * unused ones away after a day (contract §P), so a picture attached and then
 * removed costs nothing for long.
 *
 * "I made this" decides the address (`pictureUploadPath`): on, the picture
 * gets the small Hevalo signature with the poster's handle; off, it goes up
 * without one, since a signature would claim somebody else's picture.
 *
 * The bytes go straight from the file — `ApiClient.request()` JSON-encodes its
 * body — with expo-file-system's upload task on a phone, which reports
 * progress, and XMLHttpRequest in the web build, which does too. A token that
 * expired since the screen opened is refreshed once (any API call does that)
 * and the upload tried again.
 */
export type PictureUpload =
  | { ok: true; mediaKey: string; url: string | null; width: number | null; height: number | null }
  | { ok: false; error: string };

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

export const defaultUploadDeps: UploadDeps = { send: Platform.OS === 'web' ? webSend : nativeSend };

export async function uploadPicture(
  client: ApiClient,
  picture: { uri: string; contentType: string; ownWork: boolean },
  t: Translate,
  onProgress: (fraction: number) => void,
  deps: UploadDeps = defaultUploadDeps,
  /** the app's language, for the date a limit on the account ends */
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
      // any call through the client refreshes an expired token; then once more
      await client.get('/me');
      res = await attempt();
    }
    if (!res) return { ok: false, error: t('upload.sessionExpired') };
    if (res.status >= 200 && res.status < 300) {
      try {
        const body = JSON.parse(res.body) as { imageMediaId?: string; url?: string | null; width?: number; height?: number };
        if (body.imageMediaId) {
          return { ok: true, mediaKey: body.imageMediaId, url: body.url ?? null, width: body.width ?? null, height: body.height ?? null };
        }
      } catch {
        // not JSON: the generic failure below
      }
      return { ok: false, error: t('picture.noIdReturned') };
    }
    return { ok: false, error: describePictureFailure(res.status, res.body, t, locale) };
  } catch {
    return { ok: false, error: t('error.offline') };
  }
}
