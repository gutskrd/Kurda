import type { Translate } from '../api/errors';
import * as FileSystem from 'expo-file-system/legacy';
import type { ApiClient } from '../api/client';
import { describeUploadFailure, uploadWasLimited } from '../profile/photoUploadResult';

/** `limited`: refused by a limit on the account (see `UploadResult`). */
export type VoiceUploadResult = { ok: true; audioMediaId: string; url: string } | { ok: false; error: string; limited?: boolean };

/**
 * Upload a recorded voice note: POST the raw audio to /media/voice, which sniffs the type, enforces size limits,
 * stores it and returns a media id for a narration or voice comment. Binary bodies cannot go through
 * ApiClient.request(), which JSON-encodes, so the file is streamed with expo-file-system. The declared content
 * type routes the request to the server's audio parser; expo-audio HIGH_QUALITY records .m4a (audio/mp4).
 */
export async function uploadVoiceNote(
  client: ApiClient,
  audio: { uri: string; contentType?: string },
  t: Translate,
  /** The app's language, so a limit's end is said as the reader would say it. */
  locale?: string,
): Promise<VoiceUploadResult> {
  try {
    const token = await client.getAccessToken();
    if (!token) return { ok: false, error: t('upload.sessionExpired') };

    const res = await FileSystem.uploadAsync(`${client.baseUrl}/media/voice`, audio.uri, {
      httpMethod: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': audio.contentType ?? 'audio/mp4' },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });
    if (res.status >= 200 && res.status < 300) {
      try {
        const body = JSON.parse(res.body) as { audioMediaId?: string; url?: string };
        if (body.audioMediaId && body.url) return { ok: true, audioMediaId: body.audioMediaId, url: body.url };
      } catch {
        // fall through
      }
      return { ok: false, error: t('upload.noAudioReturned') };
    }
    return { ok: false, error: describeUploadFailure(res.status, res.body, t, locale), limited: uploadWasLimited(res.status, res.body) };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? t('upload.audioFailed') };
  }
}
