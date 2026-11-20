// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Linking } from 'react-native';
import { HELPLINE_URL, type PictureRejection } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { TRANSLATIONS } from '../i18n/translations';
import { HeldNote, PendingPhoto, PictureRefusal } from './PictureReview';

patchReactNativeWeb({ reduceMotion: true });

let open: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

const refused = (over: Partial<PictureRejection> = {}): PictureRejection => ({
  code: 'IMAGE_REJECTED',
  message: 'this image was rejected by moderation',
  reason: 'sexual',
  reviewId: 'rv1',
  ...over,
});

describe('a refused picture, said in place', () => {
  it('says why, and offers a person to look when the server allows it', () => {
    renderWithProviders(<PictureRefusal rejection={refused()} />);
    expect(screen.getByText('This picture looks like it shows nudity or sexual content, which isn’t allowed on Hevalo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ask a person to check' })).toBeTruthy();
    // Only a self-harm refusal points to a helpline.
    expect(screen.queryByRole('link', { name: 'Find a helpline' })).toBeNull();
  });

  it('adds the helpline to a self-harm refusal', () => {
    renderWithProviders(<PictureRefusal rejection={refused({ reason: 'self_harm' })} />);
    expect(screen.getByText(/you’re not alone\.$/)).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Find a helpline' }));
    expect(open).toHaveBeenCalledWith(HELPLINE_URL);
  });

  it('offers no person to ask when a person will look anyway', () => {
    renderWithProviders(<PictureRefusal rejection={refused({ reason: 'other', reviewId: null })} />);
    expect(screen.getByText('This picture can’t be shared on Hevalo.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ask a person to check' })).toBeNull();
  });

  it('sends the note to a person and promises an answer in place of the button', async () => {
    const client = fakeClient({ 'POST /me/picture-reviews/rv1': ok({ ok: true }) });
    testAuth.client = client;
    renderWithProviders(<PictureRefusal rejection={refused({ reason: 'violence' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask a person to check' }));
    fireEvent.change(await screen.findByLabelText('Anything we should know? (optional)'), { target: { value: 'It is a film poster.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Thanks. A person will look at it and let you know.')).toBeTruthy();
    expect(client.calls.find((c) => c.method === 'POST')).toEqual({ method: 'POST', path: '/me/picture-reviews/rv1', body: { note: 'It is a film poster.' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Ask a person to check' })).toBeNull());
  });

  it('says so when it was already asked about', async () => {
    testAuth.client = fakeClient({ 'POST /me/picture-reviews/rv1': fail({ status: 409, code: 'REVIEW_ALREADY_ASKED' }) });
    renderWithProviders(<PictureRefusal rejection={refused({ reason: 'hate' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask a person to check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    expect(await screen.findByText('You already asked. A person will let you know.')).toBeTruthy();
  });

  it('keeps the note in the sheet when asking fails, with the usual words', async () => {
    testAuth.client = fakeClient({ 'POST /me/picture-reviews/rv1': { ok: false, error: { kind: 'network', message: 'offline' } } });
    renderWithProviders(<PictureRefusal rejection={refused()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask a person to check' }));
    const note = await screen.findByLabelText('Anything we should know? (optional)');
    fireEvent.change(note, { target: { value: 'A statue.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(TRANSLATIONS.en['error.offline'])).toBeTruthy();
    expect((screen.getByLabelText('Anything we should know? (optional)') as HTMLTextAreaElement).value).toBe('A statue.');
  });

  it('speaks Soranî from the right', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    renderWithProviders(<PictureRefusal rejection={refused({ reason: 'other' })} />);
    expect(await screen.findByText(TRANSLATIONS.ckb['picture.refused.other'])).toBeTruthy();
    expect(screen.getByRole('button', { name: TRANSLATIONS.ckb['picture.ask.button'] })).toBeTruthy();
  });
});

describe('a picture waiting for a person', () => {
  it('marks a held post and says who can see it', () => {
    renderWithProviders(<HeldNote />);
    expect(screen.getByText('Being checked')).toBeTruthy();
    expect(screen.getByText('Only you can see this until it’s checked. It usually takes a few hours.')).toBeTruthy();
  });

  it('shows a new photo small beside who sees which', () => {
    renderWithProviders(<PendingPhoto pending={{ url: 'https://media.test/private/new.webp' }} body="picture.held.profile" />);
    expect(screen.getByText('Your new photo is being checked. Others see your old one until then.')).toBeTruthy();
    expect(screen.getAllByRole('img', { name: 'Being checked' }).length).toBeGreaterThan(0);
  });

  it('keeps the words when the photo’s private link has run out', async () => {
    // Every picture fails to load, as one whose link expired does.
    vi.stubGlobal(
      'Image',
      class {
        onerror: ((e: unknown) => void) | null = null;
        onload: ((e: unknown) => void) | null = null;
        set src(_uri: string) {
          setTimeout(() => this.onerror?.({ type: 'error' }));
        }
      },
    );
    renderWithProviders(<PendingPhoto pending={{ url: 'https://media.test/private/gone.webp' }} body="picture.held.group" />);
    await waitFor(() => expect(screen.queryAllByRole('img', { name: 'Being checked' })).toHaveLength(0));
    expect(screen.getByText('The new group photo is being checked. Members see the old one until then.')).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
