/**
 * Local web panel (spec 0087 FR15): HTTP on 127.0.0.1 only. Every request validates the `Host`
 * header (blocks DNS rebinding); a local access token (0600 file, shown only by
 * `muonhub-agent panel-url`) is exchanged once for an HttpOnly/SameSite=Strict session cookie and
 * never appears in URLs afterwards or in logs; state-changing requests also validate `Origin` and
 * carry a per-session CSRF token. The panel never displays secrets. It is isolated from acquisition:
 * a crash or `EADDRINUSE` is logged, shown in status, and retried — recording never stops.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Reporter } from "../reporter.js";
import type { AgentStatus } from "../status.js";
import type { OutboxItem } from "../store/types.js";
import { esc, page, statusBody } from "./html.js";
import type { SetupApi } from "./setup.js";

const MAX_BODY = 16 * 1024;
const SESSION_MS = 12 * 3_600_000;
const COOKIE = "mh_session";

export interface PanelDeps {
  port: number;
  host?: string;
  /** Listening socket passed by systemd (socket activation); when set, `port`/`host` are not bound. */
  listenFd?: number | null;
  /** Delay before answering a wrong token, per connection (default 500 ms). No global lockout. */
  failDelayMs?: number;
  token: string;
  reporter: Reporter;
  status: () => AgentStatus;
  outbox: { parked(): OutboxItem[]; retryAll(): number };
  setup: SetupApi | null;
  retryMs?: number;
  now?: () => number;
}

export type PanelState = "off" | "listening" | "port busy" | "error";

interface Session {
  csrf: string;
  expires: number;
}

function sha(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha(a), sha(b));
}

export class PanelServer {
  private server: Server | null = null;
  private retry: NodeJS.Timeout | null = null;
  private stopped = false;
  private readonly sessions = new Map<string, Session>();
  state: PanelState = "off";

  constructor(private readonly d: PanelDeps) {}

  get port(): number {
    const a = this.server?.address();
    return typeof a === "object" && a !== null ? a.port : this.d.port;
  }

  start(): void {
    this.stopped = false;
    this.listen();
  }

