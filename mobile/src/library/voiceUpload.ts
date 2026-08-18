import * as FileSystem from 'expo-file-system/legacy';
import type { ApiClient } from '../api/client';
import { describeUploadFailure } from '../profile/photoUploadResult';

export type VoiceUploadResult = { ok: true; audioMediaId: string; url: string } | { ok: false; error: string };

/**
 * Upload a recorded voice note through the server (KUR-282): POST the raw audio
 * bytes to /media/voice; the server sniffs the real type, enforces the cost-safety
 * limits, stores it, and returns a media id to attach to a post narration or a
 * voice comment. Binary bodies can't go through ApiClient.request() (JSON-encodes),
 * so this streams the file with expo-file-system.
 *
 * The declared content-type routes the request to the server's audio body parser
 * (the server re-sniffs the bytes regardless). expo-audio HIGH_QUALITY records
 * .m4a → audio/mp4.
 */
export async function uploadVoiceNote(
  client: ApiClient,
  audio: { uri: string; contentType?: string },
): Promise<VoiceUploadResult> {
  try {
    const token = await client.getAccessToken();
    if (!token) return { ok: false, error: 'Your session expired. Please sign in again.' };

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
      return { ok: false, error: 'The upload finished but no audio was returned. Please try again.' };
    }
    return { ok: false, error: describeUploadFailure(res.status, res.body) };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'Could not upload the recording.' };
  }
}
