<div align="center">

# REM: Reverse Engineer Marketing

### Paste a link. Get the whole marketing machine behind it.

**Paid ads · organic social · SEO & AI search · founders · funnel · positioning history, with the evidence for every claim.**

<code>node dist/cli.js notion.so</code>

[Quick start](#quick-start) · [Web app](#web-app-use-your-claude-code-or-codex-plan) · [What it finds](#what-it-finds) · [Use it from your agent (MCP)](#use-it-from-your-agent-mcp) · [Example report](examples/calai.app.md) · [How it works](#how-it-works)

</div>

---

Nobody shares their growth alpha anymore. But most of it is public if you know where to look: ad libraries show which ads have been running for months (longevity signals), pixels show which platforms they buy, sitemaps show programmatic SEO, Wayback shows every repositioning, and founders post their playbook in public.

REM collects all of it from one link and turns it into a report: what the company's growth engine is, how the channels connect, and a step-by-step playbook to copy it. Every fact cites the evidence it came from, and everything REM couldn't see is listed as unknown, with a link to check it yourself.

Inspired by [REA (Reverse Engineer Anything)](https://github.com/morluto/rea), but for marketing instead of binaries.

> [!TIP]
> **Found their winning ads? Make your own.** REM is built by [DansUGC](https://dansugc.com/?utm_source=github&utm_medium=oss&utm_campaign=reverse-engineer-marketing): 5,000+ real-creator UGC reaction clips and custom videos for paid ads and organic, from $5 a clip. Copy the hooks, skip the creator hunt. **[Get UGC for your ads →](https://dansugc.com/?utm_source=github&utm_medium=oss&utm_campaign=reverse-engineer-marketing)**

## Quick start

This fork must be built from the reviewed commit, not an unversioned npm package:

```bash
git clone https://github.com/Paz-231/reverse-engineer-marketing.git
cd reverse-engineer-marketing
# Check out the approved commit before building.
npm ci --ignore-scripts
npm run typecheck && npm test && npm run eval && npm run build
npm prune --omit=dev --ignore-scripts
node dist/cli.js setup --dry-run
node dist/cli.js setup --yes
```

Keep this checkout in a permanent location on your agent host. A temporary ChatGPT execution workspace is not a permanent host. MCP via stdio is a local client integration, not a hosted ChatGPT connector. Direct outbound DNS/HTTPS is the default. On a managed HTTP(S) proxy host, explicitly set `REM_NETWORK_MODE=pinned-proxy` and inherit the host-provided `HTTPS_PROXY`. This mode resolves via Google DNS-over-HTTPS, checks every returned address and pins CONNECT to a public IP while retaining the original TLS identity. It requires the host policy to allow that DNS service and destination. See SECURITY.md; failures remain Unknown.

The build/test toolchain currently has a known picomatch ReDoS advisory. It is absent after pruning development dependencies. Do not run the test toolchain on attacker-supplied glob patterns. Production dependency audit is checked separately. See docs/SECURITY_FIXES.md for validation and remaining limitations.


Try it with zero setup, no keys: a recorded Cal AI teardown opens in the web app.

```bash
node dist/cli.js demo
```

Then run it on any company:

```bash
node dist/cli.js linear.app
```

That works with **no API keys**: website, tracking pixels (including pixels hidden inside Google Tag Manager containers), SEO/sitemaps, AI-crawler stance, Wayback positioning history, App Store/Google Play and Hacker News.

Add keys to unlock the rest:

```bash
export SCRAPECREATORS_API_KEY=...   # ad libraries, social stats, founders, Reddit (~25–50 credits per run)
export ANTHROPIC_API_KEY=...        # the written strategy report (Claude)
node dist/cli.js calai.app
```

Output goes to `./rem-reports/<domain>-<date>/`: `report.md` plus `evidence.json` (the raw evidence bundle).

It also accepts App Store and Google Play links: `rem https://apps.apple.com/us/app/…/id123`.

```
rem <url> [--no-ai] [--json] [--only paid,social,seo] [--handle tiktok=name] [--out dir]
rem web              # local app (Claude Code / Anthropic API / evidence only)
rem demo             # recorded Cal AI teardown in the web app, no keys
rem diff <domain>    # what changed since the last run: new/killed ads, growth, repositioning
rem setup            # connect REM to Claude Code / Codex (shows the plan, asks before changing anything)
rem doctor           # which sources your keys unlock
rem mcp              # run the MCP server
```

## Web app: Claude Code, Anthropic API or evidence only

```bash
node dist/cli.js web
```

Opens a local web app at `http://localhost:4321`. Paste a link, pick an available report writer, and watch the evidence come in and the playbook stream out. Every `E12` citation opens the raw evidence behind it.

The **Posts & ads** tab is a review library of everything collected: Meta ads (active *and* paused, with creatives, inline video, run length, variants, top-by-impressions), Google and LinkedIn ads, TikTok and Instagram videos, YouTube, X and LinkedIn posts (company and founders), and Reddit threads and brand/founder replies. Filter by platform, sort by top / newest / longest running, open any original. The rail shows the brand logo and the founders with photos, roles, LinkedIn/X audience and a confidence badge.

| Report writer | How it runs | Cost |
|---|---|---|
| **Claude Code** | your installed `claude` CLI, headless, no tools | your Claude subscription |
| **Codex** | use REM through MCP in your agent; nested web writer disabled | your agent plan |
| Anthropic API | `ANTHROPIC_API_KEY` | per token |
| Evidence only | no AI | free |

Claude Code runs without tools in a private temporary directory with a minimal environment. The nested Codex writer is disabled: read-only shell access does not isolate secrets. Codex can still use REM through MCP and write the report in its own session. The local web app binds only to 127.0.0.1; do not expose it on a public host or reverse proxy. See SECURITY.md for trust boundaries.

## What it finds

| Area | What REM pulls | Needs a key? |
|---|---|---|
| **Paid: Meta** | All ads incl. paused campaigns, active count, most-shown ads, ads launched in the last 30 days, **longest-running active ads (longevity signals)** with hooks, formats, CTAs, landing pages, UTM campaign names, variant counts | Scrape Creators |
| **Paid: Google** | Ads pointing at the domain, formats, recency, and **other advertisers bidding on the brand** (affiliates/resellers) | Scrape Creators |
| **Paid: LinkedIn** | Ads by the company, ad types, headlines, CTAs | Scrape Creators |
| **Paid: Apple Search Ads** | From Apple's public Ad Repository (EU): App Store ads over the last year, how many still serve, placements, formats, the message each ad shows, markets, audience targeting, and **copycat apps advertising under the same name** | Free |
| **App Store link forensics** | In Meta ads that point at the App Store: custom product pages (`ppid`), campaign tokens (`ct`/`pt`), attribution parameters | Scrape Creators |
| **Pixels & stack** | Meta/Google/TikTok/LinkedIn/Reddit/X/Pinterest/Snap pixels with IDs, **including inside GTM containers**; attribution SDKs (AppsFlyer, Adjust, Branch); affiliate tools; email/CRM; visitor-ID tools (RB2B, Warmly, Koala, Clearbit) that reveal an outbound motion; A/B testing | Free |
| **Organic social** | TikTok, Instagram, YouTube, X, LinkedIn: followers, posts/week, median reach, top posts and hooks, spark ads, days since last post. Finds TikTok even when the site doesn't link it | Scrape Creators |
| **SEO** | Sitemap size and folders, **programmatic page families** (`/integrations/{app}`, `/{a}-vs-{b}`, `/templates/…`), comparison/alternatives pages, content cadence, locales, top Google results | Free (+1 credit) |
| **AI search (GEO)** | llms.txt, which AI crawlers are blocked or allowed | Free |
| **Founders** | Names from Wikidata, the site's JSON-LD and about page (free), plus LinkedIn and Google search; ranked by confidence; LinkedIn/X audience, photo, recent posts | Free names; enrichment Scrape Creators |
| **Reddit marketing** | Brand/founder posts and replies, owned subreddit activity, comparison and "what should I use" threads, organic recommendations, Reddit threads ranking on Google | Scrape Creators |
| **Brand logo** | apple-touch-icon, LinkedIn logo, App Store icon, JSON-LD, Wikidata, Instagram avatar (best first, with fallbacks) | Free |
| **Community & launches** | Reddit threads and subreddits, Hacker News launches and points, Product Hunt | HN free; rest Scrape Creators |
| **Funnel & monetization** | Positioning, CTAs, pricing model, free plan/trial, per-seat/usage, sales-led signals, affiliate program and commission, social proof | Free |
| **Apps** | App Store ratings (download proxy), release age, update cadence, Play installs | Free |
| **Positioning history** | Homepage title/H1/CTAs over time from the Wayback Machine: pivots and repositioning | Free |

## Watch competitors over time

Run REM on the same company again next week, then:

```bash
rem diff calai.app
```

You get the deltas: Meta ads in the library and live now, ads launched, Apple Search Ads volume, follower growth per platform, sitemap growth, channels that switched on or off, homepage repositioning, and which ads and posts are new or no longer running.

## Use it from your agent (MCP)

REM is an MCP server, so Claude Code, Codex, Cursor, or any MCP client can run it. With MCP you don't need an Anthropic key: your agent writes the report itself.

One command, with a plan you approve first (it backs up anything it replaces):

```bash
node dist/cli.js setup        # detects Claude Code / Codex, shows the plan, asks
node dist/cli.js setup --dry-run
```

Or register the exact built checkout manually (replace the paths with your actual Node executable and reviewed checkout):

```bash
codex mcp add reverse-engineer-marketing -- /absolute/path/to/node /absolute/path/to/reverse-engineer-marketing/dist/cli.js mcp
```

Do not put API keys in command arguments. Store them in your client's secret mechanism or REM's local settings (file mode 600). Other MCP clients can use the same absolute executable and arguments. Moving this checkout requires updating the registration.

Then ask:

> Reverse engineer the marketing of linear.app and give me a playbook I can copy.

| Tool | What it does |
|---|---|
| `reverse_engineer_marketing` | Collects everything for a URL. Returns a compact scorecard + evidence index + unknowns (token-cheap) and a `run_id` |
| `get_evidence` | Full data for specific evidence ids or a source (ad copy, top posts, sitemap families…) |
| `get_playbook` | The analysis method: role, evidence rules, report template, lessons, and per-channel playbooks |
| `get_content` | The actual ads, videos and posts (media URLs, run length, live/paused) to quote or show |
| `compare_runs` | What changed between two runs of the same company |
| `validate_report` | Structural lint: citation IDs, sections and citation coverage. Does not verify facts or all invented numbers. |
| `write_report` | Optional server-side report (needs `ANTHROPIC_API_KEY` in the server env) |

### Guided workflows

Named MCP prompts your client can run in one click (the REA pattern: investigate → spec → build → verify):

| Prompt | What it does |
|---|---|
| `investigate_company` | Full teardown: evidence → playbook → cited report → validation |
| `compare_competitors` | 2–4 companies side by side: who wins each channel, gaps, the best play to copy from each |
| `what_changed` | Re-run + diff against last time: new angles, killed ads, growth, repositioning |
| `steal_the_playbook` | Investigate → spec → **build**: a 30-day plan for your product with ad hooks, UGC briefs, landing outline, posting calendar, SEO template |
| `audit_unknowns` | What REM couldn't see and the fastest way to check each by hand |

### Prompt pack

Paste into Claude Code / Codex once REM is connected:

```text
Reverse engineer the marketing of calai.app. Lead with their longest-running ads and quote the hooks.

Compare notion.so, coda.io and clickup.com: which channel does each one win, and what's the one play I should copy from each?

What changed at linear.app since my last run? New ad angles, ads they killed, audience growth.

Steal the playbook: reverse engineer calai.app, then build a 30-day plan for my app (myapp.com) with 10 ad hooks adapted from their winners and 3 UGC video briefs.

Which competitors bid on App Store search in Europe for "calorie tracker"-type apps, and what message does each show?
```

Install the bundled skill to teach your agent the workflow: copy `skills/reverse-engineer-marketing/` into `~/.claude/skills/` (or your agent's skills folder).

## How it works

```
link ──► website scan ──► discovers socials, apps, people, brand
              │
              ├─► pixels + GTM containers      ├─► Meta / Google / LinkedIn ad libraries
              ├─► robots, sitemaps, llms.txt   ├─► TikTok / IG / YouTube / X / LinkedIn
              ├─► Wayback history              ├─► founders (LinkedIn + X)
              └─► App Store / Play / HN        └─► Reddit / Product Hunt
                                │
                    evidence bundle (E1…En) + unknowns
                                │
                  deterministic channel scorecard (no AI)
                                │
             Claude / your agent + the harness ──► report.md
                                │
                    validator (citations, grounding)
```

**Evidence contract.** Every item is an *observation* (seen at a URL or API) or a *derivation* (computed, e.g. posts/week). The report's interpretations must cite evidence ids and label inferences. Anything not checked is an *unknown*, never "they don't do it". A pixel means intent, not current spend, and dollar spend is never invented.

**The harness is a versioned file bundle** ([`harness/`](harness)): analyst role, guardrails, report template, a cue → lesson library, and one playbook per channel. Every report records the harness version and SHA. Change a playbook, run `npm run eval`, and compare scores. Recorded evidence bundles in `evals/fixtures/` let you iterate on the prompt without re-scraping.

**Cost per full run:** about 25–50 Scrape Creators credits plus one Claude call (default `claude-opus-5`, override with `REM_MODEL`). Scrape Creators responses are cached for 24h in `~/.cache/reverse-engineer-marketing` so agents can re-run without paying twice.

## Use it responsibly

REM reads **public** information only: public web pages, public ad transparency libraries (Meta, Google, LinkedIn, Apple), public social profiles. It never logs in as anyone, never touches private data, and never runs anything on the target.

Same rule as clean-room engineering: **study the strategy, ship your own.** Learn which angles, offers, channels and page templates work, then make your own creatives and copy. Don't republish competitors' ads, footage, copy or brand assets; that's their IP. Respect each site's terms and your local laws.

## Limits (honest)

- **Apple Search Ads** are only visible for the EU (Apple's DSA repository); other regions are unknown.
- **TikTok and X ads** have no global public library; REM reports the pixel and gives you the manual library link. **Reddit's** ad library was shut down.
- Ad library counts come from samples (first pages); REM says "in the sample".
- Founder, TikTok-handle and Product Hunt matches come from search and can be wrong; weak matches are flagged.
- Server-side tracking and email tools are invisible from the browser, so they're reported as unknown.
- Respect each site's terms and your local laws. REM reads public pages and public ad transparency libraries only.

## Develop

```bash
git clone https://github.com/dansugc/reverse-engineer-marketing && cd reverse-engineer-marketing
npm install
npm run dev -- notion.so --no-ai   # run from source
npm test                           # unit tests (parsers, scorecard, validator)
npm run eval                       # validate example reports against recorded fixtures
npm run eval -- --live             # regenerate with Claude and score (costs tokens)
```

Adding a source: write a collector in `src/sources/` that adds evidence to the store (observations or derivations, never conclusions) and records unknowns with a manual-check link, then teach `src/analyze/scorecard.ts` what it means. See [AGENTS.md](AGENTS.md).

## Built by DansUGC

<a href="https://dansugc.com/?utm_source=github&utm_medium=oss&utm_campaign=reverse-engineer-marketing"><b>DansUGC</b></a> is where the ads in these reports come from: real human creators, real reactions. Browse 5,000+ UGC reaction clips and b-roll, order custom videos from vetted creators, or let the ReelClaw agent assemble and post reels for you. If REM showed you a competitor winning with UGC, that's the shortcut.

**[Start with DansUGC →](https://dansugc.com/?utm_source=github&utm_medium=oss&utm_campaign=reverse-engineer-marketing)**

## License

MIT. Built by [DansUGC](https://dansugc.com/?utm_source=github&utm_medium=oss&utm_campaign=reverse-engineer-marketing).
