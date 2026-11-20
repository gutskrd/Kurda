import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HELPLINE_URL, PICTURE_REVIEW_NOTE_MAX, type PictureRejectReason, type PictureRejection } from '@kurda/shared';
import { ApiClient, describeError } from '../lib/api';
import { englishOnly as t, translator } from '../i18n/I18nProvider';
import { ckb } from '../i18n/ckb';
import { jsonResponse, renderApp } from '../test/utils';
import { PendingPhoto, PictureRefusal } from './PictureCheck';

interface Call {
  method: string;
  path: string;
  body: unknown;
}

let calls: Call[] = [];
let answer: () => Response = () => jsonResponse(202, { ok: true });

beforeEach(() => {
  calls = [];
  answer = () => jsonResponse(202, { ok: true });
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'rojhat' } });
      // Only asking a person counts here; the app's presence heartbeat is not this sheet's.
      if (!path.startsWith('/me/picture-reviews/')) return jsonResponse(200, {});
      calls.push({ method: init?.method ?? 'GET', path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return answer();
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const refused = (reason: PictureRejectReason, reviewId: string | null = 'rv-1'): PictureRejection => ({
  code: 'IMAGE_REJECTED',
  message: 'image rejected by moderation',
  reason,
  reviewId,
});

const WHY: Record<PictureRejectReason, string> = {
  sexual: 'This picture looks like it shows nudity or sexual content, which isn’t allowed on Hevalo.',
  violence: 'This picture looks violent or gory, which isn’t allowed on Hevalo.',
  self_harm: 'This picture looks like it shows self-harm, so we can’t share it. If you’re going through something hard, you’re not alone.',
  hate: 'This picture looks like it shows hateful symbols or words, which aren’t allowed on Hevalo.',
  other: 'This picture can’t be shared on Hevalo.',
};

describe('a refused picture', () => {
  it.each(Object.keys(WHY) as PictureRejectReason[])('says why in the owner’s words when the reason is %s', (reason) => {
    renderApp(<PictureRefusal rejection={refused(reason)} />);
    expect(screen.getByRole('alert')).toHaveTextContent(WHY[reason]);
    // Never the server's English.
    expect(screen.queryByText(/rejected by moderation/)).not.toBeInTheDocument();
  });

  it('offers a helpline after self-harm, and only then', () => {
    const { unmount } = renderApp(<PictureRefusal rejection={refused('self_harm')} />);
    expect(screen.getByRole('link', { name: 'Find a helpline (findahelpline.com)' })).toHaveAttribute('href', HELPLINE_URL);
    unmount();
    renderApp(<PictureRefusal rejection={refused('violence')} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('offers no person to ask when the refusal has no review to ask about', () => {
    renderApp(<PictureRefusal rejection={refused('other', null)} />);
    expect(screen.getByRole('alert')).toHaveTextContent(WHY.other);
    expect(screen.queryByRole('button', { name: 'Ask a person to check' })).not.toBeInTheDocument();
  });

  it('asks a person to look, with the owner’s note, and thanks them', async () => {
    renderApp(<PictureRefusal rejection={refused('sexual')} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ask a person to check' }));
    const sheet = await screen.findByRole('dialog', { name: 'Ask a person to check' });
    const note = screen.getByLabelText('Anything we should know? (optional)');
    expect(note).toHaveAttribute('maxLength', String(PICTURE_REVIEW_NOTE_MAX));
    await userEvent.type(note, '  It is a painting from a museum.  ');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Thanks. A person will look at it and let you know.')).toHaveFocus();
    expect(calls).toEqual([{ method: 'POST', path: '/me/picture-reviews/rv-1', body: { note: 'It is a painting from a museum.' } }]);
    expect(sheet).not.toBeInTheDocument();
    // Asked once, the button is gone.
    expect(screen.queryByRole('button', { name: 'Ask a person to check' })).not.toBeInTheDocument();
  });

  it('sends no note at all when none was written', async () => {
    renderApp(<PictureRefusal rejection={refused('hate')} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ask a person to check' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Send' }));
    await screen.findByText('Thanks. A person will look at it and let you know.');
    expect(calls[0]!.body).toEqual({});
  });

  it('says kindly that it was asked already', async () => {
    answer = () => jsonResponse(409, { code: 'REVIEW_ALREADY_ASKED', message: 'review already asked' });
    renderApp(<PictureRefusal rejection={refused('violence')} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ask a person to check' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Send' }));
    expect(await screen.findByText('You already asked. A person will let you know.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the sheet open with the usual words when asking fails', async () => {
    answer = () => jsonResponse(500, { code: 'INTERNAL', message: 'boom' });
    renderApp(<PictureRefusal rejection={refused('sexual')} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ask a person to check' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Something went wrong on our end. Please try again shortly.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Ask a person to check' })).toBeInTheDocument();
  });

  it('never shows the server’s English for a review it cannot find', async () => {
    answer = () => jsonResponse(404, { code: 'NOT_FOUND', message: 'not found' });
    renderApp(<PictureRefusal rejection={refused('sexual')} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ask a person to check' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText('not found')).not.toBeInTheDocument();
  });
});

describe('reading a refusal off the wire', () => {
  it('keeps the reason and the review a 422 carries beside its code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(422, { code: 'PHOTO_REJECTED', message: 'photo rejected', reason: 'hate', reviewId: 'rv-9' })),
    );
    const client = new ApiClient('https://api.test', { get: () => null, set: () => undefined, clear: () => undefined }, () => undefined);
    const res = await client.post('/groups/g1/photo', {});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.rejection).toEqual({ code: 'PHOTO_REJECTED', message: 'photo rejected', reason: 'hate', reviewId: 'rv-9' });
    expect(describeError(res.error, t)).toBe(WHY.hate);
  });

  it('says a profile or group photo’s refusal in the reader’s words even without a reason', () => {
    const bare = { kind: 'client' as const, status: 422, code: 'PHOTO_REJECTED', message: 'profile photo rejected' };
    expect(describeError(bare, t)).toBe(WHY.other);
    expect(describeError(bare, translator(ckb))).toBe(translator(ckb)('pictureCheck.refused.other'));
    expect(describeError(bare, translator(ckb))).not.toMatch(/rejected/);
  });
});

describe('a new photo waiting to be checked', () => {
  it('shows small with the words, and a plain tile once its private link has expired', () => {
    renderApp(<PendingPhoto pending={{ url: 'https://private.test/p.webp?sig=1' }} words="pictureCheck.held.profile" round />);
    expect(screen.getByText('Your new photo is being checked. Others see your old one until then.')).toBeInTheDocument();
    expect(screen.getByText('Being checked')).toBeInTheDocument();
    const img = document.querySelector('.pcheck-pending img')!;
    expect(img).toHaveAttribute('src', 'https://private.test/p.webp?sig=1');
    fireEvent.error(img);
    expect(document.querySelector('.pcheck-pending img')).toBeNull();
    expect(document.querySelector('.pcheck-pending-pic svg')).not.toBeNull();
  });
});
