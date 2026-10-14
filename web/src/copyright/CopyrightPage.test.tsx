import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PROVIDER } from '@kurda/shared';
import { jsonResponse, renderApp } from '../test/utils';
import { CopyrightPage } from './CopyrightPage';

const POST_LINK = 'https://hevalo.app/app/library/0b7a1c2e-3d4f-4a5b-8c6d-7e8f9a0b1c2d';
const NOTICE_ID = '9f8e7d6c-5b4a-4321-8fed-cba987654321';

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function serve(
  opts: { signedIn?: boolean; minor?: boolean; notices?: unknown[]; noticeAnswer?: () => Response; counterAnswer?: () => Response } = {},
) {
  const calls: Call[] = [];
  if (opts.signedIn) localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (path === '/me') {
        return opts.signedIn
          ? jsonResponse(200, { user: { id: 'u1', username: 'rojda', email: 'rojda@example.com', minor: opts.minor === true } })
          : jsonResponse(401, {});
      }
      if (path === '/copyright/notices' && method === 'POST') {
        return opts.noticeAnswer ? opts.noticeAnswer() : jsonResponse(201, { reference: 'CN-1A2B3C4D', receivedAt: '2026-10-14T10:00:00Z' });
      }
      if (path === '/me/copyright/notices') return jsonResponse(200, { notices: opts.notices ?? [] });
      if (path.startsWith(`/me/copyright/notices/${NOTICE_ID}/counter`)) {
        return opts.counterAnswer
          ? opts.counterAnswer()
          : jsonResponse(201, { createdAt: '2026-10-14T10:00:00Z', restoreNotBefore: '2026-10-28T10:00:00Z' });
      }
      return jsonResponse(200, {});
    }),
  );
  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const show = () => renderApp(<CopyrightPage />, ['/copyright']);
const form = () => screen.getByRole('form', { name: 'Copyright notice' });

/** Fill in a complete notice, the way a rights holder would. */
async function fillIn(): Promise<void> {
  const f = form();
  await userEvent.type(within(f).getByLabelText('Your full name'), 'Rojda Amed');
  await userEvent.type(within(f).getByLabelText('Email'), 'rojda@example.com');
  await userEvent.type(within(f).getByLabelText('Postal address'), 'Kerkstraat 1, Amsterdam');
  await userEvent.click(within(f).getByRole('radio', { name: 'The rights holder — the work is mine' }));
  await userEvent.type(within(f).getByLabelText('Your work that was copied'), 'My photo of Mount Ararat at dawn');
  await userEvent.type(within(f).getByLabelText('Link to the post or profile on Hevalo'), POST_LINK);
  await userEvent.type(within(f).getByLabelText('Why it copies your work'), 'It is my photo, posted without asking.');
  await userEvent.click(within(f).getByRole('checkbox', { name: /in good faith that this use is not allowed/ }));
  await userEvent.click(within(f).getByRole('checkbox', { name: /under penalty of perjury, I am the rights holder/ }));
  await userEvent.type(within(f).getByLabelText('Signature'), 'Rojda Amed');
}

