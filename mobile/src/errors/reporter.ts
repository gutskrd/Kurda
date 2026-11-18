import {
  CLIENT_ERROR_BODY_MAX,
  CLIENT_ERROR_LIMITS as LIMIT,
  CLIENT_ERROR_TOKEN,
  scrubClientErrorStack,
  scrubClientErrorText,
  type ClientErrorBatch,
  type ClientErrorKind,
  type ClientErrorReport,
} from '@kurda/shared';

/**
 * Collects crashes and sends them to the API in small batches (POST /client-errors; shapes and limits in
 * `@kurda/shared` client-errors.ts). It must never make things worse:
 *
 * - No loops: nothing here throws, and a failed request is dropped rather than reported.
 * - No floods: a burst of identical errors is one report with a count, sent once per launch; reports wait a few
 *   seconds to batch, batches are spaced out, and a launch sends only a handful. The server rate-limits too.
 * - No personal data: only the error, the route name and the build, each sanitised and truncated here; no token
 *   and no device id.
 */

export interface ReporterOptions {
  /** Off in development, where the error is on the screen already. */
  enabled: boolean;
  /** Delivers one batch; whatever it answers or throws is ignored. */
  send: (batch: ClientErrorBatch) => Promise<unknown>;
  /** The platform and the build, read when a batch is made. */
  about: () => Omit<ClientErrorBatch, 'reports'>;
  /** How long the first report waits for others to travel with it. */
  batchDelayMs?: number;
  /** The least time between two batches. */
  minGapMs?: number;
  /** Batches one launch may send. */
  maxBatches?: number;
  now?: () => number;
}

export interface CaptureContext {
  kind: ClientErrorKind;
  /** The app is about to close because of it. */
  fatal: boolean;
  /** Which components were rendering, for a render that threw. */
  componentStack?: string;
}

export const REPORT_BATCH_DELAY_MS = 4_000;
export const REPORT_MIN_GAP_MS = 30_000;
export const REPORT_MAX_BATCHES = 5;

export class CrashReporter {
  private readonly options: Required<ReporterOptions>;
  /** Waiting to be sent, one per distinct error. */
  private readonly pending = new Map<string, ClientErrorReport>();
  /** Errors already sent this launch: a repeat adds nothing the first did not say. */
  private readonly sent = new Set<string>();
  private screen: string | undefined;
  private batches = 0;
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(options: ReporterOptions) {
    this.options = {
      batchDelayMs: REPORT_BATCH_DELAY_MS,
      minGapMs: REPORT_MIN_GAP_MS,
      maxBatches: REPORT_MAX_BATCHES,
      now: Date.now,
      ...options,
    };
  }

  get enabled(): boolean {
    return this.options.enabled;
  }

  /** The current route, for later reports; anything but a route name is ignored. */
  noteScreen(name: string | undefined): void {
    this.screen = name && CLIENT_ERROR_TOKEN.test(name) ? name.slice(0, LIMIT.screen) : undefined;
  }

  /** Remember an error for the next batch. Never throws, whatever it is given. */
  capture(error: unknown, context: CaptureContext): void {
    if (!this.options.enabled) return;
    try {
      const report = buildReport(error, context, this.screen);
      const key = fingerprint(report);
      if (this.sent.has(key)) return;
      const same = this.pending.get(key);
      if (same) {
        same.count = Math.min(same.count + 1, LIMIT.count);
        same.fatal = same.fatal || report.fatal;
        return;
      }
      // A batch is full: the rest of this burst is very likely the same failure seen from elsewhere.
      if (this.pending.size >= LIMIT.reports) return;
      this.pending.set(key, report);
      this.schedule();
    } catch {
      // A report that cannot be made is not worth a second error.
    }
  }

