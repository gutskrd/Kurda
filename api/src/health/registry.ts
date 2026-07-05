export type CheckStatus = 'ok' | 'error' | 'not_configured';

export interface CheckResult {
  status: CheckStatus;
  latencyMs?: number;
  message?: string;
}

export type HealthCheck = () => Promise<CheckResult>;

/**
 * Registry of dependency health checks. Infrastructure modules register
 * themselves here as they are added: the database in KUR-003 (#3), Redis
 * in KUR-006 (#6). A `not_configured` check reports in /health without
 * degrading overall status; only `error` does.
 */
export class HealthRegistry {
  private readonly checks = new Map<string, HealthCheck>();

  register(name: string, check: HealthCheck): void {
    this.checks.set(name, check);
  }

  async run(): Promise<{ status: 'ok' | 'degraded'; checks: Record<string, CheckResult> }> {
    const results: Record<string, CheckResult> = {};
    await Promise.all(
      [...this.checks.entries()].map(async ([name, check]) => {
        const started = Date.now();
        try {
          results[name] = await check();
        } catch (err) {
          results[name] = {
            status: 'error',
            latencyMs: Date.now() - started,
            message: err instanceof Error ? err.message : 'check threw',
          };
        }
      }),
    );
    const degraded = Object.values(results).some((r) => r.status === 'error');
    return { status: degraded ? 'degraded' : 'ok', checks: results };
  }
}

export function notConfigured(pendingIssue: string): HealthCheck {
  return async () => ({ status: 'not_configured', message: `pending ${pendingIssue}` });
}
