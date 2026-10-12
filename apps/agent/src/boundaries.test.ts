import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { v2 as dp } from "@muonhub/data-provider";
import { v2 } from "@muonhub/shared";
import { createSetupApi } from "./panel/setup.js";
import { AuthManager } from "./sync/auth.js";
import { createMemoryCredentialStore } from "./sync/credentials.js";
import { Reporter } from "./reporter.js";
import { memoryLogger } from "./log.js";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") && !p.includes("/testing/") ? [p] : [];
  });
}

const code = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("CA8: provider boundary and no admin keys", () => {
  const files = sources(new URL("./", import.meta.url).pathname);
  it("imports no Firebase SDK; backend access goes through @muonhub/data-provider", () => {
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(
        /from\s+["'](firebase|firebase-admin|@firebase|@google-cloud)[/"']/,
      );
      expect(text, f).not.toMatch(/require\(["'](firebase|firebase-admin)/);
    }
  });
  it("handles no service account or admin credentials", () => {
    for (const f of files) {
      const text = code(readFileSync(f, "utf8"));
      expect(text, f).not.toMatch(
        /service[_-]?account|private_key|GOOGLE_APPLICATION_CREDENTIALS|client_email|applicationDefault/i,
      );
    }
  });
  it("runs external commands only through execFile, never a shell", () => {
    for (const f of files) {
      const text = code(readFileSync(f, "utf8"));
      for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']node:child_process["']/g)) {
        const names = (m[1] ?? "")
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean);
        expect(names, f).toEqual(["execFile"]);
      }
      expect(text, f).not.toMatch(/shell\s*:\s*true/);
    }
  });
});

describe("setup wizard backend (FR15)", () => {
  async function wizard() {
    const provider = dp.createMemoryProviderV2();
    const reporter = new Reporter(memoryLogger());
    const credentials = createMemoryCredentialStore();
    let tokenIssued = false;
    const auth = new AuthManager(
      provider,
      {
        getRefreshToken: () => (tokenIssued ? "rt-1" : null),
        signInWithRefreshToken: () => Promise.reject(new Error("unused")),
      },
      credentials,
      reporter,
    );
    await provider.createAccount("owner@example.org", "pw-pw-pw-1");
    await provider.signOut();
    const dir = mkdtempSync(join(tmpdir(), "mh-wiz-"));
    const bindingPath = join(dir, "binding.json");
    let bound = false;
    const api = createSetupApi({
      provider,
      auth,
      deviceTypes: v2.BUILTIN_DEVICE_TYPES,
      bindingPath,
      onBound: () => (bound = true),
    });
    return {
      api,
      provider,
      credentials,
      bindingPath,
      dir,
      bound: () => bound,
      issueToken: () => (tokenIssued = true),
    };
  }
  const fields = {
    stationName: "USFQ lab",
    city: "Quito",
    countryCode: "ec",
    lat: "-0.19",
    lon: "-78.43",
    altitudeM: "2850",
    timezone: "America/Guayaquil",
    visibility: "private",
    precision: "city",
    deviceType: "munra",
    label: "MuNRa",
    areaCm2: "25",
    thicknessCm: "1",
    material: "plastic scintillator",
    orientation: "horizontal",
  };

  it("signs in (password never stored; only the refresh token is kept), creates station, device and stream, and writes the binding", async () => {
    const w = await wizard();
    w.issueToken();
    await w.api.signIn("owner@example.org", "pw-pw-pw-1");
    expect(w.credentials.value).toBe("rt-1");
    expect(JSON.stringify(w.credentials.value)).not.toContain("pw-pw");
    const res = await w.api.bind(fields);
    expect(res.message).toMatch(/Saved/);
    expect(w.bound()).toBe(true);
    const binding = JSON.parse(readFileSync(w.bindingPath, "utf8")) as {
      streamId: string;
      stationId: string;
      deviceId: string;
    };
    expect(v2.StreamIdSchema.safeParse(binding.streamId).success).toBe(true);
    expect((statSync(w.bindingPath).mode & 0o777).toString(8)).toBe("600");
    const station = await w.provider.getStation(binding.stationId);
    expect(station?.visibility).toBe("private");
    expect(station?.location.countryCode).toBe("EC");
    expect((await w.provider.getStream(binding.streamId))?.deviceId).toBe(binding.deviceId);
    expect(existsSync(`${w.bindingPath}.tmp`)).toBe(false);
    rmSync(w.dir, { recursive: true, force: true });
  });

  it("requires a visibility and a precision: there is no default", async () => {
    const w = await wizard();
    await w.api.signIn("owner@example.org", "pw-pw-pw-1");
    await expect(w.api.bind({ ...fields, visibility: "" })).rejects.toThrow(/visibility/i);
    await expect(w.api.bind({ ...fields, precision: "" })).rejects.toThrow(/precision/i);
    expect(existsSync(w.bindingPath)).toBe(false);
    rmSync(w.dir, { recursive: true, force: true });
  });

  it("refuses to bind before signing in", async () => {
    const w = await wizard();
    await expect(w.api.bind(fields)).rejects.toThrow(/sign in/i);
    rmSync(w.dir, { recursive: true, force: true });
  });
});
