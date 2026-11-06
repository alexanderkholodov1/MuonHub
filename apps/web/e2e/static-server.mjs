// Local-only static export server, including Next's clean URLs and MapLibre's module worker.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../out/", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};
function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

createServer((req, res) => {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const safe = resolve(root, `.${path}`);
  if (safe !== resolve(root) && !safe.startsWith(`${resolve(root)}${sep}`)) {
    res.writeHead(400).end();
    return;
  }
  const file = [safe, `${safe}.html`, join(safe, "index.html")].find(isFile);
  const target = file ?? join(root, "404.html");
  res.writeHead(file ? 200 : 404, {
    "content-type": types[extname(target)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  const stream = createReadStream(target);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}).listen(4173, "127.0.0.1");
