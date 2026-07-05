import type { FastifyInstance } from 'fastify';
import { ZodType } from 'zod';

export interface ValidationIssue {
  path: string;
  message: string;
}

/** Raised by the validator compiler; mapped to 400 VALIDATION_ERROR. */
export class RequestValidationError extends Error {
  constructor(
    public readonly part: string,
    public readonly issues: ValidationIssue[],
  ) {
    super('request validation failed');
  }
}

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/**
 * Wires zod as the schema validator and enforces at boot that every
 * route declares the schemas it needs:
 *  - POST/PUT/PATCH must declare schema.body
 *  - routes with :params must declare schema.params
 *
 * A route may opt out explicitly with `config: { skipValidation: true }`
 * (reserve for webhook raw-body endpoints; justify in review).
 *
 * zod object schemas strip unknown keys by default, so extra fields
 * never reach handlers.
 */
export function setupValidation(app: FastifyInstance): void {
  app.setValidatorCompiler<ZodType>(({ schema, httpPart }) => {
    return (data) => {
      const result = schema.safeParse(data);
      if (result.success) return { value: result.data };
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return { error: new RequestValidationError(httpPart ?? 'request', issues) };
    };
  });

  app.addHook('onRoute', (route) => {
    if (route.config && (route.config as { skipValidation?: boolean }).skipValidation) return;

    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const needsBody = methods.some((m) => BODY_METHODS.has(m));
    const schema = route.schema as { body?: unknown; params?: unknown } | undefined;

    if (needsBody && !schema?.body) {
      throw new Error(
        `Route ${methods.join(',')} ${route.url} must declare schema.body (KUR-005). ` +
          'Opt out only via config.skipValidation for raw-body endpoints.',
      );
    }
    if (route.url.includes(':') && !schema?.params) {
      throw new Error(`Route ${methods.join(',')} ${route.url} must declare schema.params (KUR-005).`);
    }
  });
}
