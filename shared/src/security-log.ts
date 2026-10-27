/**
 * The security log's vocabulary: every kind of event the API records about who
 * is getting in, who is being kept out, and who changed what about access, with
 * how serious each one is and how the admin panel names it. One list, so the
 * server that records an event and the panel that shows it cannot disagree.
 *
 * Severity says what the panel does with an event:
 * - info: kept for the record (a normal sign-in)
 * - notice: worth seeing when looking into something (a wrong password)
 * - warning: put on the "Needs attention" list until someone marks it reviewed
 * - critical: on that list, and emailed to the superadmins straight away
 *
 * An event about a staff account is one step more serious when its kind says
 * so (`staffEscalates`): a wrong password on an ordinary account is a typo, on
 * the owner's account it may be someone trying to get in.
 */

export const SECURITY_SEVERITIES = ['info', 'notice', 'warning', 'critical'] as const;
export type SecuritySeverity = (typeof SECURITY_SEVERITIES)[number];

export const SECURITY_CATEGORIES = ['sign-in', 'console', 'account', 'abuse', 'access'] as const;
export type SecurityCategory = (typeof SECURITY_CATEGORIES)[number];

/** How the panel names each category. */
export const SECURITY_CATEGORY_LABELS: Record<SecurityCategory, string> = {
  'sign-in': 'Sign-ins',
  console: 'Admin console',
  account: 'Account changes',
  abuse: 'Attacks and abuse',
  access: 'Staff access',
};

export interface SecurityEventInfo {
  severity: SecuritySeverity;
  category: SecurityCategory;
  /** what happened, as the log's list says it */
  title: string;
  /** what it means, and what to do if it was not expected */
  meaning: string;
  /** one step more serious when it is about a staff account */
  staffEscalates?: boolean;
  /** recorded at most once in this many seconds for the same `dedupeBy` */
  dedupeSeconds?: number;
  /** what makes two events of a once-in-a-while kind the same one */
  dedupeBy?: ReadonlyArray<'account' | 'network' | 'route'>;
}

const IF_NOT_YOU = 'If it was not the owner, change the password and end the account’s other sessions.';

