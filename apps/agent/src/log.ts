/**
 * Logging to stdout (journald). Under systemd (`JOURNAL_STREAM` set) every line carries the
 * `<N>` priority prefix so `journalctl -p err` works; elsewhere it is plain text. Secrets are never
 * logged: callers pass only codes and counts (spec 0087 FR12, FR15).
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const SYSLOG: Record<LogLevel, number> = { debug: 7, info: 6, warn: 4, error: 3 };

export interface Logger {
  log(level: LogLevel, code: string, message: string, data?: Record<string, unknown>): void;
}

export function createLogger(options: {
  level?: LogLevel;
  write?: (line: string) => void;
  journal?: boolean;
}): Logger {
  const min = ORDER[options.level ?? "info"];
  const write = options.write ?? ((line: string) => process.stdout.write(line + "\n"));
  const journal = options.journal ?? process.env["JOURNAL_STREAM"] !== undefined;
  return {
    log(level, code, message, data) {
      if (ORDER[level] < min) return;
      const extra = data === undefined ? "" : " " + safeJson(data);
      const prefix = journal
        ? `<${SYSLOG[level]}>`
        : `${new Date().toISOString()} ${level.toUpperCase()} `;
      write(`${prefix}[${code}] ${message}${extra}`);
    },
  };
}

function safeJson(data: Record<string, unknown>): string {
  try {
    return JSON.stringify(data);
  } catch {
    return "{}";
  }
}

/** A logger that records lines in memory (tests). */
export function memoryLogger(): Logger & {
  lines: {
    level: LogLevel;
    code: string;
    message: string;
    data: Record<string, unknown> | undefined;
  }[];
} {
  const lines: {
    level: LogLevel;
    code: string;
    message: string;
    data: Record<string, unknown> | undefined;
  }[] = [];
  return {
    lines,
    log(level, code, message, data) {
      lines.push({ level, code, message, data });
    },
  };
}
