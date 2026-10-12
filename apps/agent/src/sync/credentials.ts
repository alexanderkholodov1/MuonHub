/**
 * Credential file (spec 0087 FR11): only the refresh token is stored, never the password. The file
 * is CREATED with mode 0600 in the open call (no later chmod), inside the 0700 state directory, via
 * a temporary file and an atomic rename. A file readable by group or others is refused.
 */
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";

export interface CredentialStore {
  /** The stored refresh token, or null when absent. Throws when the file is not private. */
  read(): string | null;
  write(token: string): void;
  clear(): void;
}

export function createFileCredentialStore(path: string): CredentialStore {
  return {
    read() {
      if (!existsSync(path)) return null;
      const mode = statSync(path).mode & 0o777;
      if ((mode & 0o077) !== 0) {
        throw new Error(
          `credential file ${path} has mode ${mode.toString(8)}; refusing to use it (must be 0600)`,
        );
      }
      const text = readFileSync(path, "utf8").trim();
      return text.length === 0 ? null : text;
    },
    write(token) {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const tmp = `${path}.${String(process.pid)}.tmp`;
      // "wx" + mode in the same open call: the file never exists with wider permissions.
      const fd = openSync(tmp, "wx", 0o600);
      try {
        writeSync(fd, token + "\n");
      } finally {
        closeSync(fd);
      }
      renameSync(tmp, path);
    },
    clear() {
      try {
        unlinkSync(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}

/** In-memory store (tests). */
export function createMemoryCredentialStore(initial: string | null = null): CredentialStore & {
  value: string | null;
} {
  const store = {
    value: initial,
    read: () => store.value,
    write: (t: string) => {
      store.value = t;
    },
    clear: () => {
      store.value = null;
    },
  };
  return store;
}
