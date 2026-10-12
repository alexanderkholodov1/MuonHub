/**
 * Disk space guard (spec 0087 FR9): below the low threshold the status shows "disk low" and the
 * error is logged BEFORE writes can fail; below the hard floor acquisition stops cleanly
 * (`storageError`) instead of crash-looping, and resumes only when space is available again.
 */
import { statfs } from "node:fs/promises";

export interface DiskProbe {
  freeBytes(): Promise<number>;
}

export function createStatfsProbe(dir: string): DiskProbe {
  return {
    async freeBytes() {
      const s = await statfs(dir);
      return Number(s.bavail) * Number(s.bsize);
    },
  };
}

export type DiskLevel = "ok" | "low" | "floor";

export function classifyDisk(free: number, lowBytes: number, floorBytes: number): DiskLevel {
  if (free < floorBytes) return "floor";
  if (free < lowBytes) return "low";
  return "ok";
}
