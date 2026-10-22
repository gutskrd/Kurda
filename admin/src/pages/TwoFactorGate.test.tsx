// @vitest-environment jsdom
/**
 * The 2FA steps before the workspace, against a fake API: a wrong code, a code
 * not yet whole, the pause after too many wrong codes (said with how long,
 * counted down, and over by itself), and a way out to sign in as someone else.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { getToken, setToken } from '../api';
import { AuthProvider } from '../auth';
import { failure, fakeApi, json, on, type Route } from '../test/fetch';
import { renderUi } from '../test/render';
import { TwoFactorGate } from './TwoFactorGate';

const session = (over: Record<string, unknown> = {}): Route =>
  on('GET', '/admin/session', json({ roles: ['admin'], staffRoles: [], capabilities: [], needsEnrollment: false, needsVerification: true, ...over }));
const me: Route = on('GET', '/me', json({ user: { id: 'me', username: 'rojda', roles: ['admin'] } }));

function show(...routes: Route[]): { api: ReturnType<typeof fakeApi>; signedOut: ReturnType<typeof vi.fn> } {
  setToken('tok');
  const api = fakeApi(me, session(), on('POST', '/admin/session/end', json({ ok: true })), ...routes);
  const signedOut = vi.fn();
  renderUi(
    <AuthProvider>
      <TwoFactorGate onSignOut={signedOut}>
        <p>The workspace</p>
      </TwoFactorGate>
    </AuthProvider>,
  );
  return { api, signedOut };
}

afterEach(() => {
  setToken(null);
  vi.unstubAllGlobals();
});

/** What the gate says (the toasts' live regions share the roles, and stay empty here). */
const said = (role: 'alert' | 'status'): Promise<HTMLElement> =>
  waitFor(() => {
    const el = screen.getAllByRole(role).find((e) => e.textContent?.trim());
    if (!el) throw new Error(`nothing said as ${role}`);
    return el;
  });
const saysNothing = (role: 'alert' | 'status'): boolean => screen.queryAllByRole(role).every((e) => !e.textContent?.trim());

describe('entering a code', () => {
  it('says a code is not whole yet instead of greying the button out, and sends nothing', async () => {
    const { api } = show();
    const box = await screen.findByLabelText('Six-digit code');
    await userEvent.type(box, '123');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await said('alert')).toHaveTextContent('Enter all six digits from your authenticator app.');
    expect(api.calls.some((c) => c.path === '/admin/auth/verify')).toBe(false);
    // gone as soon as the code is being put right
    await userEvent.type(box, '4');
    expect(saysNothing('alert')).toBe(true);
  });

  it('says a wrong code did not match, and empties the box for the next one', async () => {
    show(on('POST', '/admin/auth/verify', failure(401, 'INVALID_CODE', 'invalid or expired code')));
    const box = await screen.findByLabelText('Six-digit code');
    await userEvent.type(box, '123456{Enter}');
    expect(await said('alert')).toHaveTextContent('That code didn’t match.');
    expect(box).toHaveValue('');
    expect(box).toHaveAttribute('aria-invalid', 'true');
  });

  it('lets the workspace in once the code is right', async () => {
    let verified = false;
    show(
      on('GET', '/admin/session', () => json({ roles: ['admin'], staffRoles: [], capabilities: [], needsEnrollment: false, needsVerification: !verified })),
      on('POST', '/admin/auth/verify', () => {
        verified = true;
        return json({ ok: true });
      }),
    );
    await userEvent.type(await screen.findByLabelText('Six-digit code'), '123456{Enter}');
    expect(await screen.findByText('The workspace')).toBeInTheDocument();
  });
});

