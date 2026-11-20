import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import type { PictureReviewNotificationData, PictureReviewTarget } from '@kurda/shared';
import { englishOnly as t, translator } from '../i18n/I18nProvider';
import { ku } from '../i18n/ku';
import { socialNotification } from '../reports/notifications';
import { noteKind } from '../notifications/rows';
import { NotificationsBell } from '../notifications/NotificationsBell';
import { RailProvider } from '../social/RailProvider';
import { jsonResponse, renderApp } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const POST = '11111111-2222-4333-8444-555555555555';
const PICTURE = '22222222-3333-4444-8555-666666666666';
const GROUP = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const THREAD = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

const note = (data: PictureReviewNotificationData | Record<string, unknown>) => ({
  title: 'Your picture was approved',
  body: 'English body',
  data: data as Record<string, unknown>,
});
const approved = (
  surface: PictureReviewNotificationData['surface'],
  target: PictureReviewTarget | null,
  asked = false,
): PictureReviewNotificationData => ({ kind: 'picture_review', outcome: 'approved', surface, asked, target });
const upheld = (surface: PictureReviewNotificationData['surface'], target: PictureReviewTarget | null = null): PictureReviewNotificationData => ({
  kind: 'picture_review',
  outcome: 'upheld',
  surface,
  asked: true,
  target,
});

describe('a checked picture’s notification', () => {
  const fine = 'Your picture was checked and it’s fine.';

  it('says where an approved picture now shows, and opens it there', () => {
    expect(socialNotification(note(approved('post', { type: 'library_post', id: POST })), t)).toEqual({
      title: fine,
      body: 'Your post is now visible.',
      to: `/app/library/${POST}`,
    });
    expect(socialNotification(note(approved('post', { type: 'image_post', id: PICTURE })), t)).toEqual({
      title: fine,
      body: 'Your post is now visible.',
      to: `/app/dimen/${PICTURE}`,
    });
    expect(socialNotification(note(approved('group_photo', { type: 'group', id: GROUP })), t)).toEqual({
      title: fine,
      body: 'The new group photo is now showing.',
      to: `/app/messages?group=${GROUP}`,
    });
    expect(socialNotification(note(approved('letter', { type: 'letter_thread', id: THREAD })), t)).toEqual({
      title: fine,
      body: 'Your letter is on its way.',
      to: `/app/letters/${THREAD}`,
    });
  });

  it('opens your own profile for a profile photo, which has nothing else to open', () => {
    expect(socialNotification(note(approved('profile_photo', null)), t)).toEqual({
      title: fine,
      body: 'Your new photo is now on your profile.',
      to: '/app/profile',
    });
  });

  it('says a refusal that was asked about can be shared now, whatever it was for, and opens nothing since nothing was put up', () => {
    for (const surface of ['post', 'profile_photo', 'group_photo', 'letter'] as const) {
      expect(socialNotification(note(approved(surface, null, true)), t)).toEqual({ title: fine, body: 'You can share it now.' });
    }
    // A push carries its data as strings.
    expect(socialNotification(note({ ...approved('profile_photo', null), asked: 'true' }), t)?.body).toBe('You can share it now.');
  });

  it('says plainly when a person kept the refusal, with nothing to open', () => {
    expect(socialNotification(note(upheld('post')), t)).toEqual({ title: 'A person checked your picture. It can’t be shared on Hevalo.', body: null });
    expect(socialNotification(note(upheld('profile_photo')), t)?.to).toBeUndefined();
  });

  it('speaks the reader’s language, not the server’s English', () => {
    const view = socialNotification(note(approved('post', { type: 'library_post', id: POST })), translator(ku));
    expect(view?.title).toBe(translator(ku)('pictureCheck.notify.approved'));
    expect(view?.body).toBe(translator(ku)('pictureCheck.notify.approvedPost'));
    expect(view?.title).not.toBe('Your picture was approved');
  });

  it('never follows a target that is not an id, or not a kind of place it knows', () => {
    expect(socialNotification(note(approved('group_photo', { type: 'group', id: '../../admin' })), t)?.to).toBeUndefined();
    expect(socialNotification(note(approved('post', { type: 'admin_page', id: POST } as unknown as PictureReviewTarget)), t)?.to).toBeUndefined();
    // An old notice whose target was a bare id is said, but not followed.
    expect(socialNotification(note({ ...approved('post', null), target: POST }), t)).toEqual({ title: fine, body: 'Your post is now visible.' });
  });

  it('wears the picture glyph, while a removal still comes as a decision that opens Account standing', () => {
    expect(noteKind({ category: 'safety', data: { kind: 'picture_review' } })).toBe('picture');
    const removal = socialNotification(note({ kind: 'sanction', sanctionId: 's1', sanction: 'content_removal', policy: 'sexual', until: null }), t);
    expect(removal).toMatchObject({ title: 'A decision about your account', to: '/app/settings/standing' });
  });
});

/** Where the app is, to see where a tapped notification went. */
function Where(): React.JSX.Element {
  return <output data-testid="where">{useLocation().pathname + useLocation().search}</output>;
}

function serve(notifications: Record<string, unknown>[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/me/social')) {
        return jsonResponse(200, {
          you: null,
          friends: [],
          requests: [],
          challenges: [],
          groups: [],
          notifications,
          unread: { notifications: notifications.length, groups: 0, requests: 0, challenges: 0 },
        });
      }
      if (url.endsWith('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', emailVerified: true } });
      return jsonResponse(200, {});
    }),
  );
}

describe('the bell', () => {
  const at = new Date().toISOString();

  it('opens the post an approved picture belongs to', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));
    serve([{ id: 'n1', category: 'safety', title: 'English', body: null, createdAt: at, readAt: null, data: approved('post', { type: 'library_post', id: POST }) }]);
    renderApp(
      <RailProvider>
        <NotificationsBell />
        <Where />
      </RailProvider>,
      ['/app'],
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 new' }));
    expect(screen.getByText('Your post is now visible.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Your picture was checked and it’s fine.' }));
    expect(screen.getByTestId('where')).toHaveTextContent(`/app/library/${POST}`);
  });

  it('says an upheld refusal without a link to follow', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));
    serve([
      { id: 'n2', category: 'safety', title: 'English', body: null, createdAt: at, readAt: null, data: upheld('profile_photo') },
    ]);
    renderApp(
      <RailProvider>
        <NotificationsBell />
      </RailProvider>,
      ['/app'],
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 new' }));
    expect(screen.getByText('A person checked your picture. It can’t be shared on Hevalo.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /A person checked your picture/ })).not.toBeInTheDocument();
  });
});
