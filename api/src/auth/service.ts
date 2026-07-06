import argon2 from 'argon2';
import type pg from 'pg';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../plugins/errors.js';
import {
  EmailTakenError,
  InvalidUsernameError,
  UsernameTakenError,
  UsersRepository,
  type UserRow,
} from '../users/repository.js';
import { sendEmailJob } from '../jobs/email.js';
import type { JobQueue } from '../jobs/queue.js';
import { consumeEmailToken, createEmailToken } from './email-tokens.js';
import { hashRefreshToken, issueTokenPair, type IssuedTokens } from './tokens.js';

/** Verified against when the user doesn't exist, so login latency doesn't
 *  reveal account existence. */
const DUMMY_HASH_PROMISE = argon2.hash('kurda-timing-equalizer', {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
});

/** Argon2id with OWASP-recommended parameters. */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password).catch(() => false);
}

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
  displayName?: string;
  locale?: string;
  timezone?: string;
  deviceName?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  locale: string;
  timezone: string;
  createdAt: string;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    locale: row.locale,
    timezone: row.timezone,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export interface AuthServiceDeps {
  jobs?: JobQueue;
  log?: { warn: (obj: unknown, msg: string) => void };
}

export class AuthService {
  private readonly users: UsersRepository;

  constructor(
    private readonly config: AppConfig,
    private readonly pool: pg.Pool,
    private readonly deps: AuthServiceDeps = {},
  ) {
    this.users = new UsersRepository(pool);
  }

  /** Best-effort: signup must never fail because email couldn't enqueue. */
  private async sendVerificationEmail(user: { id: string; email: string; username: string }) {
    try {
      const token = await createEmailToken(this.pool, user.id, 'verify_email');
      if (this.deps.jobs) {
        await this.deps.jobs.enqueue(sendEmailJob, {
          to: user.email,
          template: 'verify-email',
          vars: { token, username: user.username },
        });
      }
    } catch (err) {
      this.deps.log?.warn({ err, userId: user.id }, 'failed to enqueue verification email');
    }
  }