  private listen(): void {
    if (this.stopped) return;
    const server = createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => {
        this.d.reporter.report("error", "panel-error", "panel request failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        if (!res.headersSent) this.send(res, 500, "text/plain", "Internal error");
        else res.end();
      });
    });
    server.on("clientError", (_e, socket) => socket.destroy());
    server.on("error", (error: NodeJS.ErrnoException) => {
      server.close();
      if (this.server === server) this.server = null;
      this.state = error.code === "EADDRINUSE" ? "port busy" : "error";
      this.d.reporter.raise(
        "panel-port-busy",
        `panel could not listen on port ${String(this.d.port)}: ${error.code ?? error.message}; will retry`,
      );
      this.scheduleRetry();
    });
    const onListening = (): void => {
      this.server = server;
      this.state = "listening";
      this.d.reporter.clear("panel-port-busy");
    };
    if (this.d.listenFd !== undefined && this.d.listenFd !== null) {
      server.listen({ fd: this.d.listenFd }, onListening);
    } else {
      server.listen(this.d.port, this.d.host ?? "127.0.0.1", onListening);
    }
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retry !== null) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.listen();
    }, this.d.retryMs ?? 10_000);
    this.retry.unref();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    await new Promise<void>((resolve) => {
      if (this.server === null) resolve();
      else {
        this.server.closeAllConnections();
        this.server.close(() => resolve());
      }
    });
    this.server = null;
    this.state = "off";
  }

  // ── request handling ────────────────────────────────────────────────────────────────────────

  private send(
    res: ServerResponse,
    code: number,
    type: string,
    body: string,
    extra: Record<string, string> = {},
  ): void {
    res.writeHead(code, {
      "content-type": `${type}; charset=utf-8`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      ...extra,
    });
    res.end(body);
  }

  private hostOk(req: IncomingMessage): boolean {
    const host = req.headers.host ?? "";
    const p = String(this.port);
    return host === `127.0.0.1:${p}` || host === `localhost:${p}`;
  }

  private originOk(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    const p = String(this.port);
    return origin === `http://127.0.0.1:${p}` || origin === `http://localhost:${p}`;
  }

  private cookieSession(req: IncomingMessage): { id: string; s: Session } | null {
    const raw = req.headers.cookie ?? "";
    for (const part of raw.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === COOKIE) {
        const id = v.join("=");
        const s = this.sessions.get(id);
        if (s !== undefined && s.expires > (this.d.now ?? Date.now)()) return { id, s };
        this.sessions.delete(id);
      }
    }
    return null;
  }

  private async readForm(req: IncomingMessage): Promise<URLSearchParams | null> {
    if (!(req.headers["content-type"] ?? "").startsWith("application/x-www-form-urlencoded"))
      return null;
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > MAX_BODY) return null;
      chunks.push(c as Buffer);
    }
    return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.hostOk(req)) {
      this.send(res, 403, "text/plain", "Forbidden: unexpected Host");
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    const method = req.method ?? "GET";

    // Token exchange: the only route that works without a session.
    if (url.pathname === "/auth" && method === "GET") {
      await this.exchange(url, res);
      return;
    }
    const session = this.cookieSession(req);
    if (session === null) {
      this.send(
        res,
        401,
        "text/html",
        page(
          "Sign in to the panel",
          "<p>Open the address printed by <code>sudo muonhub-agent panel-url</code>.</p>",
        ),
      );
      return;
    }

    if (method === "POST") {
      if (!this.originOk(req)) {
        this.send(res, 403, "text/plain", "Forbidden: cross-origin request");
        return;
      }
      const form = await this.readForm(req);
      if (form === null) {
        this.send(res, 400, "text/plain", "Bad request");
        return;
      }
      const csrf = form.get("csrf") ?? "";
      if (!safeEqual(csrf, session.s.csrf)) {
        this.send(res, 403, "text/plain", "Forbidden: missing or wrong CSRF token");
        return;
      }
      await this.post(url.pathname, form, session.s, res);
      return;
    }
    if (method !== "GET") {
      this.send(res, 405, "text/plain", "Method not allowed");
      return;
    }
    await this.get(url.pathname, session.s, res);
  }

  private async exchange(url: URL, res: ServerResponse): Promise<void> {
    const now = (this.d.now ?? Date.now)();
    const token = url.searchParams.get("token") ?? "";
    if (!safeEqual(token, this.d.token)) {
      // A short delay per connection slows guessing without a global lockout, which any local
      // process could otherwise use to keep the administrator out of the panel.
      await new Promise<void>((r) => setTimeout(r, this.d.failDelayMs ?? 500));
      this.send(res, 403, "text/plain", "Forbidden");
      return;
    }
    const id = randomBytes(24).toString("hex");
    this.sessions.set(id, { csrf: randomBytes(24).toString("hex"), expires: now + SESSION_MS });
    // The token disappears from the address bar: redirect to a clean URL.
    res.writeHead(303, {
      location: "/",
      "set-cookie": `${COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${String(SESSION_MS / 1000)}`,
      "cache-control": "no-store",
    });
    res.end();
  }

  private async get(path: string, s: Session, res: ServerResponse): Promise<void> {
    if (path === "/") {
      this.send(res, 200, "text/html", page("Status", statusBody(this.d.status()), true));
    } else if (path === "/status.json") {
      this.send(res, 200, "application/json", JSON.stringify(this.d.status()));
    } else if (path === "/outbox") {
      const items = this.d.outbox.parked();
      const rows = items
        .map(
          (i) =>
            `<tr><td>${esc(i.kind)}</td><td>${esc(new Date(i.ts).toISOString())}</td><td>${esc(i.lastError ?? "")}</td><td>${esc(i.attempts)}</td></tr>`,
        )
        .join("");
      this.send(
        res,
        200,
        "text/html",
        page(
          "Outbox",
          `<h2>Parked items (${String(items.length)})</h2>${items.length === 0 ? '<p class="ok">None.</p>' : `<table><tr><th>Kind</th><th>Time</th><th>Reason</th><th>Attempts</th></tr>${rows}</table>`}
<form method="post" action="/outbox/retry"><input type="hidden" name="csrf" value="${esc(s.csrf)}"><button>Retry all parked items</button></form>
<p><a href="/outbox/export">Export parked items (JSON lines)</a></p>`,
        ),
      );
    } else if (path === "/outbox/export") {
      const lines = this.d.outbox.parked().map((i) =>
        JSON.stringify({
          kind: i.kind,
          ts: i.ts,
          rev: i.rev,
          sessionId: i.sessionId,
          error: i.lastError,
          payload: JSON.parse(i.payload) as unknown,
        }),
      );
      this.send(
        res,
        200,
        "application/x-ndjson",
        lines.join("\n") + (lines.length > 0 ? "\n" : ""),
        {
          "content-disposition": 'attachment; filename="parked-items.jsonl"',
        },
      );
    } else if (path === "/setup") {
      await this.setupPage(s, res, null);
    } else {
      this.send(res, 404, "text/plain", "Not found");
    }
  }

  private async post(
    path: string,
    form: URLSearchParams,
    s: Session,
    res: ServerResponse,
  ): Promise<void> {
    if (path === "/outbox/retry") {
      const n = this.d.outbox.retryAll();
      this.send(
        res,
        200,
        "text/html",
        page(
          "Outbox",
          `<p>${esc(n)} parked items queued for retry.</p><p><a href="/outbox">Back</a></p>`,
        ),
      );
      return;
    }
    const setup = this.d.setup;
    if (setup === null) {
      this.send(res, 404, "text/plain", "Setup is not available");
      return;
    }
    try {
      if (path === "/setup/signin") {
        await setup.signIn(form.get("email") ?? "", form.get("password") ?? "");
        await this.setupPage(s, res, "Signed in. The password was used once and is not stored.");
      } else if (path === "/setup/signout") {
        await setup.signOut();
        await this.setupPage(s, res, "Signed out; the stored credential was deleted.");
      } else if (path === "/setup/bind") {
        const result = await setup.bind(Object.fromEntries(form.entries()));
        this.send(
          res,
          200,
          "text/html",
          page(
            "Setup complete",
            `<p class="ok">${esc(result.message)}</p><p><a href="/">Status</a></p>`,
          ),
        );
      } else {
        this.send(res, 404, "text/plain", "Not found");
      }
    } catch (error) {
      // Safe messages only: provider errors already carry text meant for users.
      const msg = error instanceof Error ? error.message : "Unexpected error.";
      await this.setupPage(s, res, null, msg);
    }
  }

  private async setupPage(
    s: Session,
    res: ServerResponse,
    notice: string | null,
    error?: string,
  ): Promise<void> {
    const setup = this.d.setup;
    if (setup === null) {
      this.send(
        res,
        200,
        "text/html",
        page(
          "Setup",
          "<p>Cloud sync is not configured on this machine (no Firebase settings in the agent configuration). The agent records locally.</p>",
        ),
      );
      return;
    }
    const csrf = `<input type="hidden" name="csrf" value="${esc(s.csrf)}">`;
    const msg = `${notice === null ? "" : `<p class="ok">${esc(notice)}</p>`}${error === undefined ? "" : `<p class="err">${esc(error)}</p>`}`;
    const user = setup.currentEmail();
    if (user === null) {
      this.send(
        res,
        200,
        "text/html",
        page(
          "Setup - sign in",
          `${msg}<p>Sign in with the MuonHub account this machine will use (a dedicated agent account that the station owner added as an editor is recommended).</p>
<form method="post" action="/setup/signin">${csrf}
<label>Email <input name="email" type="email" autocomplete="username" required></label>
<label>Password <input name="password" type="password" autocomplete="current-password" required></label>
<button>Sign in</button></form>`,
        ),
      );
      return;
    }
    let stations: { id: string; name: string }[];
    try {
      stations = await setup.listStations();
    } catch {
      stations = [];
    }
    const types = setup.deviceTypes
      .map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`)
      .join("");
    const stationOptions = stations
      .map((st) => `<option value="${esc(st.id)}">${esc(st.name)}</option>`)
      .join("");
    this.send(
      res,
      200,
      "text/html",
      page(
        "Setup",
        `${msg}<p>Signed in as <b>${esc(user)}</b>.</p>
<form method="post" action="/setup/signout">${csrf}<button>Sign out and forget the credential</button></form>
<form method="post" action="/setup/bind">${csrf}
<h2>Station</h2>
<label>Existing station <select name="stationId"><option value="">- create a new station -</option>${stationOptions}</select></label>
<p>Or create a new one:</p>
<label>Name <input name="stationName" maxlength="120"></label>
<label>City <input name="city" maxlength="120"></label>
<label>Country code (ISO, e.g. EC) <input name="countryCode" maxlength="2" pattern="[A-Za-z]{2}"></label>
<label>Latitude <input name="lat" inputmode="decimal"></label>
<label>Longitude <input name="lon" inputmode="decimal"></label>
<label>Altitude (m) <input name="altitudeM" inputmode="decimal"></label>
<label>Time zone (IANA, e.g. America/Guayaquil) <input name="timezone"></label>
<label>Visibility (required, no default) <select name="visibility" required><option value="">choose...</option><option value="private">private</option><option value="institution">institution</option><option value="public">public</option></select></label>
<label>Public location precision <select name="precision"><option value="">choose...</option><option value="hidden">hidden</option><option value="country">country</option><option value="city">city</option><option value="approximate">approximate</option><option value="exact">exact</option></select></label>
<h2>Device</h2>
<label>Device type <select name="deviceType" required>${types}</select></label>
<label>Label <input name="label" maxlength="120" required></label>
<label>Active area (cm2) <input name="areaCm2" inputmode="decimal" value="25"></label>
<label>Thickness (cm) <input name="thicknessCm" inputmode="decimal" value="1"></label>
<label>Material <input name="material" value="plastic scintillator"></label>
<label>Orientation <select name="orientation"><option>horizontal</option><option>vertical</option><option>tilted</option></select></label>
<p><button>Create the stream and save</button></p></form>`,
      ),
    );
  }
}
