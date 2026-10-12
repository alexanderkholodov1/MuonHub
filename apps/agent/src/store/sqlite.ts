/**
 * SQLite implementation of {@link LocalStore}. The driver is a thin `SqlDriver` so `node:sqlite`
 * (default) and `better-sqlite3` (fallback, ADR-007) share every statement.
 */
import { createRequire } from "node:module";
import type { v2 } from "@muonhub/shared";
import {
  OUTBOX_KINDS,
  type EventLevel,
  type EventLogRow,
  type FullSessionCounters,
  type LocalStore,
  type MinuteRow,
  type NewOutboxItem,
  type OutboxCounts,
  type OutboxItem,
  type OutboxKind,
  type SessionRow,
} from "./types.js";

type SqlValue = string | number | bigint | Uint8Array | null;
type Row = Record<string, SqlValue>;

export interface SqlDriver {
  readonly name: string;
  exec(sql: string): void;
  run(sql: string, params?: readonly SqlValue[]): { changes: number };
  all(sql: string, params?: readonly SqlValue[]): Row[];
  get(sql: string, params?: readonly SqlValue[]): Row | undefined;
  close(): void;
}

// ── drivers ────────────────────────────────────────────────────────────────────────────────────

interface NodeStmt {
  run(...p: SqlValue[]): { changes: number | bigint };
  all(...p: SqlValue[]): unknown[];
  get(...p: SqlValue[]): unknown;
}
interface NodeDb {
  exec(sql: string): void;
  prepare(sql: string): NodeStmt;
  close(): void;
}

export async function openNodeSqlite(path: string): Promise<SqlDriver> {
  const mod = (await import("node:sqlite")) as unknown as {
    DatabaseSync: new (path: string) => NodeDb;
  };
  const db = new mod.DatabaseSync(path);
  const cache = new Map<string, NodeStmt>();
  const stmt = (sql: string): NodeStmt => {
    let s = cache.get(sql);
    if (s === undefined) {
      s = db.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };
  return {
    name: "node:sqlite",
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => ({ changes: Number(stmt(sql).run(...params).changes) }),
    all: (sql, params = []) => stmt(sql).all(...params) as Row[],
    get: (sql, params = []) => stmt(sql).get(...params) as Row | undefined,
    close: () => db.close(),
  };
}

/** Fallback driver. `better-sqlite3` is an optional install (native build), loaded on demand. */
export function openBetterSqlite(path: string): SqlDriver {
  const require = createRequire(import.meta.url);
  const Database = require("better-sqlite3") as new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): NodeStmt;
    close(): void;
  };
  const db = new Database(path);
  const cache = new Map<string, NodeStmt>();
  const stmt = (sql: string): NodeStmt => {
    let s = cache.get(sql);
    if (s === undefined) {
      s = db.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };
  return {
    name: "better-sqlite3",
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => ({ changes: Number(stmt(sql).run(...params).changes) }),
    all: (sql, params = []) => stmt(sql).all(...params) as Row[],
    get: (sql, params = []) => stmt(sql).get(...params) as Row | undefined,
    close: () => db.close(),
  };
}

// ── schema ─────────────────────────────────────────────────────────────────────────────────────

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS raw_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  device_id TEXT NOT NULL,
  host_ts INTEGER NOT NULL,
  mono_ns TEXT NOT NULL,
  text TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  raw_bytes BLOB,
  flags INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS raw_lines_ts ON raw_lines(host_ts);
CREATE TRIGGER IF NOT EXISTS raw_lines_no_update BEFORE UPDATE ON raw_lines
  BEGIN SELECT RAISE(ABORT, 'raw_lines is append-only (ADR-006)'); END;
