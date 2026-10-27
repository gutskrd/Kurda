// @vitest-environment jsdom
/**
 * Signing in to the console step by step, against a fake API: the email,
 * then the password under it, then the two-step code (or setting it up),
 * then the console. What is missing is said on leaving a field or moving on,
 * the server's refusals in plain words, the pauses after too many tries with
 * how long, a way out to sign in as someone else, and the console's code
 * fetched in the background while the steps are being filled in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { getRefreshToken, getToken, setToken } from '../api';
import { AuthProvider } from '../auth';
import { failure, fakeApi, json, on, type Route } from '../test/fetch';
import { renderUi } from '../test/render';
import { SignIn } from './SignIn';

const session = (over: Record<string, unknown> = {}): Route =>
  on('GET', '/admin/session', json({ roles: ['admin'], staffRoles: [], capabilities: [], needsEnrollment: false, needsVerification: true, ...over }));
const me: Route = on('GET', '/me', json({ user: { id: 'me', username: 'rojda', roles: ['admin'] } }));
const tokens: Route = on('POST', '/admin/auth/login', json({ tokens: { accessToken: 'tok-9', refreshToken: 'ref-9' } }));

/** The sign-in, signed out or (`signedIn`) with a session kept from before; the console is a stand-in. */
function show(signedIn: boolean, ...routes: Route[]): { api: ReturnType<typeof fakeApi>; warm: ReturnType<typeof vi.fn> } {
  setToken(signedIn ? 'tok' : null);
  const api = fakeApi(me, session(), on('POST', '/admin/session/end', json({ ok: true })), ...routes);
  const warm = vi.fn(() => Promise.resolve());
  renderUi(
    <AuthProvider>
      <SignIn warm={warm}>
        {(signOut) => (
          <button type="button" onClick={signOut}>
            The console
          </button>
        )}
      </SignIn>
    </AuthProvider>,
  );
  return { api, warm };
}

