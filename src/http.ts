import { createHash } from "node:crypto";
import { isIP, type LookupFunction } from "node:net";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { Agent, fetch as remoteFetch, type Response } from "undici";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readLimited } from "./response-body.js";
import { createPinnedProxyAgent } from "./proxy.js";
export { readLimited } from "./response-body.js";

const UA =
  process.env.REM_USER_AGENT ||
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
}

/** Reject non-public literals before any connection; DNS is checked in the socket lookup. */
export function assertPublicAddress(address: string): void {
  if (!ipaddr.isValid(address) || ipaddr.process(address).range() !== "unicast") {
    throw new Error(`Blocked non-public address: ${address}`);
  }
}

export function assertPublicUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`Blocked non-http URL: ${u.protocol}`);
  if (u.username || u.password) throw new Error("URL credentials are not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || (!host.includes(".") && !isIP(host))) throw new Error(`Blocked private host: ${host}`);
  if (isIP(host)) assertPublicAddress(host);
  return u;
}

/** One DNS resolution inside the connection lookup, never a second unchecked lookup. */
export const publicLookup: LookupFunction = (hostname, options, callback) => {
  void lookup(hostname, { all: true, verbatim: true }).then(addresses => {
    if (!addresses.length) throw new Error("DNS returned no addresses");
    // Fail closed on mixed public/private records as well as private-only records.
    for (const entry of addresses) assertPublicAddress(entry.address);
    const family = typeof options.family === "number" ? options.family : 0;
    const eligible = family ? addresses.filter(a => a.family === family) : addresses;
    if (!eligible.length) throw new Error("DNS returned no address for the requested family");
    if (options.all) callback(null, eligible);
    else callback(null, eligible[0]!.address, eligible[0]!.family);
  }).catch(err => callback(err instanceof Error ? err : new Error("DNS lookup failed"), "", 0));
};

// Proxy mode is explicit. Never silently trust a proxy's target DNS resolution.
function networkDispatcher() {
  const mode = process.env.REM_NETWORK_MODE ?? "direct";
  if (mode === "direct") return new Agent({ connect: { lookup: publicLookup }, headersTimeout: 20_000, bodyTimeout: 20_000 });
  if (mode !== "pinned-proxy") throw new Error("REM_NETWORK_MODE must be direct or pinned-proxy");
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxy) throw new Error("pinned-proxy mode requires the configured HTTPS_PROXY");
  return createPinnedProxyAgent(proxy, assertPublicAddress);
}
const dispatcher = networkDispatcher();

interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  maxBytes?: number;
  /** Authenticated API calls may not forward credentials to a redirect target. */
  redirects?: "follow" | "error";
}

async function safeFetch(url: string, opts: FetchOptions, signal: AbortSignal): Promise<Response> {
  let current = url;
  let headers = opts.headers;
  for (let hop = 0; hop < 6; hop++) {
    assertPublicUrl(current);
    const res = await remoteFetch(current, { headers, signal, dispatcher, redirect: "manual" });
    const loc = [301, 302, 303, 307, 308].includes(res.status) ? res.headers.get("location") : null;
    if (!loc) return res;
    await res.body?.cancel();
    if (opts.redirects === "error") throw new Error("API redirect blocked");
    const next = new URL(loc, current);
    // Carry only non-sensitive defaults across origins, never arbitrary caller headers.
    if (next.origin !== new URL(current).origin) headers = { "user-agent": UA, accept: "*/*" };
    current = next.href;
  }
  throw new Error("Too many redirects");
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<FetchedPage> {
  const res = await safeFetch(url, {
    ...opts, headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml,*/*;q=0.8", ...opts.headers },
  }, AbortSignal.timeout(opts.timeoutMs ?? 15_000));
  const body = await readLimited(res, opts.maxBytes ?? 3_000_000);
  return { url, finalUrl: res.url || url, status: res.status, contentType: res.headers.get("content-type") ?? "", body };
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<{ status: number; json: T | null }> {
  const res = await fetchText(url, { ...opts, timeoutMs: opts.timeoutMs ?? 20_000, headers: { accept: "application/json", ...opts.headers } });
  let json: T | null = null;
  try { json = JSON.parse(res.body) as T; } catch { /* caller handles invalid JSON */ }
  return { status: res.status, json };
}

// Small disk cache so agents re-calling tools don't re-spend paid API credits.
const CACHE_DIR = process.env.REM_CACHE_DIR || join(homedir(), ".cache", "reverse-engineer-marketing");
const TTL_MS = Number(process.env.REM_CACHE_TTL_HOURS ?? 24) * 3_600_000;

export async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (process.env.REM_NO_CACHE) return fn();
  const file = join(CACHE_DIR, `${createHash("sha256").update(key).digest("hex").slice(0, 32)}.json`);
  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as { at: number; value: T };
    if (Date.now() - raw.at < TTL_MS) return raw.value;
  } catch {
    // miss
  }
  const value = await fn();
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // cache is best-effort
  }
  return value;
}

export function clip(s: unknown, n = 400): string {
  const t = typeof s === "string" ? s : s == null ? "" : String(s);
  const flat = t.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
}

export function median(xs: number[]): number | null {
  const v = xs.filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : Math.round((v[m - 1]! + v[m]!) / 2);
}

/** Posts per week across a set of unix-second timestamps. */
export function perWeek(unixSeconds: number[]): number | null {
  const t = unixSeconds.filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (t.length < 2) return null;
  const spanDays = Math.max(1, (t[t.length - 1]! - t[0]!) / 86_400);
  return Math.round((t.length / spanDays) * 7 * 10) / 10;
}

export function daysAgo(unixSeconds: number): number {
  return Math.round((Date.now() / 1000 - unixSeconds) / 86_400);
}
