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

const NUL = '\u0000';

/** An object or array whose strings can be cleaned in place; not raw bytes. */
function isContainer(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !ArrayBuffer.isView(value) &&
    typeof (value as { pipe?: unknown }).pipe !== 'function'
  );
}

/**
 * How deep a request's JSON may nest. Nothing the apps send comes near it; far
 * deeper bodies only cost memory to walk and validate, and stored as jsonb
 * they run Postgres out of stack.
 */
export const MAX_JSON_DEPTH = 32;

/** What is wrong with a request part, in the shape a validation issue has. */
export interface RequestProblem {
  path: string;
  message: string;
}

/**
 * Cleans a request part (an object or an array, at any depth) in place: every
 * NUL character is taken out of its strings. Returns a problem when there is
 * no clean form — a key holding a NUL, which cannot be rewritten without
 * changing what it names, or nesting deeper than MAX_JSON_DEPTH — and null
 * otherwise.
 *
 * Walked with a stack rather than by recursion, so even a body nested far past
 * the limit cannot exhaust the call stack. Raw bodies (a Buffer, a stream, a
 * string kept for a signature check) are left as they came: they are for a
 * parser of their own, and a signed one must stay byte for byte.
 */
export function cleanRequestPart(value: unknown): RequestProblem | null {
  if (!isContainer(value)) return null;
  const pending: Array<[Record<string, unknown>, string, number]> = [[value, '', 1]];
  while (pending.length > 0) {
    const [container, path, depth] = pending.pop()!;
    if (depth > MAX_JSON_DEPTH) return { path, message: `must not nest more than ${MAX_JSON_DEPTH} levels deep` };
    for (const [key, child] of Object.entries(container)) {
      const childPath = path ? `${path}.${key}` : key;
      if (key.includes(NUL)) return { path: childPath, message: 'must not contain a null character' };
      if (typeof child === 'string') {
        if (child.includes(NUL)) container[key] = child.replaceAll(NUL, '');
      } else if (isContainer(child)) {
        pending.push([child, childPath, depth + 1]);
      }
    }
  }
  return null;
}

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

  /*
   * No text in a request reaches a handler with a NUL character in it.
   * Postgres cannot store one in text or jsonb and answers with an error, which
   * surfaced as a 500 from any route that wrote or even looked up what it was
   * sent (a search, a display name, a sign-in). Taken out here, once, for every
   * route: the query string, the path and the body, schema or no schema, before
   * any schema or handler sees them, so every check runs on what is kept. This
   * is the rule user text already follows (control characters are stripped,
   * not refused); a key holding one is refused, having no clean form, and so
   * is JSON nested deeper than MAX_JSON_DEPTH.
   */
  app.addHook('preValidation', async (req) => {
    const parts: Array<[string, unknown]> = [
      ['querystring', req.query],
      ['params', req.params],
      ['body', req.body],
    ];
    for (const [part, value] of parts) {
      const problem = cleanRequestPart(value);
      if (problem !== null) throw new RequestValidationError(part, [problem]);
    }
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