  /** Always succeeds from the caller's perspective (no enumeration). */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;
    try {
      if (!user.password_hash) {
        // OAuth-only account (KUR-019): explain instead of a useless link
        if (this.deps.jobs) {
          await this.deps.jobs.enqueue(sendEmailJob, {
            to: user.email,
            template: 'oauth-no-password',
            vars: { username: user.username },
          });
        }
        return;
      }
      const token = await createEmailToken(this.pool, user.id, 'password_reset');
      if (this.deps.jobs) {
        await this.deps.jobs.enqueue(sendEmailJob, {
          to: user.email,
          template: 'password-reset',
          vars: { token, username: user.username },
        });
      }
    } catch (err) {
      this.deps.log?.warn({ err, userId: user.id }, 'failed to enqueue password reset email');
    }
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const userId = await consumeEmailToken(this.pool, rawToken, 'password_reset');
    if (!userId) {
      throw new AppError('INVALID_TOKEN', 400, 'reset link is invalid or expired');
    }
    const passwordHash = await hashPassword(newPassword);
    // token_version bump invalidates every outstanding access token;
    // revoking refresh tokens kills all sessions (KUR-016 semantics)
    const updated = await this.pool.query<{ email: string; username: string }>(
      `UPDATE users SET password_hash = $2, token_version = token_version + 1
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING email, username`,
      [userId, passwordHash],
    );
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    const user = updated.rows[0];
    if (user && this.deps.jobs) {
      await this.deps.jobs
        .enqueue(sendEmailJob, {
          to: user.email,
          template: 'password-changed',
          vars: { username: user.username },
        })
        .catch(() => undefined);
    }
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const userId = await consumeEmailToken(this.pool, rawToken, 'verify_email');
    if (!userId) {
      throw new AppError('INVALID_TOKEN', 400, 'verification link is invalid or expired');
    }
    await this.pool.query(
      `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`,
      [userId],
    );
  }

  /** Always succeeds from the caller's perspective (no enumeration). */
  async resendVerification(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;
    const verified = await this.pool.query<{ email_verified_at: Date | null }>(
      `SELECT email_verified_at FROM users WHERE id = $1`,
      [user.id],
    );
    if (verified.rows[0]?.email_verified_at) return;
    await this.sendVerificationEmail(user);
  }

  async register(input: RegisterInput): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    const passwordHash = await hashPassword(input.password);
    let user: UserRow;
    try {
      user = await this.users.create({
        email: input.email,
        username: input.username,
        passwordHash,
        displayName: input.displayName,
        locale: input.locale,
        timezone: input.timezone,
      });
    } catch (err) {
      // usernames are public (profiles, search) — a specific error is fine.
      if (err instanceof UsernameTakenError) {
        throw new AppError('USERNAME_TAKEN', 409, 'username already in use');
      }
      if (err instanceof InvalidUsernameError) {
        throw new AppError('INVALID_USERNAME', 400, err.message);
      }
      // emails are private — never confirm one exists (enumeration).
      if (err instanceof EmailTakenError) {
        throw new AppError(
          'REGISTRATION_FAILED',
          409,
          'unable to register with these details — if you already have an account, log in or reset your password',
        );
      }
      throw err;
    }

    const tokens = await issueTokenPair(this.config, this.pool, user, {
      deviceName: input.deviceName,
    });
    await this.sendVerificationEmail(user);
    return { user: toPublicUser(user), tokens };
  }

  async login(input: {
    email: string;
    password: string;
    deviceName?: string;
  }): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    const invalid = () => new AppError('INVALID_CREDENTIALS', 401, 'invalid email or password');

    const user = await this.users.findByEmail(input.email);
    if (!user || !user.password_hash) {
      // burn the same argon2 cost as a real check (timing equalization)
      await verifyPassword(await DUMMY_HASH_PROMISE, input.password);
      throw invalid();
    }
    if (!(await verifyPassword(user.password_hash, input.password))) {
      throw invalid();
    }

    const tokens = await issueTokenPair(this.config, this.pool, user, {
      deviceName: input.deviceName,
    });
    return { user: toPublicUser(user), tokens };
  }

  /**
   * Rotates a refresh token (KUR-015): the presented token is retired and
   * a new one issued in the same family. Presenting an already-rotated or
   * revoked token is treated as theft — the entire family is revoked.
   */
  async refresh(rawToken: string): Promise<IssuedTokens> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<{
        id: string;
        user_id: string;
        family_id: string;
        device_name: string | null;
        expires_at: Date;
        revoked_at: Date | null;
        replaced_by: string | null;
      }>(`SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`, [
        hashRefreshToken(rawToken),
      ]);

      const row = found.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        throw new AppError('INVALID_REFRESH', 401, 'invalid refresh token');
      }

      if (row.revoked_at || row.replaced_by) {
        // reuse of a rotated token — assume the family is compromised
        await client.query(
          `UPDATE refresh_tokens SET revoked_at = now()
           WHERE family_id = $1 AND revoked_at IS NULL`,
          [row.family_id],
        );
        await client.query('COMMIT');
        throw new AppError('REFRESH_REUSED', 401, 'refresh token reuse detected; session revoked');
      }

      if (new Date(row.expires_at).getTime() < Date.now()) {
        await client.query('ROLLBACK');
        throw new AppError('REFRESH_EXPIRED', 401, 'refresh token expired');
      }

      const user = await this.users.findById(row.user_id);
      if (!user) {
        await client.query('ROLLBACK');
        throw new AppError('INVALID_REFRESH', 401, 'invalid refresh token');
      }

      const tokens = await issueTokenPair(this.config, client, user, {
        familyId: row.family_id,
        deviceName: row.device_name ?? undefined,
      });
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1`,
        [row.id, tokens.refreshTokenId],
      );
      await client.query('COMMIT');
      return tokens;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