CREATE TRIGGER IF NOT EXISTS raw_lines_no_delete BEFORE DELETE ON raw_lines
  BEGIN SELECT RAISE(ABORT, 'raw_lines is append-only (ADR-006)'); END;
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  stream_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  end_reason TEXT,
  body TEXT NOT NULL,
  last_raw_ts INTEGER
);
CREATE INDEX IF NOT EXISTS sessions_stream ON sessions(stream_id, started_at);
CREATE TABLE IF NOT EXISTS minutes (
  stream_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  record TEXT NOT NULL,
  aux TEXT NOT NULL,
  PRIMARY KEY (stream_id, ts)
);
CREATE TABLE IF NOT EXISTS summaries (
  stream_id TEXT NOT NULL,
  hour_start INTEGER NOT NULL,
  rev INTEGER NOT NULL,
  entry TEXT NOT NULL,
  PRIMARY KEY (stream_id, hour_start, rev)
);
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stream_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ts INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0,
  session_id TEXT,
  payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  uploaded_at INTEGER,
  parked_at INTEGER,
  UNIQUE (stream_id, kind, ts, rev)
);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(kind, state, ts, rev, id);
CREATE TABLE IF NOT EXISTS quarantine (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  reason TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  level TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

const str = (v: SqlValue | undefined): string => String(v ?? "");
const num = (v: SqlValue | undefined): number => Number(v ?? 0);

function toOutboxItem(r: Row): OutboxItem {
  return {
    id: num(r["id"]),
    streamId: str(r["stream_id"]),
    kind: str(r["kind"]) as OutboxKind,
    ts: num(r["ts"]),
    rev: num(r["rev"]),
    sessionId:
      r["session_id"] === null || r["session_id"] === undefined ? null : str(r["session_id"]),
    payload: str(r["payload"]),
    state: str(r["state"]) as OutboxItem["state"],
    attempts: num(r["attempts"]),
    nextAttemptAt: num(r["next_attempt_at"]),
    lastError:
      r["last_error"] === null || r["last_error"] === undefined ? null : str(r["last_error"]),
    createdAt: num(r["created_at"]),
    parkedAt: r["parked_at"] === null || r["parked_at"] === undefined ? null : num(r["parked_at"]),
  };
}

export function createSqliteStore(driver: SqlDriver, now: () => number = Date.now): LocalStore {
  driver.exec(SCHEMA);
  let depth = 0;

  const transaction = <T>(fn: () => T): T => {
    if (depth > 0) return fn();
    driver.exec("BEGIN IMMEDIATE");
    depth = 1;
    try {
      const out = fn();
      driver.exec("COMMIT");
      return out;
    } catch (error) {
      try {
        driver.exec("ROLLBACK");
      } catch {
        // the original error is the one worth reporting
      }
      throw error;
    } finally {
      depth = 0;
    }
  };

  const insertOutbox = (item: NewOutboxItem): boolean =>
    driver.run(
      `INSERT OR IGNORE INTO outbox (stream_id, kind, ts, rev, session_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        item.streamId,
        item.kind,
        item.ts,
        item.rev ?? 0,
        item.sessionId ?? null,
        item.payload,
        now(),
      ],
    ).changes > 0;

  return {
    driver: driver.name,
    transaction,

    appendRawLines(rows) {
      if (rows.length === 0) return 0;
      return transaction(() => {
        for (const r of rows) {
          driver.run(
            `INSERT INTO raw_lines (session_id, device_id, host_ts, mono_ns, text, byte_length, raw_bytes, flags)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              r.sessionId,
              r.deviceId,
              r.hostTs,
              r.monotonicNs,
              r.text,
              r.byteLength,
              r.rawBytes ?? null,
              r.flags,
            ],
          );
        }
        const last = rows[rows.length - 1];
        if (last?.sessionId !== null && last?.sessionId !== undefined) {
          driver.run("UPDATE sessions SET last_raw_ts = ? WHERE id = ?", [
            last.hostTs,
            last.sessionId,
          ]);
        }
        return rows.length;
      });
    },
    rawLineCount: () => num(driver.get("SELECT COUNT(*) AS c FROM raw_lines")?.["c"]),
    rawLinesBetween(fromTs, toTs, limit = 100000) {
      return driver
        .all("SELECT * FROM raw_lines WHERE host_ts >= ? AND host_ts < ? ORDER BY id LIMIT ?", [
          fromTs,
          toTs,
          limit,
        ])
        .map((r) => ({
          deviceId: str(r["device_id"]),
          sessionId: r["session_id"] === null ? null : str(r["session_id"]),
          hostTs: num(r["host_ts"]),
          monotonicNs: str(r["mono_ns"]),
          text: str(r["text"]),
          byteLength: num(r["byte_length"]),
          ...(r["raw_bytes"] instanceof Uint8Array ? { rawBytes: r["raw_bytes"] } : {}),
          flags: num(r["flags"]),
        }));
    },

    upsertSession(s) {
      const { id, streamId, startedAt, endedAt, endReason, lastRawTs, ...body } = s;
      driver.run(
        `INSERT INTO sessions (id, stream_id, started_at, ended_at, end_reason, body, last_raw_ts)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET ended_at = excluded.ended_at, end_reason = excluded.end_reason,
           body = excluded.body, last_raw_ts = COALESCE(excluded.last_raw_ts, sessions.last_raw_ts)`,
        [id, streamId, startedAt, endedAt, endReason, JSON.stringify(body), lastRawTs],
      );
    },
    getSession(id) {
      const r = driver.get("SELECT * FROM sessions WHERE id = ?", [id]);
      return r === undefined ? null : toSession(r);
    },
    openSessions() {
      return driver
        .all("SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at")
        .map(toSession);
    },
    listSessions(streamId, limit) {
      return driver
        .all("SELECT * FROM sessions WHERE stream_id = ? ORDER BY started_at DESC LIMIT ?", [
          streamId,
          limit,
        ])
        .map(toSession);
    },

    commitMinute(row, item) {
      return transaction(() => {
        const res = driver.run(
          `INSERT OR IGNORE INTO minutes (stream_id, ts, session_id, record, aux) VALUES (?, ?, ?, ?, ?)`,
          [
            row.streamId,
            row.ts,
            row.sessionId,
            JSON.stringify(row.record),
            JSON.stringify(row.aux),
          ],
        );
        if (res.changes === 0) return "duplicate";
        insertOutbox(item);
        return "stored";
      });
    },
    minutesInRange(streamId, fromTs, toTs) {
      return driver
        .all("SELECT * FROM minutes WHERE stream_id = ? AND ts >= ? AND ts < ? ORDER BY ts", [
          streamId,
          fromTs,
          toTs,
        ])
        .map((r) => ({
          streamId: str(r["stream_id"]),
          ts: num(r["ts"]),
          sessionId: str(r["session_id"]),
          record: JSON.parse(str(r["record"])) as v2.MinuteRecord,
          aux: JSON.parse(str(r["aux"])) as MinuteRow["aux"],
        }));
    },
    minuteCount: (streamId) =>
      num(driver.get("SELECT COUNT(*) AS c FROM minutes WHERE stream_id = ?", [streamId])?.["c"]),

    saveSummary(streamId, hourStart, rev, entry) {
      driver.run(
        "INSERT OR IGNORE INTO summaries (stream_id, hour_start, rev, entry) VALUES (?, ?, ?, ?)",
        [streamId, hourStart, rev, JSON.stringify(entry)],
      );
    },
    latestSummary(streamId, hourStart) {
      const r = driver.get(
        "SELECT rev, entry FROM summaries WHERE stream_id = ? AND hour_start = ? ORDER BY rev DESC LIMIT 1",
        [streamId, hourStart],
      );
      return r === undefined
        ? null
        : { rev: num(r["rev"]), entry: JSON.parse(str(r["entry"])) as v2.HourEntry };
    },

    enqueue: insertOutbox,
    pendingItems(kind, at, limit) {
      return driver
        .all(
          `SELECT * FROM outbox WHERE kind = ? AND state = 'pending' AND next_attempt_at <= ?
           ORDER BY ts, rev, id LIMIT ?`,
          [kind, at, limit],
        )
        .map(toOutboxItem);
    },
    hasPending(kind, sessionId) {
      const r =
        sessionId === undefined
          ? driver.get("SELECT 1 AS x FROM outbox WHERE kind = ? AND state = 'pending' LIMIT 1", [
              kind,
            ])
          : driver.get(
              "SELECT 1 AS x FROM outbox WHERE kind = ? AND state = 'pending' AND session_id = ? LIMIT 1",
              [kind, sessionId],
            );
      return r !== undefined;
    },
    markUploaded(ids, at) {
      if (ids.length === 0) return;
      transaction(() => {
        for (const id of ids) {
          driver.run(
            "UPDATE outbox SET state = 'uploaded', uploaded_at = ?, last_error = NULL WHERE id = ?",
            [at, id],
          );
        }
      });
    },
    markRetry(ids, error, nextAttemptAt) {
      if (ids.length === 0) return;
      transaction(() => {
        for (const id of ids) {
          driver.run(
            "UPDATE outbox SET attempts = attempts + 1, last_error = ?, next_attempt_at = ? WHERE id = ?",
            [error.slice(0, 500), nextAttemptAt, id],
          );
        }
      });
    },
    park(id, reason, at) {
      driver.run(
        "UPDATE outbox SET state = 'parked', last_error = ?, parked_at = ?, attempts = attempts + 1 WHERE id = ?",
        [reason.slice(0, 500), at, id],
      );
    },
    unparkAll() {
      return driver.run(
        "UPDATE outbox SET state = 'pending', parked_at = NULL, next_attempt_at = 0 WHERE state = 'parked'",
      ).changes;
    },
    parkedItems: (limit) =>
      driver
        .all("SELECT * FROM outbox WHERE state = 'parked' ORDER BY parked_at, id LIMIT ?", [limit])
        .map(toOutboxItem),
    outboxCounts() {
      const pending = Object.fromEntries(OUTBOX_KINDS.map((k) => [k, 0])) as Record<
        OutboxKind,
        number
      >;
      for (const r of driver.all(
        "SELECT kind, COUNT(*) AS c FROM outbox WHERE state = 'pending' GROUP BY kind",
      )) {
        pending[str(r["kind"]) as OutboxKind] = num(r["c"]);
      }
      const counts: OutboxCounts = {
        pending,
        parked: num(driver.get("SELECT COUNT(*) AS c FROM outbox WHERE state = 'parked'")?.["c"]),
        uploaded: num(
          driver.get("SELECT COUNT(*) AS c FROM outbox WHERE state = 'uploaded'")?.["c"],
        ),
      };
      return counts;
    },
    oldestParkedAt() {
      const r = driver.get("SELECT MIN(parked_at) AS m FROM outbox WHERE state = 'parked'");
      return r === undefined || r["m"] === null ? null : num(r["m"]);
    },

    quarantine(kind, reason, payload, at) {
      driver.run("INSERT INTO quarantine (at, kind, reason, payload) VALUES (?, ?, ?, ?)", [
        at,
        kind,
        reason.slice(0, 500),
        payload.slice(0, 8192),
      ]);
    },
    quarantineCount: () => num(driver.get("SELECT COUNT(*) AS c FROM quarantine")?.["c"]),

    logEvent(level: EventLevel, code, message, data, at) {
      driver.run("INSERT INTO events_log (at, level, code, message, data) VALUES (?, ?, ?, ?, ?)", [
        at,
        level,
        code,
        message.slice(0, 1000),
        data === undefined ? null : JSON.stringify(data).slice(0, 4000),
      ]);
    },
    recentEvents(limit) {
      return driver
        .all("SELECT * FROM events_log ORDER BY id DESC LIMIT ?", [limit])
        .map((r): EventLogRow => ({
          id: num(r["id"]),
          at: num(r["at"]),
          level: str(r["level"]) as EventLevel,
          code: str(r["code"]),
          message: str(r["message"]),
          data: r["data"] === null ? null : str(r["data"]),
        }));
    },

    getMeta(key) {
      const r = driver.get("SELECT value FROM meta WHERE key = ?", [key]);
      return r === undefined ? null : str(r["value"]);
    },
    setMeta(key, value) {
      driver.run(
        "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
      );
    },
    close: () => driver.close(),
  };
}

function toSession(r: Row): SessionRow {
  const body = JSON.parse(str(r["body"])) as Omit<
    SessionRow,
    "id" | "streamId" | "startedAt" | "endedAt" | "endReason" | "lastRawTs"
  >;
  return {
    id: str(r["id"]),
    streamId: str(r["stream_id"]),
    startedAt: num(r["started_at"]),
    endedAt: r["ended_at"] === null ? null : num(r["ended_at"]),
    endReason: r["end_reason"] === null ? null : (str(r["end_reason"]) as v2.EndReason),
    lastRawTs: r["last_raw_ts"] === null ? null : num(r["last_raw_ts"]),
    ...body,
    counters: body.counters as FullSessionCounters,
  };
}

export async function openLocalStore(options: {
  path: string;
  driver?: "node:sqlite" | "better-sqlite3";
  now?: () => number;
}): Promise<LocalStore> {
  const driver =
    options.driver === "better-sqlite3"
      ? openBetterSqlite(options.path)
      : await openNodeSqlite(options.path);
  return createSqliteStore(driver, options.now);
}
