/**
 * Panel access token (spec 0087 FR15): a random token in a 0600 file under the state directory,
 * shown only by `sudo muonhub-agent panel-url` (never printed to the journal). Created in the open
 * call with mode 0600; a file others can read is refused.
 */
import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";

export function loadOrCreatePanelToken(path: string): string {
  if (existsSync(path)) {
    const mode = statSync(path).mode & 0o777;
    if ((mode & 0o077) !== 0) {
      throw new Error(`panel token file ${path} has mode ${mode.toString(8)}; it must be 0600`);
    }
    const token = readFileSync(path, "utf8").trim();
    if (token.length >= 32) return token;
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const token = randomBytes(32).toString("hex");
  const fd = openSync(path, "w", 0o600);
  try {
    writeSync(fd, token + "\n");
  } finally {
    closeSync(fd);
  }
  return token;
}
