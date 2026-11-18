# Security

REM reads public marketing evidence. Never expose the local web server to other users or the internet.

## Network boundary

- HTTP(S) only; URL credentials and non-public IP literals are rejected.
- Socket DNS lookup validates every returned address and passes the vetted addresses directly to the connection. Mixed private/public DNS records are rejected. No second unvalidated resolution is used.
- Every redirect passes the same policy. Cross-origin redirects discard caller headers. Authenticated Scrape Creators requests reject redirects entirely.
- Text and JSON bodies are bounded during stream consumption, after decompression. Excess bodies are cancelled rather than silently truncated. Timeouts remain active during body consumption.
- Default direct mode ignores proxy variables. Explicit `REM_NETWORK_MODE=pinned-proxy` uses the host-configured HTTP(S) `HTTPS_PROXY` (or `https_proxy`). A separate transport queries only `https://dns.google/resolve`, with redirects rejected, a 10-second deadline and a 64 KiB decoded-body limit. All A/AAAA answers must be public. Source CONNECT authority and Host are rewritten to a vetted IP; the original target hostname remains the HTTP origin and TLS SNI/certificate identity. This prevents a second target DNS lookup at the proxy. Proxy and DNS service are trusted infrastructure; hostnames are disclosed to Google DNS. Respect host egress policy and do not override its proxy or CA configuration. Unsupported tunnels, DNS errors and disallowed destinations fail closed; there is no unpinned fallback.

## Keys and report writers

- Settings are stored locally with mode 600. Status responses expose presence only.
- Scrape Creators credentials go only to its fixed API origin. Remote API error bodies are not copied into logs/reports.
- Claude Code receives a small allowlist of runtime/auth-location variables, not inherited API keys, runtime injection options or arbitrary environment settings. It runs with tools disabled, strict MCP configuration, project-only settings and a unique mode-700 temporary directory removed after completion. The binary and the user's subscription authentication remain trusted. This is not an OS container.
- The nested Codex writer is disabled. A read-only shell still permits reading secrets. Instead use REM through MCP in an already trusted Codex/agent session. That outer agent's tool permissions are the client's responsibility; evidence is always untrusted data.
- Anthropic API writing sends the collected evidence to Anthropic. Paid source/API calls require your own configured credentials. No fabricated or automatic credential provisioning.

## Local web app

- Binds to 127.0.0.1, rejects foreign Host and cross-origin write requests.
- JavaScript is served locally from lockfile-managed dependencies and web/app.js. CSP allows scripts only from self, not CDN or inline scripts.
- Markdown passes through DOMPurify with media, forms, SVG and inline styling removed. Links are restricted to HTTP(S).
- The separate content gallery intentionally loads external public media and logos; those providers can see ordinary media requests. Referrer policy is no-referrer.
- This is a trusted single-user local application, not a multi-user authenticated service.

## Installation and analysis limits

- Setup registers the absolute Node executable and this checkout's built CLI. It never silently executes the unversioned upstream npm package.
- Use a reviewed commit and lockfile. Production deployments must omit development dependencies.
- Network errors are Unknown, not evidence of absence. Ad longevity does not prove profitability.
- validate_report is structural lint only. Its result always states factsVerified=false. Manually verify each factual claim against the cited evidence.
- Never send anything to ClickUp without explicit user confirmation.

Report vulnerabilities through a private GitHub security advisory, not a public issue.
