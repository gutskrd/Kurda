import type { SuspendedErrorDetails } from '@kurda/shared';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../plugins/errors.js';
import { signAppealToken } from './appeal-token.js';
import { currentBan, type CurrentBan } from './sanctions-service.js';
import type { Executor } from './tx.js';

/**
 * The refusal a banned account gets when it tries to sign in or refresh.
 *
 * Login never looked at bans: a banned person signed in with 200, got tokens,
 * and only then met a bare 403 on the next request. Now sign-in, refresh and
 * social sign-in all answer 403 ACCOUNT_SUSPENDED with the statement of reasons
 * — until when (or permanent), the rule, what we told them, whether they can
 * still ask for a review — and an appeal token that can read their standing
 * and file that request, and nothing else.
 *
 * Checked after the password, never before: whether an address belongs to a
 * banned account is not something to tell whoever types it in.
 */
export async function suspensionError(
  config: AppConfig,
  db: Executor,
  user: { id: string; token_version: number },
): Promise<AppError | null> {
  const ban = await currentBan(db, user.id);
  return ban ? suspendedError(config, user, ban) : null;
}

/** The refusal for a ban already looked up. */
export async function suspendedError(config: AppConfig, user: { id: string; token_version: number }, ban: CurrentBan): Promise<AppError> {
  const details: SuspendedErrorDetails = {
    until: ban.until ? ban.until.toISOString() : null,
    policy: ban.policy,
    statement: ban.statement,
    appealable: ban.appealable,
    appealToken: await signAppealToken(config, user),
  };
  return new AppError('ACCOUNT_SUSPENDED', 403, 'this account is suspended', details);
}
