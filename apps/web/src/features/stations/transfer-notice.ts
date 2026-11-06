const STORAGE_KEY = "muonhub.dismissedTransfers";

function readSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function writeSet(ids: Set<string>): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export function isTransferNoticeDismissed(transferId: string): boolean {
  return readSet().has(transferId);
}

export function dismissTransferNotice(transferId: string): void {
  const next = readSet();
  next.add(transferId);
  writeSet(next);
}
