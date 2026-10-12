/**
 * One graceful-shutdown path for signals and for "restart requested after a binding": the daemon is
 * stopped first (which flushes buffered raw lines and open minutes) and only then the process exits.
 * A hard timer guarantees the exit even when `stop()` hangs.
 */
export interface ShutdownOptions {
  stop: () => Promise<void>;
  exit: (code: number) => void;
  log: (line: string) => void;
  hardTimeoutMs?: number;
}

export function createShutdown(o: ShutdownOptions): (reason: string) => void {
  let stopping = false;
  return (reason) => {
    if (stopping) return;
    stopping = true;
    o.log(`${reason}; stopping`);
    setTimeout(() => o.exit(0), o.hardTimeoutMs ?? 10_000).unref();
    o.stop()
      .catch((e: unknown) => o.log(`stop failed: ${String(e)}`))
      .finally(() => o.exit(0));
  };
}
