/**
 * Crash reports from the apps: what one may carry, the limits, and how its text is cleaned on the phone and again on the
 * server. A report is for finding the bug, not the person: the error's name, message and stack, the screen's route name,
 * and the platform and versions, but no account, device id, typed text or request data. It is posted without signing in
 * and kept in the server log, not a table. Error text is cleaned of anything that could name somebody (addresses, tokens,
 * ids, URL queries), since a message can quote whatever the code held.
 */
import type { AppPlatform } from './feedback.js';

/** A render that threw (caught by the app's error boundary), or an error nothing else caught. */
export const CLIENT_ERROR_KINDS = ['render', 'uncaught'] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

/** The most of each part a report may hold; the server refuses anything longer. */
export const CLIENT_ERROR_LIMITS = {
  /** reports in one batch */
  reports: 10,
  name: 80,
  message: 300,
  stack: 1500,
  componentStack: 800,
  /** a route name, such as `LessonPlayer` */
  screen: 60,
  appVersion: 32,
  buildNumber: 16,
  osVersion: 32,
  /** how many times the same error happened since the last batch, counted on the phone */
  count: 1000,
} as const;

/** Stack frames worth keeping: the top, where the error was thrown. */
export const CLIENT_ERROR_STACK_LINES = 20;

/** The largest request body the server reads; a full batch at every limit fits with room to spare. */
export const CLIENT_ERROR_BODY_MAX = 40 * 1024;

/** A route name or a version: letters, digits and a little punctuation, so no free text fits. */
export const CLIENT_ERROR_TOKEN = /^[\w.+-]+$/;

export interface ClientErrorReport {
  kind: ClientErrorKind;
  /** the app was about to close because of it */
  fatal: boolean;
  name?: string;
  message: string;
  stack?: string;
  /** which components were rendering, for a render that threw */
  componentStack?: string;
  screen?: string;
  count: number;
}

export interface ClientErrorBatch {
  platform: AppPlatform;
  appVersion: string;
  buildNumber?: string;
  osVersion?: string;
  reports: ClientErrorReport[];
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b(?!:\d)/gi;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const BEARER = /\bBearer\s+[\w.~+/-]+=*/gi;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const URL_QUERY = /(\b[a-z][a-z\d+.-]*:\/\/[^\s?#'"()]+)[?#][^\s'"()]*/gi;
// Every control character but the tab and the line break, which a stack is made of.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

/**
 * An error's text as a report may carry it: without email addresses, tokens, ids, URL queries or control characters, and
 * at most `max` long. An email is told from a stack frame by what follows it (`render@main.js:1:20` is left alone).
 * Idempotent, so the server can clean again without trusting the phone.
 */
export function scrubClientErrorText(text: string, max: number): string {
  // The patterns are cheap, but a message can be a whole response body and only its start is kept.
  const cleaned = text
    .slice(0, max * 4)
    .replace(CONTROL, '')
    .replace(JWT, '[token]')
    .replace(BEARER, 'Bearer [token]')
    .replace(URL_QUERY, '$1')
    .replace(EMAIL, '[email]')
    .replace(UUID, '[id]');
  return cutAt(cleaned, max);
}

/** The top of a stack, frame by frame, cleaned like any other text. */
export function scrubClientErrorStack(stack: string, max: number): string {
  const top = stack
    .slice(0, max * 4)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, CLIENT_ERROR_STACK_LINES)
    .join('\n');
  return scrubClientErrorText(top, max);
}

/** At most `max` UTF-16 units, without leaving half a surrogate pair at the end. */
function cutAt(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}
