import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// src/web/page.ts and dist/web/page.js both sit two levels below the package root.
export const PAGE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "index.html"), "utf8");

const require = createRequire(import.meta.url);
export const ASSETS = new Map([
  ["/assets/marked.js", readFileSync(join(dirname(require.resolve("marked")), "marked.umd.js"), "utf8")],
  ["/assets/purify.js", readFileSync(join(dirname(require.resolve("dompurify")), "purify.min.js"), "utf8")],
  ["/assets/app.js", readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "app.js"), "utf8")],
]);
