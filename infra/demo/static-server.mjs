// Serves the web app's static export with clean URLs (/signin → signin.html) and a real 404.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.env.WEB_ROOT ?? "apps/web/out");
const host = process.env.DEMO_HOST ?? "127.0.0.1";
const port = Number(process.env.WEB_PORT ?? "8085");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".map": "application/json",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};
const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  const safe = normalize(join(root, path));
  if (!safe.startsWith(root)) {
    res.writeHead(400).end();
    return;
  }
  const candidates = [safe, `${safe}.html`, join(safe, "index.html")];
  const file = candidates.find(isFile);
  const status = file ? 200 : 404;
  const target = file ?? join(root, "404.html");
  res.writeHead(status, {
    "content-type": types[extname(target)] ?? "application/octet-stream",
    "cache-control": "no-cache",
  });
  createReadStream(target).pipe(res);
}).listen(port, host, () => console.log(`serving ${root} on http://${host}:${port}`));