describe('the copyright notice form', () => {
  it('is there without an account', async () => {
    serve();
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Your work, respected.' })).toBeInTheDocument();
    expect(form()).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('says nothing about a field until it has been left, then clears the moment it is fixed', async () => {
    serve();
    show();
    const email = within(form()).getByLabelText('Email');
    await userEvent.type(email, 'not-an-email');
    expect(screen.queryByText('This doesn’t look like an email address.')).toBeNull();
    await userEvent.tab();
    expect(screen.getByText('This doesn’t look like an email address.')).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email.getAttribute('aria-describedby')).toContain('cn-email-error');

    await userEvent.clear(email);
    await userEvent.type(email, 'rojda@example.com');
    expect(screen.queryByText('This doesn’t look like an email address.')).toBeNull();
    expect(email).not.toHaveAttribute('aria-invalid');
  });

  it('sent empty, shows every problem and goes to the first, without sending anything', async () => {
    const calls = serve();
    show();
    await userEvent.click(within(form()).getByRole('button', { name: 'Send notice' }));

    expect(within(form()).getByLabelText('Your full name')).toHaveFocus();
    expect(within(form()).getAllByText('Fill this in.').length).toBeGreaterThan(4);
    expect(within(form()).getByText('Choose one.')).toBeInTheDocument();
    expect(within(form()).getAllByText('Tick this to send it.')).toHaveLength(2);
    expect(calls.some((c) => c.path === '/copyright/notices')).toBe(false);
  });

  it('asks for the rights holder’s name only from someone acting for them', async () => {
    serve();
    show();
    expect(within(form()).queryByLabelText('The rights holder’s name')).toBeNull();
    await userEvent.click(within(form()).getByRole('radio', { name: 'Allowed to act for the rights holder' }));
    expect(within(form()).getByLabelText('The rights holder’s name')).toBeInTheDocument();
  });

  it('only takes a link to something on Hevalo', async () => {
    serve();
    show();
    const link = within(form()).getByLabelText('Link to the post or profile on Hevalo');
    expect(link).toHaveAttribute('dir', 'ltr');
    await userEvent.type(link, 'https://example.com/some/page');
    await userEvent.tab();
    expect(screen.getByText('Paste a link to a post or a profile on Hevalo.')).toBeInTheDocument();
  });

  it('sends a complete notice and shows the reference', async () => {
    const calls = serve();
    show();
    await fillIn();
    await userEvent.click(within(form()).getByRole('button', { name: 'Send notice' }));

    const receipt = await screen.findByRole('status');
    expect(within(receipt).getByText('CN-1A2B3C4D')).toBeInTheDocument();
    expect(within(receipt).getByText(/A receipt is on its way to rojda@example.com/)).toBeInTheDocument();
    expect(receipt).toHaveFocus();

    const sent = calls.find((c) => c.path === '/copyright/notices');
    expect(sent?.method).toBe('POST');
    expect(sent?.body).toMatchObject({
      name: 'Rojda Amed',
      email: 'rojda@example.com',
      role: 'owner',
      rightsHolder: null,
      contentUrl: POST_LINK,
      goodFaith: true,
      accurate: true,
      signature: 'Rojda Amed',
      phone: null,
      workUrl: null,
      locale: 'en',
    });

    // and another one starts from an empty form
    await userEvent.click(screen.getByRole('button', { name: 'Send another notice' }));
    expect(within(form()).getByLabelText('Your full name')).toHaveValue('');
  });

  it('says so when too many notices came from one place', async () => {
    serve({ noticeAnswer: () => jsonResponse(429, { code: 'RATE_LIMITED', message: 'slow down' }) });
    show();
    await fillIn();
    await userEvent.click(within(form()).getByRole('button', { name: 'Send notice' }));
    expect(await within(form()).findByRole('alert')).toBeInTheDocument();
    // what they typed is still there to send later
    expect(within(form()).getByLabelText('Your full name')).toHaveValue('Rojda Amed');
  });
});

describe('the provider details', () => {
  it('shows the DMCA agent and the contact points, with an unfilled detail marked as such', () => {
    serve();
    show();
    const agent = screen.getByRole('heading', { name: 'DMCA designated agent' }).closest('section')!;
    const name = within(agent).getByText(PROVIDER.dmcaAgent.name);
    // while the owner has not filled it in, it shows as a placeholder rather than vanishing
    if (PROVIDER.dmcaAgent.name.startsWith('[')) expect(name).toHaveAttribute('data-placeholder', 'true');
    const contact = screen.getByRole('heading', { name: 'Other questions' }).closest('section')!;
    expect(within(contact).getByText('For authorities')).toBeInTheDocument();
    expect(within(contact).getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
  });
});

describe('counter-notices', () => {
  const notice = (over: Record<string, unknown> = {}) => ({
    id: NOTICE_ID,
    reference: 'CN-9F8E7D6C',
    claimant: 'Studio Zagros',
    work: 'A drawing of a deer',
    target: { type: 'library_post', id: '0b7a1c2e-3d4f-4a5b-8c6d-7e8f9a0b1c2d' },
    decidedAt: '2026-10-10T10:00:00Z',
    status: 'actioned',
    counterNotice: null,
    canCounter: true,
    counterDeadline: '2027-04-10T10:00:00Z',
    ...over,
  });

  it('tells somebody signed in that nothing of theirs was removed', async () => {
    serve({ signedIn: true });
    show();
    expect(await screen.findByText('No copyright notice has led to a removal of anything you posted.')).toBeInTheDocument();
  });

  it('lists a removal and sends a counter-notice, saying first who will see it', async () => {
    const calls = serve({ signedIn: true, notices: [notice()] });
    show();
    expect(await screen.findByText('Studio Zagros')).toBeInTheDocument();
    expect(screen.getByText('Removed')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Send a counter-notice' }));
    const f = screen.getByRole('form', { name: 'Counter-notice for CN-9F8E7D6C' });
    expect(within(f).getByText(/go to the person who sent the notice, as the law asks/)).toBeInTheDocument();
    // the email starts as the account's own
    expect(within(f).getByLabelText('Email')).toHaveValue('rojda@example.com');

    await userEvent.type(within(f).getByLabelText('Your full name'), 'Rojda Amed');
    await userEvent.type(within(f).getByLabelText('Postal address'), 'Kerkstraat 1, Amsterdam');
    await userEvent.type(within(f).getByLabelText('Why it was a mistake'), 'I drew it myself in 2024.');
    await userEvent.click(within(f).getByRole('checkbox', { name: /removed by mistake/ }));
    await userEvent.click(within(f).getByRole('checkbox', { name: /I consent to the jurisdiction/ }));
    await userEvent.type(within(f).getByLabelText('Signature'), 'Rojda Amed');
    await userEvent.click(within(f).getByRole('button', { name: 'Send counter-notice' }));

    expect(await screen.findByText('Your counter-notice is sent.')).toBeInTheDocument();
    const sent = calls.find((c) => c.path === `/me/copyright/notices/${NOTICE_ID}/counter`);
    expect(sent?.body).toMatchObject({ name: 'Rojda Amed', goodFaith: true, consent: true, phone: null, email: 'rojda@example.com' });
  });

  it('does not send a counter-notice without both statements', async () => {
    const calls = serve({ signedIn: true, notices: [notice()] });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Send a counter-notice' }));
    const f = screen.getByRole('form', { name: 'Counter-notice for CN-9F8E7D6C' });
    await userEvent.click(within(f).getByRole('button', { name: 'Send counter-notice' }));
    expect(within(f).getAllByText('Tick this to send it.')).toHaveLength(2);
    expect(calls.some((c) => c.path.endsWith('/counter'))).toBe(false);
  });

  it('says why a counter-notice was refused', async () => {
    serve({
      signedIn: true,
      notices: [notice()],
      counterAnswer: () => jsonResponse(409, { code: 'COUNTER_WINDOW_CLOSED', message: 'closed' }),
    });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Send a counter-notice' }));
    const f = screen.getByRole('form', { name: 'Counter-notice for CN-9F8E7D6C' });
    await userEvent.type(within(f).getByLabelText('Your full name'), 'Rojda Amed');
    await userEvent.type(within(f).getByLabelText('Postal address'), 'Kerkstraat 1');
    await userEvent.type(within(f).getByLabelText('Why it was a mistake'), 'Mine.');
    await userEvent.click(within(f).getByRole('checkbox', { name: /removed by mistake/ }));
    await userEvent.click(within(f).getByRole('checkbox', { name: /I consent to the jurisdiction/ }));
    await userEvent.type(within(f).getByLabelText('Signature'), 'Rojda Amed');
    await userEvent.click(within(f).getByRole('button', { name: 'Send counter-notice' }));
    expect(await within(f).findByRole('alert')).toHaveTextContent('The time to send a counter-notice for this one has passed.');
  });

  it('tells a minor that a parent or guardian sends it by email, and offers no form', async () => {
    const calls = serve({ signedIn: true, minor: true, notices: [notice()] });
    show();
    expect(await screen.findByText(/On an account under 18, a parent or guardian sends it for you/)).toBeInTheDocument();
    expect(screen.getByText(/A parent or guardian can send a counter-notice for this one, quoting CN-9F8E7D6C/)).toBeInTheDocument();
    expect(screen.getAllByText(PROVIDER.copyrightEmail).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Send a counter-notice' })).toBeNull();
    expect(calls.some((c) => c.path.endsWith('/counter'))).toBe(false);
  });

  it('switches to the guardian route when the server says the account may not send one', async () => {
    serve({
      signedIn: true,
      notices: [notice()],
      counterAnswer: () => jsonResponse(403, { code: 'COUNTER_NOTICE_ADULT_REQUIRED', message: 'adult required' }),
    });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Send a counter-notice' }));
    const f = screen.getByRole('form', { name: 'Counter-notice for CN-9F8E7D6C' });
    await userEvent.type(within(f).getByLabelText('Your full name'), 'Rojda Amed');
    await userEvent.type(within(f).getByLabelText('Postal address'), 'Kerkstraat 1');
    await userEvent.type(within(f).getByLabelText('Why it was a mistake'), 'Mine.');
    await userEvent.click(within(f).getByRole('checkbox', { name: /removed by mistake/ }));
    await userEvent.click(within(f).getByRole('checkbox', { name: /I consent to the jurisdiction/ }));
    await userEvent.type(within(f).getByLabelText('Signature'), 'Rojda Amed');
    await userEvent.click(within(f).getByRole('button', { name: 'Send counter-notice' }));
    const why = await screen.findByText(/On an account under 18, a parent or guardian sends it for you/);
    expect(why).toHaveFocus();
    expect(screen.queryByRole('form', { name: 'Counter-notice for CN-9F8E7D6C' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send a counter-notice' })).toBeNull();
  });

  it('shows a counter-notice already sent, and a closed window, without a button', async () => {
    serve({
      signedIn: true,
      notices: [
        notice({ status: 'countered', counterNotice: { createdAt: '2026-10-12T10:00:00Z' }, canCounter: false }),
        notice({ id: 'aaaaaaaa-5b4a-4321-8fed-cba987654321', reference: 'CN-AAAAAAAA', canCounter: false }),
      ],
    });
    show();
    await waitFor(() => expect(screen.getByText(/You sent a counter-notice on/)).toBeInTheDocument());
    expect(screen.getByText('The time to send a counter-notice has passed.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send a counter-notice' })).toBeNull();
  });
});