export const SECURITY_EVENTS = {
  'signin.succeeded': {
    severity: 'info',
    category: 'sign-in',
    title: 'Signed in',
    meaning: 'The right password, from a device or network the account has used before.',
  },
  'signin.new_device': {
    severity: 'notice',
    category: 'sign-in',
    title: 'Signed in from a new device',
    meaning: `The right password, from a device the account has never used. The owner was emailed. ${IF_NOT_YOU}`,
    staffEscalates: true,
  },
  'signin.failed': {
    severity: 'notice',
    category: 'sign-in',
    title: 'Wrong email or password',
    meaning: 'A sign-in that did not match an account and password. A few are typos; many in a row are someone guessing.',
    staffEscalates: true,
  },
  'signin.challenged': {
    severity: 'notice',
    category: 'sign-in',
    title: 'Asked to prove it is a person',
    meaning: 'After failed attempts, or while failures surge, a sign-in from an unknown device has to pass the challenge first.',
    staffEscalates: true,
    dedupeSeconds: 300,
    dedupeBy: ['account', 'network'],
  },
  'signin.locked': {
    severity: 'warning',
    category: 'sign-in',
    title: 'Sign-ins paused after failed attempts',
    meaning: 'Too many wrong passwords for one account, so its sign-ins wait a while. The owner was emailed.',
    staffEscalates: true,
  },
  'signin.risk_blocked': {
    severity: 'warning',
    category: 'sign-in',
    title: 'Risky sign-in stopped',
    meaning: 'The risk check stopped this sign-in before any password was tried: too many accounts or attempts from one device or network.',
  },
  'signin.surge': {
    severity: 'critical',
    category: 'abuse',
    title: 'Failed sign-ins are surging',
    meaning:
      'Many accounts are failing to sign in at once, the shape of leaked passwords being tried everywhere. Every sign-in from an unknown device needs the challenge until it calms down.',
  },
  'network.locked': {
    severity: 'warning',
    category: 'abuse',
    title: 'Network blocked for trying many accounts',
    meaning: 'One network failed to sign in to several different accounts, so its sign-ins wait a while.',
  },
  'signup.rejected': {
    severity: 'notice',
    category: 'abuse',
    title: 'Sign-up refused',
    meaning: 'A new account was refused: a throwaway email address, a failed challenge, too many accounts from one device or network, or a banned address.',
  },
  'request.rate_limited': {
    severity: 'notice',
    category: 'abuse',
    title: 'Too many requests, slowed down',
    meaning: 'Requests came faster than the limit and were refused for a moment. Shown once per network and page every ten minutes.',
    dedupeSeconds: 600,
    dedupeBy: ['network', 'route'],
  },
  'request.probe': {
    severity: 'notice',
    category: 'abuse',
    title: 'Vulnerability scan turned away',
    meaning:
      'Something asked for an address only another kind of server has, like a PHP script, WordPress or a secrets file. Hevalo runs none of these, so it was answered "not found" at once. Shown once an hour per network.',
    dedupeSeconds: 3600,
    dedupeBy: ['network'],
  },
  'network.scanner_blocked': {
    severity: 'warning',
    category: 'abuse',
    title: 'Network shut out for scanning',
    meaning:
      'One network kept probing for weaknesses, so for an hour it can no longer reach the app without being signed in. Accounts already signed in on it are not affected.',
  },
  'session.reused': {
    severity: 'warning',
    category: 'account',
    title: 'An old session key was used again',
    meaning: `A session key that had already been replaced came back, which can mean it was copied. Every session it belonged to was ended. ${IF_NOT_YOU}`,
    staffEscalates: true,
  },
  'password.changed': {
    severity: 'notice',
    category: 'account',
    title: 'Password changed',
    meaning: `Changed while signed in, with the current password. Every other session was ended and the owner was emailed. ${IF_NOT_YOU}`,
    staffEscalates: true,
  },
  'password.change_failed': {
    severity: 'notice',
    category: 'account',
    title: 'Wrong current password when changing it',
    meaning: 'Someone signed in tried to change the password and got the current one wrong.',
    staffEscalates: true,
  },
  'password.reset_requested': {
    severity: 'info',
    category: 'account',
    title: 'Password reset email asked for',
    meaning: 'A reset link was sent to the account’s email address. Nothing changes unless the link is used.',
    staffEscalates: true,
  },
  'password.reset': {
    severity: 'notice',
    category: 'account',
    title: 'Password reset with an email link',
    meaning: `The password was replaced through a link from the account’s mailbox, and every session was ended. ${IF_NOT_YOU}`,
    staffEscalates: true,
  },
  'console.signin': {
    severity: 'notice',
    category: 'console',
    title: 'Signed in to the admin console',
    meaning: 'The right password on the console’s sign-in, from a device or network used before. The two-step code comes next.',
  },
  'console.signin_new_device': {
    severity: 'critical',
    category: 'console',
    title: 'Admin console sign-in from a new device or network',
    meaning:
      'The right password on the console’s sign-in, from somewhere this account has never signed in from. If it was not you, change the password now: the two-step code is the only thing left in the way.',
  },
  'console.signin_failed': {
    severity: 'warning',
    category: 'console',
    title: 'Failed admin console sign-in',
    meaning: 'A wrong email or password on the console’s own sign-in page.',
  },
  'console.signin_refused': {
    severity: 'warning',
    category: 'console',
    title: 'An account without console access tried to sign in',
    meaning: 'A real account, with its right password, tried the console. It was answered as a wrong password and given nothing.',
  },
  'console.2fa_passed': {
    severity: 'notice',
    category: 'console',
    title: 'Two-step code accepted',
    meaning: 'The console session is fully open.',
  },
  'console.2fa_failed': {
    severity: 'warning',
    category: 'console',
    title: 'Wrong two-step code',
    meaning: 'Someone with the password entered a wrong code. One is a slip; several mean the password is known to someone else.',
  },
  'console.2fa_locked': {
    severity: 'critical',
    category: 'console',
    title: 'Two-step codes locked after too many wrong ones',
    meaning: 'Someone with the password kept entering wrong codes. If it was not you, change the password now.',
  },
  'console.2fa_enroll_started': {
    severity: 'notice',
    category: 'console',
    title: 'Two-step setup started',
    meaning: 'A new secret for the authenticator app was made for an account without one.',
  },
  'console.2fa_enrolled': {
    severity: 'warning',
    category: 'console',
    title: 'Authenticator set up for two-step codes',
    meaning: 'From now on this authenticator’s codes open the console for the account. If you did not just set one up, someone has the password.',
  },
  'console.2fa_reset_refused': {
    severity: 'critical',
    category: 'console',
    title: 'Someone tried to replace the authenticator',
    meaning: 'A session that had not entered a two-step code asked for a new authenticator secret, and was refused. Someone may have the password.',
  },
  'console.probe': {
    severity: 'warning',
    category: 'console',
    title: 'An account without console access tried an admin page',
    meaning: 'Answered as a page that does not exist. Shown once an hour per account.',
    dedupeSeconds: 3600,
    dedupeBy: ['account'],
  },
  'console.ip_revealed': {
    severity: 'notice',
    category: 'console',
    title: 'An address in this log was revealed',
    meaning: 'A superadmin looked at the address an event came from, giving a reason.',
  },
  'console.offline_on': {
    severity: 'warning',
    category: 'console',
    title: 'Hevalo taken offline',
    meaning: 'A superadmin turned on the offline screen, now or from a set time. Everyone but staff sees it instead of the app until it is turned off.',
  },
  'console.offline_off': {
    severity: 'notice',
    category: 'console',
    title: 'Hevalo opened again',
    meaning: 'A superadmin turned the offline screen off, or called off one that was set for later.',
  },
  'access.role_granted': {
    severity: 'warning',
    category: 'access',
    title: 'Staff role given',
    meaning: 'An account was given a staff role, either by a superadmin or from the server’s own list of admins.',
  },
  'access.role_revoked': {
    severity: 'notice',
    category: 'access',
    title: 'Staff role taken away',
    meaning: 'An account lost a staff role.',
  },
} as const satisfies Record<string, SecurityEventInfo>;