afterEach(() => {
  setToken(null);
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

/** What a step says (the toasts' live regions share the roles, and stay empty here). */
const said = (role: 'alert' | 'status'): Promise<HTMLElement> =>
  waitFor(() => {
    const el = screen.getAllByRole(role).find((e) => e.textContent?.trim());
    if (!el) throw new Error(`nothing said as ${role}`);
    return el;
  });
const saysNothing = (role: 'alert' | 'status'): boolean => screen.queryAllByRole(role).every((e) => !e.textContent?.trim());
/** The step the rail marks as the one on show. */
const onRail = (): string | null | undefined => within(screen.getByRole('list', { name: 'Signing in' })).getAllByRole('listitem').find((li) => li.getAttribute('aria-current') === 'step')?.textContent;

async function toPassword(email = 'rojda@hevalo.app'): Promise<HTMLElement> {
  await userEvent.type(screen.getByLabelText('Email'), `${email}{Enter}`);
  return screen.findByLabelText('Password');
}

describe('the email, first', () => {
  it('labels its field where it can be seen, and turns to the password only with a whole email', async () => {
    const { api } = show(false);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email').id).toBe(screen.getByText('Email', { selector: 'label' }).getAttribute('for'));
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(onRail()).toBe('Email');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter the email address of your admin account.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    await userEvent.type(screen.getByLabelText('Email'), 'rojda@hevalo.app');
    expect(screen.queryByText('Enter the email address of your admin account.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Enter your password' })).toBeInTheDocument();
    expect(onRail()).toBe('Password');
    // nothing about the account was asked of the server: whether it exists is never said
    expect(api.calls.some((c) => c.path.startsWith('/admin/auth') || c.path.startsWith('/auth'))).toBe(false);
  });

  it('checks the email when the field is left, not while it is still being typed', async () => {
    show(false);
    await userEvent.type(screen.getByLabelText('Email'), 'rojda@');
    expect(screen.queryByText(/whole email address/)).not.toBeInTheDocument();
    await userEvent.tab();
    expect(screen.getByText('Enter the whole email address, like name@hevalo.app.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(screen.getByLabelText('Email'), 'hevalo.app');
    expect(screen.queryByText(/whole email address/)).not.toBeInTheDocument();
  });
});

describe('the password, under its email', () => {
  it('shows the email it goes with, which a tap takes back to change, as it was typed', async () => {
    show(false);
    await toPassword();
    await userEvent.click(screen.getByRole('button', { name: 'Change the email, rojda@hevalo.app' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByLabelText('Email').at(-1)).toHaveValue('rojda@hevalo.app'));
  });

  it('files the password under the email, for a password manager', async () => {
    show(false);
    await toPassword();
    const kept = document.querySelector<HTMLInputElement>('input[autocomplete="username"][name="username"]');
    expect(kept).toHaveValue('rojda@hevalo.app');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('says a missing password and sends nothing', async () => {
    const { api } = show(false);
    await toPassword();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === '/admin/auth/login')).toBe(false);
    await userEvent.type(screen.getByLabelText('Password'), 'p');
    expect(screen.queryByText('Enter your password.')).not.toBeInTheDocument();
  });

  it('says a wrong password plainly, as an alert', async () => {
    show(false, on('POST', '/admin/auth/login', failure(401, 'INVALID_CREDENTIALS', 'invalid email or password')));
    await userEvent.type(await toPassword(), 'wrong{Enter}');
    expect(await said('alert')).toHaveTextContent('That email and password don’t match. Check both and try again.');
    expect(screen.getByRole('heading', { name: 'Enter your password' })).toBeInTheDocument();
  });

  it('signs in with the email as typed less its spaces, and turns on to the code', async () => {
    const { api } = show(false, tokens);
    await userEvent.type(await toPassword(' rojda@hevalo.app '), 'right{Enter}');
    expect(await screen.findByRole('heading', { name: 'Enter your 2FA code' })).toBeInTheDocument();
    expect(onRail()).toBe('Two-step');
    const login = api.calls.find((c) => c.path === '/admin/auth/login')!;
    // named for the admin's own list of signed-in devices, and remembered unless told otherwise
    expect(login.body).toEqual({ email: 'rojda@hevalo.app', password: 'right', deviceName: expect.stringMatching(/^Admin console/), remember: true });
    expect(login.headers['x-device-id']).toMatch(/^[0-9a-f-]{36}$/);
    // the session is kept to be renewed, not signed in to again in fifteen minutes
    expect(getToken()).toBe('tok-9');
    expect(getRefreshToken()).toBe('ref-9');
  });

  it('keeps a sign-in that is not to be remembered for this tab only, and says so to the server', async () => {
    const { api } = show(false, tokens);
    await userEvent.type(await toPassword(), 'right');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Enter your 2FA code' });
    expect((api.calls.find((c) => c.path === '/admin/auth/login')!.body as { remember: boolean }).remember).toBe(false);
    expect(sessionStorage.getItem('kurda_admin_refresh')).toBe('ref-9');
    expect(localStorage.getItem('kurda_admin_refresh')).toBeNull();
  });

  it('says how long signing in is paused after too many tries, and counts it down on the button', async () => {
    show(false, on('POST', '/admin/auth/login', failure(429, 'LOCKED', 'too many failed attempts — try again later', { retryAfterSec: 900 })));
    await userEvent.type(await toPassword(), 'wrong{Enter}');
    const alert = await said('alert');
    expect(alert).toHaveTextContent('signing in is paused for a while to keep the account safe. You can try again in 15 minutes.');
    expect(alert).not.toHaveTextContent('try again later');
    expect(screen.getByRole('button', { name: /Try again in (15:00|14:5\d)/ })).toBeDisabled();
  });

  it('shows the password behind one toggle whose name stays the same', async () => {
    show(false);
    await toPassword();
    const eye = screen.getByRole('button', { name: 'Show password' });
    expect(eye).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(eye);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('sends a reset link for the email the password goes with', async () => {
    const { api } = show(false, on('POST', '/auth/request-password-reset', json({ ok: true })));
    await toPassword();
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password' }));
    expect(await said('status')).toHaveTextContent('If that account exists, a password-reset link has been sent.');
    expect(api.calls.find((c) => c.path === '/auth/request-password-reset')?.body).toEqual({ email: 'rojda@hevalo.app' });
  });
});

describe('the code', () => {
  it('is asked for on the same card, with the console still not there', async () => {
    show(true);
    const card = (await screen.findByRole('heading', { name: 'Enter your 2FA code' })).closest('.login-card');
    expect(card?.parentElement).toHaveClass('login-stage');
    expect(screen.getByText('Admin console')).toBeInTheDocument();
    expect(screen.getByLabelText('Six-digit code').closest('.login-input')).not.toBeNull();
    expect(screen.queryByText('The console')).not.toBeInTheDocument();
  });

  it('says a code is not whole yet instead of greying the button out, and sends nothing', async () => {
    const { api } = show(true);
    const box = await screen.findByLabelText('Six-digit code');
    await userEvent.type(box, '123');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await said('alert')).toHaveTextContent('Enter all six digits from your authenticator app.');
    expect(api.calls.some((c) => c.path === '/admin/auth/verify')).toBe(false);
    // gone as soon as the code is being put right
    await userEvent.type(box, '4');
    expect(saysNothing('alert')).toBe(true);
  });

  it('sends the code as soon as its sixth digit is in, with nothing more to press', async () => {
    const { api } = show(true, on('POST', '/admin/auth/verify', failure(401, 'INVALID_CODE', 'invalid or expired code')));
    await userEvent.type(await screen.findByLabelText('Six-digit code'), '123456');
    await waitFor(() => expect(api.calls.filter((c) => c.path === '/admin/auth/verify')).toHaveLength(1));
    expect(api.calls.find((c) => c.path === '/admin/auth/verify')?.body).toEqual({ code: '123456' });
  });

  it('says a wrong code did not match, and empties the box for the next one', async () => {
    show(true, on('POST', '/admin/auth/verify', failure(401, 'INVALID_CODE', 'invalid or expired code')));
    const box = await screen.findByLabelText('Six-digit code');
    await userEvent.type(box, '123456');
    expect(await said('alert')).toHaveTextContent('That code didn’t match.');
    expect(box).toHaveValue('');
    expect(box).toHaveAttribute('aria-invalid', 'true');
  });

  it('opens the console once the code is right', async () => {
    let verified = false;
    show(
      true,
      on('GET', '/admin/session', () => json({ roles: ['admin'], staffRoles: [], capabilities: [], needsEnrollment: false, needsVerification: !verified })),
      on('POST', '/admin/auth/verify', () => {
        verified = true;
        return json({ ok: true });
      }),
    );
    await userEvent.type(await screen.findByLabelText('Six-digit code'), '123456');
    expect(await screen.findByRole('heading', { name: 'Opening the console…' })).toBeInTheDocument();
    expect(await screen.findByText('The console')).toBeInTheDocument();
  });
});

describe('after too many wrong codes', () => {
  it('says calmly that code entry is paused and for how long, and counts the wait down on the button', async () => {
    show(true, on('POST', '/admin/auth/verify', failure(429, 'TOTP_LOCKED', 'too many wrong codes — try again later', { retryAfterSec: 287 })));
    await userEvent.type(await screen.findByLabelText('Six-digit code'), '123456');
    const alert = await said('alert');
    expect(alert).toHaveTextContent('Code entry is paused');
    expect(alert).toHaveTextContent('You can try again in 5 minutes.');
    // the server's own words, lower case and without a time, are not what is shown
    expect(alert).not.toHaveTextContent('try again later');
    expect(screen.getByRole('button', { name: /Try again in 4:4\d/ })).toBeDisabled();
  });

  it('comes back by itself when the pause is over', async () => {
    show(true, on('POST', '/admin/auth/verify', failure(429, 'TOTP_LOCKED', 'too many wrong codes — try again later', { retryAfterSec: 1 })));
    const box = await screen.findByLabelText('Six-digit code');
    await userEvent.type(box, '123456');
    expect(await screen.findByRole('button', { name: /Try again in 0:0\d/ })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled(), { timeout: 3000 });
    expect(await said('status')).toHaveTextContent('You can enter a code again.');
    expect(box).toHaveFocus();
  });

  it('reads the wait from Retry-After when the rate limit answers instead', async () => {
    show(true, on('POST', '/admin/auth/verify', { status: 429, body: { code: 'RATE_LIMITED', message: 'too many requests' }, headers: { 'retry-after': '120' } }));
    await userEvent.type(await screen.findByLabelText('Six-digit code'), '123456');
    const alert = await said('alert');
    expect(alert).toHaveTextContent('Too many tries');
    expect(alert).toHaveTextContent('Wait 2 minutes, then try again.');
    expect(screen.getByRole('button', { name: /Try again in [12]:\d\d/ })).toBeDisabled();
  });

  it('pauses setting up 2FA the same way', async () => {
    show(
      true,
      session({ needsEnrollment: true, needsVerification: false }),
      on('POST', '/admin/2fa/enroll', json({ secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/Hevalo:rojda?secret=JBSWY3DPEHPK3PXP' })),
      on('POST', '/admin/2fa/confirm', failure(429, 'TOTP_LOCKED', 'too many wrong codes — try again later', { retryAfterSec: 600 })),
    );
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Six-digit code'), '123456');
    expect(await said('alert')).toHaveTextContent('You can try again in 10 minutes.');
    expect(screen.getByRole('button', { name: /Try again in (10:00|9:5\d)/ })).toBeDisabled();
  });
});

describe('a way out', () => {
  it('signs out from the code step, back to the first one, for the wrong account or a missing authenticator', async () => {
    const { api } = show(true);
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(getToken()).toBeNull();
    expect(api.calls.some((c) => c.method === 'POST' && c.path === '/admin/session/end')).toBe(true);
  });

  it('ends the session on the server when signing out, so it leaves the list of signed-in devices', async () => {
    const { api } = show(true, on('POST', '/auth/logout', json({ ok: true })));
    // a sign-in that kept its refresh token, as every one does now
    setToken('tok', true, 'ref-7');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(getToken()).toBeNull();
    await waitFor(() => expect(api.calls.find((c) => c.path === '/auth/logout')?.body).toEqual({ refreshToken: 'ref-7' }));
  });

  it.each([
    [404, 'NOT_FOUND', 'route not found'],
    [403, 'FORBIDDEN', 'insufficient permissions'],
  ])('signs an account the console is not for straight back out (%i), saying nothing about why', async (status, code, message) => {
    show(true, on('GET', '/admin/session', failure(status, code, message)));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(getToken()).toBeNull();
    expect(screen.queryByText(/not found|permissions|no access/i)).not.toBeInTheDocument();
    expect(saysNothing('alert')).toBe(true);
  });

  it('comes back to the first step when the console signs out', async () => {
    show(true, session({ needsVerification: false }));
    await userEvent.click(await screen.findByText('The console'));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('loading while the person is busy', () => {
  it('fetches the console’s code in the background as soon as the sign-in is on screen', async () => {
    const { warm, api } = show(false);
    await waitFor(() => expect(warm).toHaveBeenCalled());
    expect(api.calls).toHaveLength(0);
  });

  it('takes a session kept from before straight in, past every step', async () => {
    show(true, session({ needsVerification: false }));
    expect(await screen.findByText('The console')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});

/** Hevalo leaning in over the card (brand/Companion.tsx): which way each foreleg points from the knee (about 180 over an eye), an eye's lid, and the sign over his head. */
const companion = (): HTMLElement => document.querySelector<HTMLElement>('.login-stage > .login-companion')!;
const legTurn = (side: 'left' | 'right'): number =>
  Math.abs(Number(/rotate\((\S+)\)/.exec(companion().querySelector(`[data-cp="leg-${side}"]`)?.getAttribute('transform') ?? '')?.[1] ?? Number.NaN));
const lid = (side: 'left' | 'right', state: string): string | null | undefined =>
  companion().querySelector(`[data-eye="${side}"] [data-lid="${state}"]`)?.getAttribute('visibility');

describe('Hevalo on the sign-in', () => {
  it('leans in over the card, hidden from assistive technology, with no words in the console', () => {
    show(false);
    expect(companion()).toHaveAttribute('aria-hidden', 'true');
    expect(companion().querySelector('[data-cp="legs"]')).not.toBeNull();
    expect(companion().querySelector('.cp-say')).toBeNull();
  });

  it('covers his eyes for the password, peeks when it is shown, and puts his hooves back on the sill after', async () => {
    const user = userEvent.setup();
    show(false);
    await user.type(screen.getByLabelText('Email'), 'rojda@hevalo.app{Enter}');
    await screen.findByLabelText('Password');
    await waitFor(() => expect(legTurn('left')).toBeGreaterThan(170));
    await waitFor(() => expect(lid('right', 'closed')).toBe('visible'));
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    await waitFor(() => expect(lid('right', 'half')).toBe('visible'));
    expect(legTurn('right')).toBeLessThan(legTurn('left'));
    await user.click(screen.getByRole('button', { name: 'Change the email, rojda@hevalo.app' }));
    await waitFor(() => expect(legTurn('left')).toBeLessThan(5));
  });

  it('wonders over a sign-in that did not go through', async () => {
    const user = userEvent.setup();
    show(false, on('POST', '/admin/auth/login', failure(401, 'INVALID_CREDENTIALS', 'invalid email or password')));
    await user.type(screen.getByLabelText('Email'), 'rojda@hevalo.app{Enter}');
    await user.type(await screen.findByLabelText('Password'), 'wrong{Enter}');
    await said('alert');
    await waitFor(() => expect(companion().dataset.emote).toBe('question'));
  });
});
