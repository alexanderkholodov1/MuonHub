/**
 * `panel-url` hands out the panel token, so it must first make sure the process that answers on the
 * panel port is ours. Without socket activation any local user could bind the port while the daemon
 * is down. We map the listening TCP socket to its inode (/proc/net/tcp), find every process holding
 * that inode (/proc/<pid>/fd) and require that all holders run as the service user (the only other
 * accepted holder is pid 1, which keeps the socket under `muonhub-agent-panel.socket`).
 * Needs root to see other users' descriptors, which `panel-url` already requires.
 */
import { readFileSync, readdirSync, readlinkSync } from "node:fs";

export interface ListenerCheck {
  ok: boolean;
  reason: string;
}

function portHex(port: number): string {
  return port.toString(16).toUpperCase().padStart(4, "0");
}

/** Inodes of sockets listening on 127.0.0.1:port (state 0A) in a /proc/net/tcp text. */
export function listeningInodes(procNetTcp: string, port: number): string[] {
  const out: string[] = [];
  for (const line of procNetTcp.split("\n").slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 10 || f[3] !== "0A") continue;
    if (f[1] === `0100007F:${portHex(port)}`) out.push(f[9] as string);
  }
  return out;
}

export function uidOfUser(passwd: string, user: string): number | null {
  for (const line of passwd.split("\n")) {
    const f = line.split(":");
    if (f[0] === user && /^\d+$/.test(f[2] ?? "")) return Number(f[2]);
  }
  return null;
}

export function verifyPanelListener(
  port: number,
  user = "muonhub",
  procRoot = "/proc",
  passwdPath = "/etc/passwd",
): ListenerCheck {
  const uid = uidOfUser(readFileSync(passwdPath, "utf8"), user);
  if (uid === null) return { ok: false, reason: `the service user '${user}' does not exist` };
  const inodes = listeningInodes(readFileSync(`${procRoot}/net/tcp`, "utf8"), port);
  if (inodes.length === 0)
    return { ok: false, reason: `nothing listens on 127.0.0.1:${String(port)}` };
  const wanted = new Set(inodes.map((i) => `socket:[${i}]`));
  let ours = false;
  for (const pid of readdirSync(procRoot).filter((n) => /^\d+$/.test(n))) {
    let holds = false;
    try {
      for (const fd of readdirSync(`${procRoot}/${pid}/fd`)) {
        try {
          if (wanted.has(readlinkSync(`${procRoot}/${pid}/fd/${fd}`))) {
            holds = true;
            break;
          }
        } catch {
          // descriptor closed meanwhile
        }
      }
    } catch {
      continue; // process gone, or not visible
    }
    if (!holds) continue;
    let puid = -1;
    try {
      const m = /^Uid:\s+(\d+)/m.exec(readFileSync(`${procRoot}/${pid}/status`, "utf8"));
      puid = m === null ? -1 : Number(m[1]);
    } catch {
      // unreadable: treated as foreign
    }
    if (puid === uid) ours = true;
    else if (!(pid === "1" && puid === 0)) {
      return {
        ok: false,
        reason: `process ${pid} (uid ${String(puid)}) holds port ${String(port)}, not the '${user}' service`,
      };
    }
  }
  return ours
    ? { ok: true, reason: "" }
    : {
        ok: false,
        reason: `no '${user}' process holds port ${String(port)} (is the service running? could another user hold it?)`,
      };
}
