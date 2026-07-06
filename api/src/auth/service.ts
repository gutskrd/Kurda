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
import { issueTokenPair, type IssuedTokens } from './tokens.js';

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

export class AuthService {
  private readonly users: UsersRepository;

  constructor(
    private readonly config: AppConfig,
    private readonly pool: pg.Pool,
  ) {
    this.users = new UsersRepository(pool);
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
    return { user: toPublicUser(user), tokens };
  }
}
