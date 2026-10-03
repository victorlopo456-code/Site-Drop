import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, sep, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";

// TanStack's default vite preview expects dist/server/server.js. This project
// builds the Vercel preset instead, so serve its actual static files and handler.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const host = argument("--host", "127.0.0.1");
const port = Number(argument("--port", process.env.PORT || "4173"));
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid preview port.");
const output = resolve(".vercel/output");
const staticRoot = resolve(output, "static");
const entry = resolve(output, "functions/__server.func/index.mjs");
if (!existsSync(entry)) throw new Error("Run npm run build before npm run preview.");
const handler = (await import(pathToFileURL(entry).href)).default;
const types = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".html": "text/html",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    if (url.pathname === "/_vercel/insights/script.js") {
      response.writeHead(200, { "Content-Type": "application/javascript" });
      response.end("/* Vercel analytics is provided by the hosting platform. */");
      return;
    }
    const file = resolve(staticRoot, `.${decodeURIComponent(url.pathname)}`);
    if (["GET", "HEAD"].includes(request.method) && file.startsWith(staticRoot + sep)) {
      const info = await stat(file).catch(() => null);
      if (info?.isFile()) {
        response.writeHead(200, {
          "Content-Type": types[extname(file)] || "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
        });
        response.end(request.method === "HEAD" ? undefined : await readFile(file));
        return;
      }
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item != null) headers.append(key, item);
      }
    }
    const webRequest = new Request(url, {
      method: request.method,
      headers,
      ...(!["GET", "HEAD"].includes(request.method)
        ? { body: Readable.toWeb(request), duplex: "half" }
        : {}),
    });
    const webResponse = await handler.fetch(webRequest);
    webResponse.headers.forEach((value, key) => response.setHeader(key, value));
    const cookies = webResponse.headers.getSetCookie();
    if (cookies.length) response.setHeader("Set-Cookie", cookies);
    response.writeHead(webResponse.status);
    if (webResponse.body && request.method !== "HEAD") {
      Readable.fromWeb(webResponse.body)
        .on("error", () => response.destroy())
        .pipe(response);
    } else response.end();
  } catch (error) {
    console.error(error);
    if (!response.headersSent) response.writeHead(500, { "Content-Type": "text/plain" });
    response.end("Preview error");
  }
});
server.listen(port, host, () => console.log(`Preview: http://${host}:${port}`));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
