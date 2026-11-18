import { afterEach, describe, expect, it, vi } from "vitest";
import { Response } from "undici";
import { EvidenceStore } from "../src/evidence.js";
import { scorecard } from "../src/analyze/scorecard.js";
import { collectSeo } from "../src/sources/seo.js";
import { validateReport } from "../src/report/validate.js";
import type { Ctx } from "../src/context.js";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), fetch: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("undici", async () => ({ ...await vi.importActual<any>("undici"), fetch: mocks.fetch }));
import { assertPublicAddress, assertPublicUrl, publicLookup, fetchText, fetchJson, readLimited } from "../src/http.js";

const dns = (all = true) => new Promise<any>((resolve, reject) => publicLookup("audit.example", { all, family: 0 }, (err: Error | null, result: any) => err ? reject(err) : resolve(result)));
const response = (body: string, status = 200, headers: Record<string, string> = {}) => new Response(body, { status, headers });
const ctx = (): Ctx => ({ target: { input: "https://audit.example", url: "https://audit.example", domain: "audit.example", kind: "website" }, store: new EvidenceStore(), sc: null, found: { socials: {}, people: [], appStoreIds: [], playIds: [], logos: [], founderHints: [] }, content: [], log: () => {} });
afterEach(() => { vi.clearAllMocks(); });

describe("connection-bound DNS policy", () => {
  it("rejects private IPv4, mapped IPv6, special IPv6 and URL credentials", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "100.64.0.1", "192.168.1.1", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2001:db8::1", "2002:7f00:1::"]) expect(() => assertPublicAddress(ip), ip).toThrow();
    for (const url of ["http://localhost./", "http://user:password@public.example/", "file:///etc/passwd", "http://2130706433/"]) expect(() => assertPublicUrl(url), url).toThrow();
    expect(() => assertPublicAddress("1.1.1.1")).not.toThrow();
    expect(() => assertPublicAddress("2606:4700:4700::1111")).not.toThrow();
  });
  it("rejects a DNS name resolving to private or mixed addresses", async () => {
    mocks.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(dns()).rejects.toThrow("Blocked");
    mocks.lookup.mockResolvedValue([{ address: "1.1.1.1", family: 4 }, { address: "10.0.0.1", family: 4 }]);
    await expect(dns()).rejects.toThrow("Blocked");
  });
  it("hands the validated DNS result directly to the connection callback", async () => {
    mocks.lookup.mockResolvedValue([{ address: "1.1.1.1", family: 4 }]);
    expect(await dns()).toEqual([{ address: "1.1.1.1", family: 4 }]);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    expect(await dns(false)).toBe("1.1.1.1");
  });
});

describe("bounded fetches and redirects", () => {
  it("cancels an oversized stream before consuming its full contents", async () => {
    let chunks = 0; let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ pull(c) { chunks++; c.enqueue(new Uint8Array(32)); }, cancel() { cancelled = true; } });
    await expect(readLimited(new Response(body), 16)).rejects.toThrow("exceeds");
    expect(cancelled).toBe(true); expect(chunks).toBeLessThan(4);
  });
  it("counts UTF-8 bytes rather than string characters", async () => {
    await expect(readLimited(response("€€"), 5)).rejects.toThrow("exceeds");
    expect(await readLimited(response("€€"), 6)).toBe("€€");
  });
  it("blocks redirects to loopback before issuing the second fetch", async () => {
    mocks.fetch.mockResolvedValue(response("", 302, { location: "http://127.0.0.1/private" }));
    await expect(fetchText("https://audit.example")).rejects.toThrow("Blocked");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it("does not forward custom secrets to a different origin", async () => {
    mocks.fetch.mockResolvedValueOnce(response("", 302, { location: "https://other.example/" })).mockResolvedValueOnce(response("ok"));
    expect((await fetchText("https://audit.example", { headers: { "x-api-key": "synthetic" } })).body).toBe("ok");
    expect(mocks.fetch.mock.calls[1]![1].headers["x-api-key"]).toBeUndefined();
  });
  it("rejects authenticated API redirects and oversized JSON", async () => {
    mocks.fetch.mockResolvedValueOnce(response("", 302, { location: "https://other.example/" }));
    await expect(fetchJson("https://api.example", { redirects: "error" })).rejects.toThrow("redirect blocked");
    mocks.fetch.mockResolvedValueOnce(response('{"large":"value"}'));
    await expect(fetchJson("https://api.example", { maxBytes: 5 })).rejects.toThrow("exceeds");
  });
});

describe("honest evidence", () => {
  it("keeps SEO and GEO unknown when all requests fail", async () => {
    mocks.fetch.mockRejectedValue(new Error("synthetic timeout"));
    const c = ctx(); await collectSeo(c);
    expect(c.store.unknowns.map(u => u.channel)).toEqual(expect.arrayContaining(["seo", "geo"]));
    expect(c.store.items.some(e => /missing|no llms.txt|No readable/.test(e.title))).toBe(false);
    const card = scorecard(c.store);
    expect(card.find(x => x.channel === "seo")?.status).toBe("unknown");
    expect(card.find(x => x.channel === "geo")?.status).toBe("unknown");
  });
  it("distinguishes checked absence from HTTP errors and soft-404 HTML", async () => {
    mocks.fetch.mockImplementation(async (url: string) => response("", url.endsWith("robots.txt") ? 403 : 404));
    const c = ctx(); await collectSeo(c);
    const stance = c.store.find("seo", "AI-search stance")!;
    expect(stance.data).toMatchObject({ robotsStatus: "unknown", llmsStatus: "absent" });
    expect(scorecard(c.store).find(x => x.channel === "geo")?.status).toBe("unknown");
  });
  it("collects valid sitemaps without claiming Google indexing", async () => {
    mocks.fetch.mockImplementation(async (url: string) => url.endsWith("sitemap.xml") ? response('<urlset><url><loc>https://audit.example/a</loc></url></urlset>') : response("", 404));
    const c = ctx(); await collectSeo(c);
    expect(c.store.find("seo", "Sitemap")?.data).toMatchObject({ totalUrls: 1 });
    expect(scorecard(c.store).find(x => x.channel === "seo")).toMatchObject({ status: "active", signal: expect.stringContaining("not confirmed indexed") });
  });
  it("does not equate absent observations with no marketing activity", () => {
    expect(scorecard(new EvidenceStore()).every(x => x.status === "unknown")).toBe(true);
  });
  it("never presents structural success as verification of fabricated claims", () => {
    const headings = ["TL;DR", "Channel scorecard", "The engine", "Paid", "Organic social", "SEO", "Founders", "Reddit", "Funnel", "Steal this playbook", "Unknowns"];
    const md = headings.map(h => `## ${h}\n` + (h === "TL;DR" ? Array(3).fill("- Invented fact [E1]").join("\n") : h === "Steal this playbook" ? Array.from({ length: 5 }, (_, i) => `${i + 1}. Invented action [E1]`).join("\n") : "Invented fact [E1]")).join("\n\n");
    const v = validateReport(md, { evidence: [{ id: "E1" }] as any, unknowns: [] });
    expect(v.ok).toBe(true); expect(v.factsVerified).toBe(false); expect(v.scope).toBe("structure-only"); expect(v.warning).toContain("not verified");
  });
});
