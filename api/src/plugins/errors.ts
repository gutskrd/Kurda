import type { FastifyError, FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';
import { RequestValidationError } from './validation.js';

/**
 * Base class for domain errors. Route handlers and services throw these;
 * the central error handler turns them into the response envelope.
 */
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

/**
 * Standard error envelope: { code, message, details?, requestId }.
 *
 * - AppError            → its own status/code/message
 * - RequestValidationError → 400 VALIDATION_ERROR with per-field details
 *   (zod issue messages describe the expectation; raw input values are
 *   never echoed back)
 * - anything else       → 500 INTERNAL_ERROR; real message logged, but the
 *   response body is generic outside development (no stack/message leaks)
 */
export function setupErrorHandling(app: FastifyInstance, config: AppConfig): void {
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  app.setNotFoundHandler((req, reply) => {
    void reply.code(404).send({
      code: 'NOT_FOUND',
      message: 'route not found',
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
      return reply.code(err.statusCode).send({
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
        requestId: req.id,
      });
    }

    // malformed JSON body and other fastify client errors carry 4xx codes
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 500) {
      req.log.error(err);
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
