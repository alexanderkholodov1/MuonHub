/**
 * Observability (spec 0087 Non-functional): every error-level condition goes to the journal AND to
 * `events_log`, and long-lived conditions (signed out, disk low, device silent, port busy) are held
 * as named "conditions" the status shows until cleared. A failing store never hides a report: the
 * journal line is written first.
 */
import type { LocalStore } from "./store/types.js";
import type { LogLevel, Logger } from "./log.js";

export interface Condition {
  code: string;
  message: string;
  since: number;
}

export class Reporter {
  private readonly conditions = new Map<string, Condition>();
  private store: LocalStore | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  attachStore(store: LocalStore): void {
    this.store = store;
  }

  /** Records an event in the journal and in `events_log`. */
  report(level: LogLevel, code: string, message: string, data?: Record<string, unknown>): void {
    this.logger.log(level, code, message, data);
    if (level === "debug" || this.store === null) return;
    try {
      this.store.logEvent(level, code, message, data, this.now());
    } catch (error) {
      // The store itself is failing (disk full): the journal line above is the record.
      this.logger.log("error", "events-log-failed", "could not write events_log", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Raises a named condition once (logged at error level on the transition only). */
  raise(code: string, message: string, data?: Record<string, unknown>): void {
    if (this.conditions.has(code)) return;
    this.conditions.set(code, { code, message, since: this.now() });
    this.report("error", code, message, data);
  }

  clear(code: string): void {
    if (!this.conditions.delete(code)) return;
    this.report("info", code, `condition cleared: ${code}`);
  }

  has(code: string): boolean {
    return this.conditions.has(code);
  }

  list(): Condition[] {
    return [...this.conditions.values()];
  }
}
