# Security and readiness changes (2026-11-18)

Baseline reviewed: 5b78198b2578997412853ab0858b10670fa74984.

## Resolved controls

- DNS validation is in the socket lookup and returns the checked addresses directly. All DNS answers must be public. Private/special IP literals, credentials in URLs, redirects to private addresses and mixed DNS answers fail closed.
- HTTP text/JSON responses are byte-limited as streams, including decoded compressed bodies. Authenticated Scrape Creators redirects fail closed and provider error bodies are not echoed.
- Claude report subprocesses use an environment allowlist, tools disabled, strict MCP configuration, project-only settings and unique private temporary directories removed after completion.
- The nested Codex writer is disabled. REM remains available to Codex via MCP; the outer agent's permissions are managed by its client. Read-only shell mode was not sufficient isolation.
- Setup registers this built checkout's absolute executable/path, rather than an unversioned registry package.
- Web scripts are local lockfile-managed assets; script CSP no longer allows CDN or inline execution.
- Failed/blocked SEO checks remain Unknown. Sitemap URLs are no longer presented as confirmed indexed URLs. Missing observations do not imply no app, launch, affiliate or sales activity.
- Ad longevity is no longer described as proof of profitability. Structural report validation explicitly returns factsVerified=false and the UI/CLI use structural wording.
- Source failures populate Unknowns. Null metrics are not converted to zero in comparisons.
- The analyst harness is version 4 and explicitly treats source content as untrusted data. ClickUp writes require explicit user confirmation.

## Validation

- Typecheck, 45 unit/regression tests, build and offline fixture evaluation.
- Regression tests cover private/mixed DNS results, literal IP variants, redirects, stripped cross-origin headers, stream cancellation, UTF-8 byte limits, unknown SEO, false structural certainty and report process boundaries.
- Local HTTP smoke checks verify assets, CSP, foreign Host rejection, cross-origin settings rejection and refusal to launch the unsafe Codex writer.
- MCP initialization, tool enumeration and playbook retrieval are checked over stdio.
- Production dependency audit: no known findings at verification time. This is not a guarantee against undiscovered vulnerabilities.

## Explicit remaining limits

- Full dependency audit still reports picomatch GHSA-fc5q-39xc-vjpf and its development-only dependents. The registry exposed no newer picomatch version than 4.0.7 during this change. Do not force a major downgrade or suppress the advisory. Build/test only trusted repository patterns and prune development dependencies for production.
- Direct DNS in this execution environment fails. This is now handled by explicit `REM_NETWORK_MODE=pinned-proxy` using the inherited managed HTTP(S) proxy. DNS-over-HTTPS answers are validated, CONNECT is pinned to a checked public IP, and original TLS identity verification is retained. The test proxy confirms the actual CONNECT authority and Host contain the checked IP. Fresh CLI and MCP website/SEO scans of example.com succeeded on 2026-11-18 with six evidence items each and no paid API calls; MCP get_evidence also retrieved the saved run; unavailable sitemap coverage remained Unknown. This proves these paths in this environment, not every source or site.
- Proxy mode requires access to Google DNS-over-HTTPS and permitted IP tunnels. There is no fallback that omits address validation. Configure `REM_NETWORK_MODE` in the calling agent environment as well as the terminal; setup does not persist proxy credentials.
- Scrape Creators and Anthropic credentials were absent. Paid-source and live model/harness evaluations remain unverified. The offline fixture is a historical recorded report, not a fresh model output.
- A temporary execution workspace is not a permanent agent host. Local stdio registration does not add a hosted connector to ChatGPT automatically.
- A validator cannot prove factual truth. Each final factual claim still needs claim-to-evidence review.

## Deployment

Build the approved commit, then run `npm prune --omit=dev --ignore-scripts` and `npm audit --omit=dev` before registration. Use `node dist/cli.js setup --dry-run`, inspect its absolute path, then `node dist/cli.js setup --yes` on the permanent host. Keep that path stable. Do not expose `rem web` publicly. Rebuild and re-test deliberately when changing commits.