export type SecurityEventKind = keyof typeof SECURITY_EVENTS;

export const SECURITY_EVENT_KINDS = Object.keys(SECURITY_EVENTS) as SecurityEventKind[];

export function isSecurityEventKind(kind: string): kind is SecurityEventKind {
  return Object.prototype.hasOwnProperty.call(SECURITY_EVENTS, kind);
}

/** What the panel shows for a kind, including one it does not know (a newer server's). */
export function securityEventInfo(kind: string): SecurityEventInfo {
  return isSecurityEventKind(kind)
    ? SECURITY_EVENTS[kind]
    : { severity: 'notice', category: 'abuse', title: kind.replace(/[._]/g, ' '), meaning: 'A kind of event this panel does not know yet.' };
}

/** How serious an event of `kind` is, one step more for a staff account when the kind says so. */
export function securitySeverity(kind: SecurityEventKind, staff = false): SecuritySeverity {
  const info: SecurityEventInfo = SECURITY_EVENTS[kind];
  const base = SECURITY_SEVERITIES.indexOf(info.severity);
  const step = staff && info.staffEscalates ? 1 : 0;
  return SECURITY_SEVERITIES[Math.min(base + step, SECURITY_SEVERITIES.length - 1)]!;
}

/** Whether events this serious wait on the "Needs attention" list. */
export function needsAttention(severity: SecuritySeverity): boolean {
  return severity === 'warning' || severity === 'critical';
}

/** How long the log keeps an event (the database enforces the same): the serious ones a year. */
export const SECURITY_RETENTION_DAYS: Record<SecuritySeverity, number> = { info: 90, notice: 90, warning: 365, critical: 365 };

/** How long the sealed address an event came from is kept before it is forgotten. */
export const SECURITY_ADDRESS_DAYS = 30;