  /**
   * Send what is queued now without waiting to batch, for an error about to close the app. Resolves when answered
   * or failed; never rejects.
   */
  flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inFlight) return this.inFlight;
    if (this.pending.size === 0) return Promise.resolve();
    if (this.batches >= this.options.maxBatches) {
      this.pending.clear();
      return Promise.resolve();
    }
    let batch: ClientErrorBatch;
    try {
      batch = fitBatch({ ...this.options.about(), reports: [...this.pending.values()] });
    } catch {
      this.pending.clear();
      return Promise.resolve();
    }
    for (const key of this.pending.keys()) this.sent.add(key);
    this.pending.clear();
    this.batches += 1;
    this.lastSentAt = this.options.now();
    this.inFlight = (async () => {
      try {
        await this.options.send(batch);
      } catch {
        // Dropped: a failed report is neither retried nor reported, or a bad network would produce reports of reports.
      }
    })().finally(() => {
      this.inFlight = null;
      if (this.pending.size > 0) this.schedule();
    });
    return this.inFlight;
  }

  private schedule(): void {
    if (this.timer !== null || this.inFlight) return;
    const wait = Math.max(this.options.batchDelayMs, this.lastSentAt + this.options.minGapMs - this.options.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, wait);
  }
}

/** React Native's `ErrorUtils`, which holds the handler for errors nothing else caught. */
export interface ErrorUtilsLike {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

/** How long a fatal error's report may delay the app closing: enough to send on a fair connection. */
export const FATAL_REPORT_WAIT_MS = 1_500;

/**
 * Wrap the global handler: capture every uncaught error, then pass it to the previous handler. A fatal error
 * closes the app once passed on, so its report gets a moment to leave first.
 */
export function installGlobalErrorHandler(reporter: CrashReporter, errorUtils: ErrorUtilsLike | undefined, fatalWaitMs = FATAL_REPORT_WAIT_MS): void {
  if (!errorUtils || !reporter.enabled) return;
  const previous = errorUtils.getGlobalHandler();
  let closing = false;
  errorUtils.setGlobalHandler((error, isFatal) => {
    reporter.capture(error, { kind: 'uncaught', fatal: isFatal === true });
    if (isFatal !== true) {
      previous(error, isFatal);
      return;
    }
    // Already on its way down: this one is reported, and the first is the one the app closes with.
    if (closing) return;
    closing = true;
    let handed = false;
    const handOn = () => {
      if (handed) return;
      handed = true;
      previous(error, isFatal);
    };
    setTimeout(handOn, fatalWaitMs);
    void reporter.flush().then(handOn, handOn);
  });
}

/** What a thrown value says, as a report may carry it. */
function buildReport(error: unknown, context: CaptureContext, screen: string | undefined): ClientErrorReport {
  const e = error instanceof Error ? error : null;
  // A thrown object can be anything, a server response included, so only its type is reported.
  const said = e ? String(e.message ?? '') : typeof error === 'string' ? error : `a value of type ${error === null ? 'null' : typeof error} was thrown`;
  const report: ClientErrorReport = {
    kind: context.kind,
    fatal: context.fatal,
    message: scrubClientErrorText(said, LIMIT.message),
    count: 1,
  };
  if (e?.name) report.name = scrubClientErrorText(String(e.name), LIMIT.name);
  if (typeof e?.stack === 'string' && e.stack) report.stack = scrubClientErrorStack(e.stack, LIMIT.stack);
  if (context.componentStack) report.componentStack = scrubClientErrorStack(context.componentStack, LIMIT.componentStack);
  if (screen) report.screen = screen;
  return report;
}

/** Errors are the same when they have the same type, message and throw site. */
function fingerprint(report: ClientErrorReport): string {
  const top = report.stack?.split('\n').find((line) => line.startsWith('at ')) ?? '';
  return [report.kind, report.name ?? '', report.message, top].join('|');
}

/** How many bytes a string takes as UTF-8, which is what the server's body limit counts. */
function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Shrink the batch until the server accepts it: drop the last reports first, then the remaining one's stacks.
 * Non-Latin text takes two or three bytes per character, so a batch within every length limit can still exceed
 * the body limit.
 */
export function fitBatch(batch: ClientErrorBatch, maxBytes = CLIENT_ERROR_BODY_MAX): ClientErrorBatch {
  const fitted = { ...batch, reports: [...batch.reports] };
  while (fitted.reports.length > 1 && utf8Length(JSON.stringify(fitted)) > maxBytes) fitted.reports.pop();
  const last = fitted.reports[0];
  if (last && utf8Length(JSON.stringify(fitted)) > maxBytes) {
    const bare = { ...last };
    delete bare.stack;
    delete bare.componentStack;
    fitted.reports = [bare];
  }
  return fitted;
}
