/** Client side of the control socket (`muonhub-agent status`). */
import { request } from "node:http";

export function fetchControlStatus(socketPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(
      { socketPath, path: "/status.json", method: "GET", timeout: 5000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`the daemon answered ${String(res.statusCode)}`));
            return;
          }
          try {
            resolve(JSON.stringify(JSON.parse(Buffer.concat(chunks).toString("utf8")), null, 2));
          } catch (error) {
            reject(error as Error);
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("the daemon did not answer in time")));
    req.on("error", (error: NodeJS.ErrnoException) =>
      reject(
        new Error(
          error.code === "ENOENT" || error.code === "ECONNREFUSED"
            ? `cannot reach the daemon at ${socketPath} (is it running? are you in group muonhub or root?)`
            : error.code === "EACCES"
              ? `no permission for ${socketPath}: run with sudo or add yourself to group muonhub`
              : error.message,
        ),
      ),
    );
    req.end();
  });
}
