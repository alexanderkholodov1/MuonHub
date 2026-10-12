/** Minimal server-side HTML helpers for the panel. Every dynamic value is escaped. */
import type { AgentStatus } from "../status.js";

export function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `
body{font:15px/1.5 system-ui,sans-serif;margin:0;background:#0b1020;color:#e6e9f2}
main{max-width:920px;margin:0 auto;padding:16px}
h1{font-size:20px} h2{font-size:16px;margin-top:24px;color:#9fb0d9}
table{border-collapse:collapse;width:100%} td,th{padding:4px 8px;border-bottom:1px solid #243055;text-align:left;vertical-align:top}
.ok{color:#6ee7a0}.warn{color:#fbbf24}.err{color:#f87171}
input,select,button{font:inherit;padding:6px 8px;margin:2px 0;background:#141b34;color:#e6e9f2;border:1px solid #33427a;border-radius:6px}
button{cursor:pointer;background:#27407f} label{display:block;margin-top:8px} nav a{color:#9fb0d9;margin-right:12px}
code{background:#141b34;padding:1px 4px;border-radius:4px}
`;

export function page(title: string, body: string, refresh = false): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${refresh ? '<meta http-equiv="refresh" content="5">' : ""}
<title>${esc(title)} - MuonHub agent</title><style>${STYLE}</style></head>
<body><main><nav><a href="/">Status</a><a href="/outbox">Outbox</a><a href="/setup">Setup</a></nav>
<h1>${esc(title)}</h1>${body}</main></body></html>`;
}

const fmtTime = (ms: number | null): string => (ms === null ? "never" : new Date(ms).toISOString());

export function statusBody(s: AgentStatus): string {
  const cls = (bad: boolean): string => (bad ? "err" : "ok");
  const rows: [string, string][] = [
    [
      "Device",
      `<span class="${cls(s.device.label !== "device connected")}">${esc(s.device.label)}</span> (${esc(s.device.description)}${s.device.baud === null ? "" : `, ${esc(s.device.baud)} baud`})${s.device.synthetic ? " <b>synthetic data</b>" : ""}`,
    ],
    ["Device type", `${esc(s.deviceType.id)} v${esc(s.deviceType.version)}`],
    ["Stream", esc(s.streamId ?? "not configured - run the setup wizard")],
    [
      "Session",
      s.session === null
        ? "none"
        : `${esc(s.session.id)} since ${esc(fmtTime(s.session.startedAt))}`,
    ],
    [
      "Last complete minute",
      s.lastMinute === null
        ? "none yet"
        : `${esc(fmtTime(s.lastMinute.ts))}: ${esc(s.lastMinute.n)} events (raw, uncorrected; live time ${esc(s.lastMinute.liveSource)})`,
    ],
    ["Minutes held for the clock", esc(s.heldMinutes)],
    ["Raw lines stored", esc(s.rawLines)],
    [
      "Outbox pending",
      esc(
        Object.entries(s.queue.pending)
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(", "),
      ),
    ],
    [
      "Outbox parked",
      `<span class="${cls(s.queue.parked > 0)}">${esc(s.queue.parked)}</span>${s.parkedAlarm ? ' <b class="err">parked for over 1 h</b>' : ""}`,
    ],
    [
      "Sync",
      `<span class="${cls(!s.sync.signedIn || s.sync.paused)}">${esc(s.sync.label)}</span>; last success ${esc(fmtTime(s.sync.lastSuccessAt))}`,
    ],
    [
      "Last rejected write",
      s.sync.lastRejected === null
        ? "none"
        : `${esc(s.sync.lastRejected.kind)} ${esc(s.sync.lastRejected.code)} at ${esc(fmtTime(s.sync.lastRejected.at))} (total ${esc(s.sync.rejectedCount)})`,
    ],
    [
      "Live batches / heartbeats dropped",
      `${esc(s.live.droppedLiveBatches)} / ${esc(s.live.droppedHeartbeats)}`,
    ],
    [
      "Clock",
      `${s.clock.synchronized ? "synchronized" : "not synchronized"} (${esc(s.clock.source)}, offset ${esc(s.clock.offsetMs.toFixed(1))} ms)${s.clock.holding ? " - holding minutes until synchronized" : ""}`,
    ],
    [
      "Disk",
      `${esc(s.disk.level)}${s.disk.freeBytes === null ? "" : `, ${esc(Math.round(s.disk.freeBytes / 1e6))} MB free`}`,
    ],
    ["Restarts", esc(s.restarts)],
    ["Agent", `${esc(s.version)}, started ${esc(fmtTime(s.startedAt))}`],
    ["v5 bridge", `${esc(s.bridge.state)} (${esc(s.bridge.clients)} clients)`],
    ["Panel", esc(s.panel.state)],
  ];
  const conditions =
    s.conditions.length === 0
      ? '<p class="ok">No active alarms.</p>'
      : `<ul>${s.conditions.map((c) => `<li class="err">${esc(c.message)} (since ${esc(fmtTime(c.since))})</li>`).join("")}</ul>`;
  const counters =
    s.session === null
      ? ""
      : `<h2>Session counters</h2><table>${Object.entries(s.session.counters)
          .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`)
          .join("")}</table>`;
  return `<h2>Alarms</h2>${conditions}<h2>State</h2><table>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join("")}</table>${counters}`;
}
