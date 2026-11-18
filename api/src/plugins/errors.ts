import type { FastifyError, FastifyInstance } from 'fastify';
import { ROUTE_NOT_FOUND_MESSAGE } from '@kurda/shared';
import type { AppConfig } from '../config/env.js';
import { captureError } from '../observability/sentry.js';
import { RequestValidationError } from './validation.js';

/** Base class for domain errors; the central error handler turns them into the response envelope. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Retry-After for a 429 that does not know how long the wait is (a daily cap, a velocity gate). */
export const DEFAULT_RETRY_AFTER_SEC = 60;

/** The `retryAfterSec` an AppError's details may carry: whole seconds, at least one, since 0 reads as "immediately". */
function retryAfterOf(details: unknown): number | null {
  if (typeof details !== 'object' || details === null) return null;
  const value = (details as { retryAfterSec?: unknown }).retryAfterSec;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.max(1, Math.ceil(value));
}

/**
 * A Postgres refusal caused by the request's own values, as a status and code; null for anything else. 23503 (foreign
 * key) means the request named a row that does not exist; class 22 (data exception) a value Postgres cannot take as
 * its type. Only real driver errors count, which carry a five-character SQLSTATE and a severity.
 */
export function databaseClientError(err: unknown): { statusCode: number; code: string; message: string } | null {
  if (typeof err !== 'object' || err === null) return null;
  const { code, severity } = err as { code?: unknown; severity?: unknown };
  if (typeof code !== 'string' || typeof severity !== 'string' || !/^[0-9A-Z]{5}$/.test(code)) return null;
  if (code === '23503') return { statusCode: 404, code: 'NOT_FOUND', message: 'that refers to something that does not exist' };
  if (code.startsWith('22')) return { statusCode: 400, code: 'BAD_REQUEST', message: 'a value in this request cannot be used' };
  return null;
}

/**
 * The standard error envelope `{ code, message, details?, requestId }`:
 * - AppError → its own status, code and message
 * - RequestValidationError → 400 VALIDATION_ERROR with per-field details, never echoing input values
 * - a Postgres refusal of the request's values → 404 or 400 with a generic message (databaseClientError)
 * - anything else → 500 INTERNAL_ERROR, logged in full, with a generic body outside development
 */
export function setupErrorHandling(app: FastifyInstance, config: AppConfig): void {
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
    // every 429 says when to come back; those that know exactly have said so already
    if (reply.statusCode === 429 && !reply.hasHeader('retry-after')) {
      reply.header('retry-after', String(DEFAULT_RETRY_AFTER_SEC));
    }
  });

  app.setNotFoundHandler((req, reply) => {
    void reply.code(404).send({
      code: 'NOT_FOUND',
      // The apps tell "no such route" (an API older than the app) from a game that is gone by this message
      // (@kurda/shared isMissingRoute).
      message: ROUTE_NOT_FOUND_MESSAGE,
      requestId: req.id,
    });
  });

  app.setErrorHandler((err: FastifyError | AppError | RequestValidationError, req, reply) => {
    if (err instanceof RequestValidationError) {
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: 'request validation failed',
        details: err.issues,
        requestId: req.id,
      });
    }

    if (err instanceof AppError) {
      // An error that knows the wait sends it as Retry-After, which both apps count down from.
      const retryAfterSec = retryAfterOf(err.details);
      if (retryAfterSec !== null) reply.header('retry-after', String(retryAfterSec));
      return reply.code(err.statusCode).send({
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
        requestId: req.id,
      });
    }

    // logged, never sent: the driver's text names tables, columns and values
    const refused = databaseClientError(err);
    if (refused) {
      req.log.warn({ err }, 'request refused by the database');
      return reply.code(refused.statusCode).send({ code: refused.code, message: refused.message, requestId: req.id });
    }

    // malformed JSON body and other fastify client errors carry 4xx codes
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 500) {
      req.log.error(err);
      captureError(err, { requestId: req.id, method: req.method, url: req.url });
      return reply.code(500).send({
        code: 'INTERNAL_ERROR',
        message: config.NODE_ENV === 'development' ? err.message : 'internal server error',
        requestId: req.id,
      });
    }
    return reply.code(status).send({
      code: err.code ?? 'BAD_REQUEST',
      message: err.message,
      requestId: req.id,
    });
  });
}
