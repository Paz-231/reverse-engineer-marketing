import type { Ctx } from "../context.js";
import { fetchText } from "../http.js";

const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "CCBot", "Applebot-Extended", "Bytespider"];

export interface RobotsFacts {
  sitemaps: string[];
  aiBots: Record<string, "blocked" | "allowed" | "unspecified">;
  disallowCount: number;
}

export function parseRobots(txt: string): RobotsFacts {
  const sitemaps = [...txt.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map(m => m[1]!).slice(0, 20);
  const groups: { agents: string[]; rules: string[] }[] = [];
  let cur: { agents: string[]; rules: string[] } | null = null;
  for (const line of txt.split(/\r?\n/)) {
    const l = line.replace(/#.*/, "").trim();
    const ua = l.match(/^user-agent:\s*(.+)$/i);
    if (ua) {
      if (!cur || cur.rules.length) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(ua[1]!.trim().toLowerCase());
      continue;
    }
    const rule = l.match(/^(dis)?allow:\s*(.*)$/i);
    if (rule && cur) cur.rules.push(`${rule[1] ? "D" : "A"}${rule[2]!.trim()}`);
  }
  const aiBots: RobotsFacts["aiBots"] = {};
  for (const bot of AI_BOTS) {
    const g = groups.find(x => x.agents.includes(bot.toLowerCase()));
    aiBots[bot] = !g ? "unspecified" : g.rules.includes("D/") ? "blocked" : "allowed";
  }
  return { sitemaps, aiBots, disallowCount: groups.reduce((n, g) => n + g.rules.filter(r => r.startsWith("D") && r.length > 1).length, 0) };
}

export function parseSitemap(xml: string): { urls: { loc: string; lastmod?: string }[]; children: string[] } {
  const children = /<sitemapindex/i.test(xml) ? [...xml.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => decode(m[1]!)) : [];
  const urls = children.length
    ? []
    : [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)].map(m => ({
        loc: decode(m[1]!.match(/<loc>\s*([^<\s]+)\s*<\/loc>/i)?.[1] ?? ""),
        lastmod: m[1]!.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i)?.[1],
      })).filter(u => u.loc);
  return { urls, children };
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

const LOCALE = /^[a-z]{2}(?:-[a-z]{2})?$/i;

export interface SitemapAnalysis {
  totalUrls: number;
  sections: { path: string; count: number; examples: string[]; programmatic: boolean; freshLast90d: number }[];
  locales: string[];
  patterns: Record<"comparison" | "alternatives" | "integrations" | "templates" | "tools" | "glossary" | "useCases" | "locations" | "howTo" | "listicles", number>;
  blogPostsLast30d: number;
  blogPostsLast90d: number;
}

/** Groups URLs by first path segment and spots programmatic-SEO page families. */
export function analyzeSitemap(urls: { loc: string; lastmod?: string }[], now = Date.now()): SitemapAnalysis {
  const sections = new Map<string, { count: number; examples: string[]; slugs: string[]; fresh: number }>();
  const locales = new Set<string>();
  const patterns: SitemapAnalysis["patterns"] = { comparison: 0, alternatives: 0, integrations: 0, templates: 0, tools: 0, glossary: 0, useCases: 0, locations: 0, howTo: 0, listicles: 0 };
  let blog30 = 0;
  let blog90 = 0;
  for (const { loc, lastmod } of urls) {
    let path: string;
    try {
      path = new URL(loc).pathname.toLowerCase();
    } catch {
      continue;
    }
    let segs = path.split("/").filter(Boolean);
    if (segs[0] && LOCALE.test(segs[0]) && segs.length > 1) {
      locales.add(segs[0]);
      segs = segs.slice(1);
    }
    const key = segs.length > 1 ? `/${segs[0]}` : segs.length === 1 ? "/(root pages)" : "/";
    const s = sections.get(key) ?? { count: 0, examples: [], slugs: [], fresh: 0 };
    s.count++;
    if (s.examples.length < 4) s.examples.push(path);
    if (s.slugs.length < 200) s.slugs.push(segs[segs.length - 1] ?? "");
    const ageDays = lastmod ? (now - Date.parse(lastmod)) / 86_400_000 : NaN;
    if (ageDays <= 90) s.fresh++;
    sections.set(key, s);

    if (/-vs-|\/vs\/|\/compare\//.test(path)) patterns.comparison++;
    if (/alternative/.test(path)) patterns.alternatives++;
    if (/\/integrations?\//.test(path)) patterns.integrations++;
    if (/\/templates?\//.test(path)) patterns.templates++;
    if (/\/(tools?|free-tools?|generators?|calculators?)\//.test(path)) patterns.tools++;
    if (/\/(glossary|dictionary|terms|definitions?|what-is)\b/.test(path)) patterns.glossary++;
    if (/\/(use-cases?|for|solutions?|industries)\//.test(path)) patterns.useCases++;
    if (/\/(locations?|cities|near-me|in-[a-z-]+)\b/.test(path)) patterns.locations++;
    if (/how-to-/.test(path)) patterns.howTo++;
    if (/\/(best|top)-|-best-|top-\d+/.test(path)) patterns.listicles++;
    if (/^\/(blog|articles|posts|news|resources|insights|learn|guides?)\b/.test(`/${segs[0] ?? ""}`) && segs.length > 1) {
      if (ageDays <= 30) blog30++;
      if (ageDays <= 90) blog90++;
    }
  }
  const out = [...sections.entries()]
    .map(([path, s]) => ({ path, count: s.count, examples: s.examples, programmatic: isProgrammatic(s.count, s.slugs), freshLast90d: s.fresh }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
  return { totalUrls: urls.length, sections: out, locales: [...locales].slice(0, 30), patterns, blogPostsLast30d: blog30, blogPostsLast90d: blog90 };
}

/** A big folder whose slugs share a template ("x-vs-y", "best-x-for-y") is programmatic SEO. */
function isProgrammatic(count: number, slugs: string[]): boolean {
  if (count < 40) return false;
  const shapes = new Map<string, number>();
  for (const slug of slugs) {
    const shape = slug.replace(/[a-z0-9]+/g, "w").replace(/(w-)+w/g, m => (m.length > 9 ? "w-…-w" : m));
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
  }
  const top = Math.max(...shapes.values());
  return count >= 200 || top / slugs.length > 0.5;
}

export async function collectSeo(ctx: Ctx): Promise<void> {
  const { target, store } = ctx;
  if (!target.url) throw new Error("no website URL");
  const origin = new URL(target.url).origin;

  // A failed/blocked fetch is unknown. Only an explicit 404/410 proves absence at this URL.
  const readFile = async (path: string) => {
    try {
      const r = await fetchText(`${origin}/${path}`, { timeoutMs: 10_000 });
      if (r.status === 404 || r.status === 410) return { state: "absent" as const, body: null };
      if (r.status !== 200 || /<html/i.test(r.body.slice(0, 500))) throw new Error(`HTTP ${r.status} or unexpected HTML`);
      return { state: "present" as const, body: r.body };
    } catch (err) {
      store.unknown({ channel: "geo", reason: `${path} not checked: ${err instanceof Error ? err.message : "fetch failed"}`, manualCheck: `${origin}/${path}` });
      return { state: "unknown" as const, body: null };
    }
  };
  const [robotsResult, llmsResult] = await Promise.all([readFile("robots.txt"), readFile("llms.txt")]);
  const robots = robotsResult.body === null ? null : parseRobots(robotsResult.body);
  const llms = llmsResult.body;
  const seen = new Set<string>();
  const urls: { loc: string; lastmod?: string }[] = [];
  const readable: string[] = [];
  const failures: string[] = [];
  const read = async (start: string[]) => {
    const queue = [...start];
    while (queue.length && seen.size < 25 && urls.length < 50_000) {
      const sm = queue.shift()!;
      if (seen.has(sm)) continue;
      seen.add(sm);
      try {
        const r = await fetchText(sm, { timeoutMs: 15_000, maxBytes: 20_000_000 });
        if (r.status === 404 || r.status === 410) continue;
        if (r.status !== 200 || !/<(urlset|sitemapindex)/i.test(r.body.slice(0, 2000))) throw new Error(`HTTP ${r.status} or invalid sitemap`);
        readable.push(sm);
        const parsed = parseSitemap(r.body);
        queue.push(...parsed.children.slice(0, 40));
        urls.push(...parsed.urls.slice(0, 50_000 - urls.length));
      } catch (err) {
        failures.push(`${sm}: ${err instanceof Error ? err.message : "fetch failed"}`);
      }
    }
    if (queue.length) failures.push("Sitemap scan limit reached; coverage is partial");
  };
  await read(robots?.sitemaps ?? []);
  for (const fallback of ["sitemap.xml", "sitemap_index.xml", "sitemap-index.xml"]) {
    if (urls.length) break;
    await read([`${origin}/${fallback}`]);
  }
  if (failures.length || !readable.length || robotsResult.state === "unknown") {
    store.unknown({ channel: "seo", reason: failures.length ? `Sitemap coverage incomplete: ${failures.slice(0, 3).join("; ")}` : "No readable sitemap collected; site-wide SEO activity is unknown", manualCheck: `${origin}/sitemap.xml` });
  }
  if (readable.length) {
    const analysis = analyzeSitemap(urls);
    store.add({
      source: "seo", kind: "derivation",
      title: `Sitemap: ${analysis.totalUrls.toLocaleString("en-US")} URLs in collected sample`,
      url: readable[0],
      data: { ...analysis, partial: failures.length > 0 || robotsResult.state === "unknown", sitemapsRead: readable.slice(0, 10) },
    });
  }
  store.add({
    source: "seo", kind: "observation",
    title: `AI-search stance: llms.txt ${llmsResult.state}; robots.txt ${robotsResult.state}`,
    url: `${origin}/robots.txt`,
    data: { robots, llmsTxt: llms === null ? null : llms.slice(0, 1500), robotsStatus: robotsResult.state, llmsStatus: llmsResult.state },
  });

  if (ctx.sc && target.domain && ctx.sc.can()) {
    // What Google surfaces first for the domain ≈ their SEO money pages.
    const res = await ctx.sc.get<any>("/v1/google/search", { query: `site:${target.domain}` }).catch(() => null);
    const results = (res?.results ?? []).slice(0, 10).map((r: any) => ({ title: r.title, url: r.url, description: r.description }));
    if (results.length) store.add({ source: "seo", kind: "observation", title: `Top Google results for site:${target.domain}`, url: `https://www.google.com/search?q=site:${target.domain}`, data: results });
  }
}
