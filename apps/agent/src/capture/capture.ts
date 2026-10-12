/**
 * `muonhub-agent capture` (spec 0087 FR17): baud scan, hex dump, per-column statistics, proposed
 * device type, and a fixture file for tests. It refuses to run while the daemon holds the same port
 * (it can read the daemon's raw socket instead with `--from-socket`).
 */
import { createConnection } from "node:net";
import { writeFileSync } from "node:fs";
import { SerialPort } from "serialport";
import { analyzeCapture, baudScore, BAUD_CANDIDATES, formatAnalysis, hexDump } from "./analyze.js";

export interface CaptureOptions {
  port?: string;
  baud: "auto" | number;
  minutes: number;
  fromSocket?: string;
  out?: string;
  print: (line: string) => void;
}

function readSerial(path: string, baud: number, ms: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({ path, baudRate: baud, autoOpen: false });
    const chunks: Buffer[] = [];
    port.on("data", (d: Buffer) => chunks.push(d));
    port.open((error) => {
      if (error) {
        reject(error);
        return;
      }
      setTimeout(() => {
        port.close(() => resolve(new Uint8Array(Buffer.concat(chunks))));
      }, ms);
    });
  });
}

function readSocket(path: string, ms: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const sock = createConnection(path);
    sock.on("data", (d) => chunks.push(d));
    sock.on("error", reject);
    setTimeout(() => {
      sock.destroy();
      resolve(new Uint8Array(Buffer.concat(chunks)));
    }, ms);
  });
}

export async function runCapture(o: CaptureOptions): Promise<number> {
  const ms = Math.max(1, o.minutes) * 60_000;
  let bytes: Uint8Array;
  let baud: number | null = null;
  try {
    if (o.fromSocket !== undefined) {
      o.print(`reading the daemon's raw socket ${o.fromSocket} for ${String(o.minutes)} min ...`);
      bytes = await readSocket(o.fromSocket, ms);
    } else {
      if (o.port === undefined) {
        o.print("--port <path under /dev/serial/by-id> is required (or --from-socket)");
        return 2;
      }
      if (o.baud === "auto") {
        let best = { baud: 0, score: -1 };
        for (const b of BAUD_CANDIDATES) {
          o.print(`scanning ${String(b)} baud ...`);
          const sample = await readSerial(o.port, b, 3000);
          const score = baudScore(sample);
          o.print(`  ${String(b)}: score ${score.toFixed(2)} (${String(sample.length)} bytes)`);
          if (score > best.score) best = { baud: b, score };
        }
        if (best.score < 0.5) {
          o.print(
            "no baud rate produced readable text; check the device, the cable, and that it is printing",
          );
          return 1;
        }
        baud = best.baud;
        o.print(`using ${String(baud)} baud`);
      } else {
        baud = o.baud;
      }
      o.print(`capturing ${String(o.minutes)} min from ${o.port} at ${String(baud)} baud ...`);
      bytes = await readSerial(o.port, baud, ms);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    o.print(`cannot read the port: ${msg}`);
    if (/lock|busy|resource|temporarily|EAGAIN/i.test(msg)) {
      o.print(
        "the daemon probably holds this port. Run again with --from-socket /run/muonhub/raw.sock to read its raw mirror.",
      );
    }
    return 1;
  }
  o.print("\nhex dump (first 512 bytes):");
  o.print(hexDump(bytes));
  o.print("");
  o.print(formatAnalysis(analyzeCapture(bytes)));
  if (o.out !== undefined) {
    writeFileSync(o.out, bytes);
    o.print(
      `\nfixture written: ${o.out} (${String(bytes.length)} raw bytes${baud === null ? "" : `, ${String(baud)} baud`})`,
    );
  }
  return 0;
}
