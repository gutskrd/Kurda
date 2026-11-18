import type { SuspendedErrorDetails } from '@kurda/shared';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../plugins/errors.js';
import { signAppealToken } from './appeal-token.js';
import { currentBan, type CurrentBan } from './sanctions-service.js';
import type { Executor } from './tx.js';

/**
 * The refusal a banned account gets at sign-in or refresh: sign-in, refresh and social sign-in all answer 403
 * ACCOUNT_SUSPENDED with the statement of reasons (until when or permanent, the rule, what we told them, whether they
 * can appeal) and an appeal token that can only read their standing and file the appeal.
 *
 * Checked after the password, never before, so whether an address is banned is never revealed to whoever types it.
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
