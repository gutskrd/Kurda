// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
const navigate = vi.fn();
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate, goBack: vi.fn() }),
  useFocusEffect: () => undefined,
}));
// the phone's picture library: one picture, chosen
vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///pic.jpg', mimeType: 'image/jpeg' }] }),
}));
// the upload streams the file itself, past the client; the test says what the server answers
const upload = vi.hoisted(() => ({ status: 200, body: '{}' }));
vi.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  uploadAsync: async () => ({ status: upload.status, body: upload.body }),
}));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { Alert } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { MemeFeedScreen } from './MemeFeedScreen';
import { uploadMemeImage } from './api';
import { uploadPostImage } from './imageUpload';
import { uploadProfilePhoto } from '../profile/photoUpload';
import { uploadVoiceNote } from '../library/voiceUpload';
import { formatUntil } from '../reports/sendErrors';
import { TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { interpolate } from '../i18n/format';

patchReactNativeWeb();

let alert: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  navigate.mockReset();
  alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const feed = { 'GET /images?category=meme&sort=newest&limit=20&offset=0': ok({ posts: [] }) };

describe('MemeFeedScreen posting', () => {
  it('opens the one composer, words first, ready to make a meme of whatever picture is added — no picker forced open first', async () => {
    testAuth.client = fakeClient(feed);
    renderWithProviders(<MemeFeedScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Post' }));
    expect(navigate).toHaveBeenCalledWith('Compose', { meme: true });
    expect(alert).not.toHaveBeenCalled();
  });
});

describe('the upload helpers', () => {
  const t = (key: TranslationKey, vars?: Record<string, string | number>): string => interpolate(TRANSLATIONS.de[key], vars);
  const until = '2030-03-21T13:57:00.000Z';

  it('say the end of a limit in the app’s language, not the phone’s', async () => {
    upload.status = 403;
    upload.body = JSON.stringify({ code: 'MUTED', message: 'muted', details: { scope: 'media', until } });
    const client = fakeClient();
    const photo = { uri: 'file:///pic.jpg', contentType: 'image/jpeg' };
    const expected = interpolate(TRANSLATIONS.de['restriction.mediaUntil'], { time: formatUntil(until, 'de') });
    for (const result of [
      await uploadMemeImage(client, photo, t, 'de'),
      await uploadPostImage(client, photo, t, 'de'),
      await uploadProfilePhoto(client, photo, t, 'de'),
      await uploadVoiceNote(client, { uri: 'file:///note.m4a' }, t, 'de'),
    ]) {
      expect(result).toMatchObject({ ok: false, error: expected, limited: true });
    }
  });
});
