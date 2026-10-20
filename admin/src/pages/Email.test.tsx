// @vitest-environment jsdom
/**
 * The Email page against a fake API: what it says about sending, the test
 * send, and reading, answering and archiving support mail.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { setToken } from '../api';
import { failure, fakeApi, json, on, type Route } from '../test/fetch';
import { renderUi } from '../test/render';
import { Email, htmlFrameDoc, type EmailStatus, type SupportEmail, type SupportEmailSummary } from './Email';

const status = (over: Partial<EmailStatus> = {}): EmailStatus => ({
  provider: 'resend',
  from: 'Hevalo <no-reply@hevalo.app>',
  replyTo: 'support@hevalo.app',
  supportFrom: 'Hevalo Support <support@hevalo.app>',
  inbox: { webhook: true, canReadBodies: true, unread: 1 },
  failures: { count: 0, lastError: null, lastAt: null },
  ...over,
});

const summary = (over: Partial<SupportEmailSummary> = {}): SupportEmailSummary => ({
  id: '0b9a0d3e-0000-4000-8000-000000000001',
  from: { address: 'rojda@example.com', name: 'Rojda Kurd' },
  to: ['support@hevalo.app'],
  subject: 'I did not get my code',
  preview: 'I signed up but the code never came.',
  receivedAt: new Date(Date.now() - 600_000).toISOString(),
  readAt: null,
  archivedAt: null,
  replies: 0,
  attachments: 1,
  ...over,
});

const full = (over: Partial<SupportEmail> = {}): SupportEmail => ({
  ...summary({ readAt: new Date().toISOString() }),
  cc: [],
  text: 'Silav,\nI signed up but the code never came.',
  html: null,
  attachmentList: [{ id: 'att_1', filename: 'screenshot.png', contentType: 'image/png', size: null }],
  bodyAvailable: true,
  answers: [],
  ...over,
});

function show(...routes: Route[]): ReturnType<typeof fakeApi> {
  setToken('tok');
  const api = fakeApi(
    on('GET', '/admin/email/status', json(status())),
    on('GET', '/admin/support/emails', json({ emails: [summary()], unread: 1 })),
    on('GET', '/admin/support/emails?archived=true', json({ emails: [], unread: 1 })),
    on('POST', /\/admin\/support\/emails\/[^/]+\/open$/, json(full())),
    ...routes,
  );
  renderUi(<Email />);
  return api;
}

afterEach(() => {
  setToken(null);
  vi.unstubAllGlobals();
});

describe('sending', () => {
  it('says who sends, from and to where answers go, and that everything went out', async () => {
    show();
    expect(await screen.findByText('Hevalo <no-reply@hevalo.app>')).toBeInTheDocument();
    expect(screen.getByText('support@hevalo.app')).toBeInTheDocument();
    expect(screen.getByText('Resend')).toBeInTheDocument();
    expect(screen.getByText('Every email went out')).toBeInTheDocument();
  });

  it('says when sends failed this week, and what the provider said', async () => {
    show(
      on(
        'GET',
        '/admin/email/status',
        json(status({ failures: { count: 3, lastError: 'This API key is not authorized to send emails from hevalo.app', lastAt: new Date().toISOString() } })),
      ),
    );
    expect(await screen.findByText('3 emails could not be sent this week')).toBeInTheDocument();
    expect(screen.getByText(/not authorized to send emails from hevalo.app/)).toBeInTheDocument();
  });

  it('sends a test to yourself, and shows the provider’s refusal when there is one', async () => {
    const api = show(on('POST', '/admin/email/test', json({ sent: true, to: 'me@hevalo.app', messageId: 'm' })));
    await userEvent.click(await screen.findByRole('button', { name: 'Send a test email to me' }));
    expect(await screen.findByText(/Sent a test email to me@hevalo.app/)).toBeInTheDocument();
    expect(api.calls.some((c) => c.method === 'POST' && c.path === '/admin/email/test')).toBe(true);

    api.use(on('POST', '/admin/email/test', failure(502, 'EMAIL_NOT_SENT', 'Resend send failed (403): domain not verified')));
    await userEvent.click(screen.getByRole('button', { name: 'Send a test email to me' }));
    expect(await screen.findByText(/The provider said: Resend send failed \(403\)/)).toBeInTheDocument();
  });

  it('leaves the settings out for support, who may read only the inbox', async () => {
    show(on('GET', '/admin/email/status', failure(403, 'FORBIDDEN', 'insufficient permissions')));
    expect(await screen.findByText('I did not get my code')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send a test email to me' })).not.toBeInTheDocument();
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });
});

describe('the support inbox', () => {
  it('says how to connect it while no webhook is set up', async () => {
    show(on('GET', '/admin/email/status', json(status({ inbox: { webhook: false, canReadBodies: false, unread: 0 } }))));
    expect(await screen.findByText('The inbox is not connected yet')).toBeInTheDocument();
  });

  it('opens a mail, shows its text and files, and answers it', async () => {
    const api = show(on('POST', /\/reply$/, json({ id: 'r1', sentAt: new Date().toISOString() })));
    await userEvent.click(await screen.findByRole('button', { name: /I did not get my code/ }));
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText(/the code never came/)).toBeInTheDocument();
    expect(within(drawer).getByText('screenshot.png')).toBeInTheDocument();

    await userEvent.type(within(drawer).getByLabelText(/Answer Rojda Kurd/), 'Silav! Check your spam folder, then ask for a new code.');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Send answer' }));
    await waitFor(() => expect(api.calls.find((c) => c.path.endsWith('/reply'))?.body).toEqual({ body: 'Silav! Check your spam folder, then ask for a new code.' }));
    expect(await screen.findByText('Answer sent to rojda@example.com.')).toBeInTheDocument();
  });

  it('archives a mail', async () => {
    const api = show(on('POST', /\/archive$/, json({ ok: true })));
    await userEvent.click(await screen.findByRole('button', { name: /I did not get my code/ }));
    const drawer = await screen.findByRole('dialog');
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(api.calls.find((c) => c.path.endsWith('/archive'))?.body).toEqual({ value: true }));
  });

  it('says where to read a mail whose text could not be fetched', async () => {
    show(on('POST', /\/open$/, json(full({ bodyAvailable: false, text: null }))));
    await userEvent.click(await screen.findByRole('button', { name: /I did not get my code/ }));
    expect(await screen.findByText('The text of this email is in Resend')).toBeInTheDocument();
  });

  it('shows an HTML-only mail in a frame that can run nothing and load nothing', async () => {
    show(on('POST', /\/open$/, json(full({ text: null, html: '<p>Hello <img src="https://tracker.example/x.png"></p>' }))));
    await userEvent.click(await screen.findByRole('button', { name: /I did not get my code/ }));
    const frame = (await screen.findByTitle('The email')) as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('');
    const doc = htmlFrameDoc('<p>x</p>');
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain('img-src data:');
  });
});
