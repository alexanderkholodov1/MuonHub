/** Read-only access to a public v5 profile over the Realtime Database REST API (GET only). */
import { env } from "./env.js";

async function get(path: string, query = ""): Promise<unknown> {
  const url = `${env.v5Url}/profiles/${encodeURIComponent(env.v5Profile)}/${path}.json${query}`;
  const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`v5 read failed (${String(res.status)}) for ${path}`);
  return (await res.json()) as unknown;
}

export async function listSessionKeys(): Promise<string[]> {
  const data = await get("sessions", "?shallow=true");
  return data !== null && typeof data === "object" ? Object.keys(data).sort() : [];
}

/** Minutes of one session from `startKey` (epoch seconds, inclusive), oldest first. */
export async function readMinutes(
  sessionKey: string,
  startKey: number,
  limit = 2000,
): Promise<Array<[string, unknown]>> {
  const q = `?orderBy=%22%24key%22&startAt=%22${String(startKey)}%22&limitToFirst=${String(limit)}`;
  const data = await get(`sessions/${encodeURIComponent(sessionKey)}/minutes`, q);
  if (data === null || typeof data !== "object") return [];
  return Object.entries(data as Record<string, unknown>).sort(([a], [b]) => Number(a) - Number(b));
}
