import type pg from 'pg';
import { normalizeKurdish } from '@kurda/shared';
import { SoftDeleteRepository } from '../db/base-repository.js';
import { canonicalUsername } from './username.js';

export interface UserRow {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  password_hash: string | null;
  locale: string;
  timezone: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface CreateUserInput {
  email: string;
  username: string;
  passwordHash?: string;
  displayName?: string;
  locale?: string;
  timezone?: string;
}

export class EmailTakenError extends Error {
  constructor() {
    super('email already in use');
  }
}
export class UsernameTakenError extends Error {
  constructor() {
    super('username already in use');
  }
}
export class InvalidUsernameError extends Error {
  constructor() {
    super('username must be 3-30 letters, digits or _ (Kurdish letters allowed)');
  }
}

const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';

interface PgError {
  code?: string;
  constraint?: string;
}

export class UsersRepository extends SoftDeleteRepository {
  constructor(pool: pg.Pool) {
    super(pool, 'users');
  }

  async create(input: CreateUserInput): Promise<UserRow> {
    const username = canonicalUsername(input.username);
    if (!username) throw new InvalidUsernameError();
    const email = normalizeKurdish(input.email);

    try {
      const result = await this.pool.query<UserRow>(
        `INSERT INTO users (email, username, display_name, password_hash, locale, timezone)
         VALUES ($1, $2, $3, $4, COALESCE($5, 'en'), COALESCE($6, 'UTC'))
         RETURNING *`,
        [
          email,
          username,
          input.displayName ?? null,
          input.passwordHash ?? null,
          input.locale ?? null,
          input.timezone ?? null,
        ],
      );
      return result.rows[0] as UserRow;
    } catch (err) {
      const pgErr = err as PgError;
      if (pgErr.code === PG_UNIQUE_VIOLATION) {
        if (pgErr.constraint === 'users_email_active_uniq') throw new EmailTakenError();
        if (pgErr.constraint === 'users_username_active_uniq') throw new UsernameTakenError();
      }
      if (pgErr.code === PG_CHECK_VIOLATION && pgErr.constraint === 'users_username_format') {
        throw new InvalidUsernameError();
      }
      throw err;
    }
  }

  async findById(id: string): Promise<UserRow | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT * FROM users WHERE id = $1 AND ${this.activeWhere()}`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT * FROM users WHERE email = $1 AND ${this.activeWhere()}`,
      [normalizeKurdish(email)],
    );
    return result.rows[0] ?? null;
  }

  async findByUsername(username: string): Promise<UserRow | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT * FROM users WHERE username = $1 AND ${this.activeWhere()}`,
      [normalizeKurdish(username)],
    );
    return result.rows[0] ?? null;
  }
}
