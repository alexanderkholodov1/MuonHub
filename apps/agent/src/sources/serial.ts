/**
 * `SerialLineSource` (spec 0087 FR2, FR4). Opens a port by its stable `/dev/serial/by-id/...` path
 * with `serialport`; unplugging ends the iteration (the supervisor reports the loss and retries).
 * Backpressure: the port is paused while the consumer is behind, so nothing is dropped.
 */
import { SerialPort } from "serialport";
import type { AgentChunk, AgentLineSource, SourceFactory } from "./types.js";

const HIGH_WATER = 2000;
const LOW_WATER = 200;

export interface SerialSourceOptions {
  path: string;
  baud: number;
}

export function createSerialFactory(options: SerialSourceOptions): SourceFactory {
  return {
    description: options.path,
    baud: options.baud,
    reconnect: true,
    open: () => openSerial(options),
  };
}

function openSerial(options: SerialSourceOptions): Promise<AgentLineSource> {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({
      path: options.path,
      baudRate: options.baud,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      rtscts: false,
      xon: false,
      xoff: false,
      autoOpen: false,
    });
    const queue: AgentChunk[] = [];
    let waiting: ((r: IteratorResult<AgentChunk>) => void) | null = null;
    let failure: Error | null = null;
    let ended = false;
    let paused = false;

    const finish = (): void => {
      if (ended) return;
      ended = true;
      if (waiting !== null) {
        const w = waiting;
        waiting = null;
        w({ value: undefined, done: true });
      }
    };

    port.on("data", (data: Buffer) => {
      const chunk: AgentChunk = {
        bytes: new Uint8Array(data),
        hostReceivedAtMs: Date.now(),
        monotonicNs: process.hrtime.bigint(),
      };
      if (waiting !== null) {
        const w = waiting;
        waiting = null;
        w({ value: chunk, done: false });
      } else {
        queue.push(chunk);
        if (!paused && queue.length > HIGH_WATER) {
          paused = true;
          port.pause();
        }
      }
    });
    port.on("error", (error: Error) => {
      failure = error;
      finish();
    });
    port.on("close", () => finish());

    port.open((error) => {
      if (error) {
        reject(new Error(`cannot open ${options.path}: ${error.message}`, { cause: error }));
        return;
      }
      const source: AgentLineSource = {
        [Symbol.asyncIterator]: () => ({
          next(): Promise<IteratorResult<AgentChunk>> {
            const item = queue.shift();
            if (item !== undefined) {
              if (paused && queue.length < LOW_WATER) {
                paused = false;
                port.resume();
              }
              return Promise.resolve({ value: item, done: false });
            }
            if (failure !== null) {
              const f = failure;
              failure = null;
              return Promise.reject(f);
            }
            if (ended) return Promise.resolve({ value: undefined, done: true });
            return new Promise((res) => {
              waiting = res;
            });
          },
        }),
        close: () =>
          new Promise<void>((res) => {
            if (!port.isOpen) {
              finish();
              res();
              return;
            }
            port.close(() => {
              finish();
              res();
            });
          }),
      };
      resolve(source);
    });
  });
}