describe('after too many wrong codes', () => {
  it('says calmly that code entry is paused and for how long, and counts the wait down on the button', async () => {
    show(on('POST', '/admin/auth/verify', failure(429, 'TOTP_LOCKED', 'too many wrong codes — try again later', { retryAfterSec: 287 })));
    await userEvent.type(await screen.findByLabelText('Six-digit code'), '123456{Enter}');
    const alert = await said('alert');
    expect(alert).toHaveTextContent('Code entry is paused');
    expect(alert).toHaveTextContent('You can try again in 5 minutes.');
    // the server's own words, lower case and without a time, are not what is shown
    expect(alert).not.toHaveTextContent('try again later');
    const button = screen.getByRole('button', { name: /Try again in 4:4\d/ });
    expect(button).toBeDisabled();
  });

  it('comes back by itself when the pause is over', async () => {
    show(on('POST', '/admin/auth/verify', failure(429, 'TOTP_LOCKED', 'too many wrong codes — try again later', { retryAfterSec: 1 })));
    const box = await screen.findByLabelText('Six-digit code');
    await userEvent.type(box, '123456{Enter}');
    expect(await screen.findByRole('button', { name: /Try again in 0:0\d/ })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled(), { timeout: 3000 });
    expect(await said('status')).toHaveTextContent('You can enter a code again.');
    expect(box).toHaveFocus();
  });

  it('reads the wait from Retry-After when the rate limit answers instead', async () => {
    show(on('POST', '/admin/auth/verify', { status: 429, body: { code: 'RATE_LIMITED', message: 'too many requests' }, headers: { 'retry-after': '120' } }));
    await userEvent.type(await screen.findByLabelText('Six-digit code'), '123456{Enter}');
    const alert = await said('alert');
    expect(alert).toHaveTextContent('Too many tries');
    expect(alert).toHaveTextContent('Wait 2 minutes, then try again.');
    expect(screen.getByRole('button', { name: /Try again in [12]:\d\d/ })).toBeDisabled();
  });

  it('pauses setting up 2FA the same way', async () => {
    show(
      session({ needsEnrollment: true, needsVerification: false }),
      on('POST', '/admin/2fa/enroll', json({ secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/Hevalo:rojda?secret=JBSWY3DPEHPK3PXP' })),
      on('POST', '/admin/2fa/confirm', failure(429, 'TOTP_LOCKED', 'too many wrong codes — try again later', { retryAfterSec: 600 })),
    );
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Six-digit code'), '123456{Enter}');
    expect(await said('alert')).toHaveTextContent('You can try again in 10 minutes.');
    expect(screen.getByRole('button', { name: /Try again in (10:00|9:5\d)/ })).toBeDisabled();
  });
});

describe('a way out', () => {
  it('signs out from the code step, for the wrong account or a missing authenticator', async () => {
    const { api, signedOut } = show();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(signedOut).toHaveBeenCalledOnce();
    expect(getToken()).toBeNull();
    expect(api.calls.some((c) => c.method === 'POST' && c.path === '/admin/session/end')).toBe(true);
  });

  it('ends the session on the server when signing out, so it leaves the list of signed-in devices', async () => {
    const { api, signedOut } = show(on('POST', '/auth/logout', json({ ok: true })));
    // a sign-in that kept its refresh token, as every one does now
    setToken('tok', true, 'ref-7');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(signedOut).toHaveBeenCalledOnce();
    expect(getToken()).toBeNull();
    await waitFor(() => expect(api.calls.find((c) => c.path === '/auth/logout')?.body).toEqual({ refreshToken: 'ref-7' }));
  });

  it.each([
    [404, 'NOT_FOUND', 'route not found'],
    [403, 'FORBIDDEN', 'insufficient permissions'],
  ])('signs an account the console is not for straight back out (%i), saying nothing about why', async (status, code, message) => {
    const { signedOut } = show(on('GET', '/admin/session', failure(status, code, message)));
    await waitFor(() => expect(signedOut).toHaveBeenCalledOnce());
    expect(getToken()).toBeNull();
    expect(screen.queryByText(/admin access|not found|permissions/i)).not.toBeInTheDocument();
  });
});
