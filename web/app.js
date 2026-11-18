
const $ = s => document.querySelector(s);
const LABELS = {
  paid_meta: "Paid · Meta", paid_google: "Paid · Google", paid_linkedin: "Paid · LinkedIn", paid_reddit: "Paid · Reddit", paid_tiktok: "Paid · TikTok", paid_apple: "Paid · Apple",
  organic_tiktok: "TikTok", organic_instagram: "Instagram", organic_youtube: "YouTube", organic_x: "X", organic_linkedin: "LinkedIn page",
  seo: "SEO", geo: "AI search", founder_led: "Founder-led", reddit_marketing: "Reddit marketing", community: "Community", launches: "Launches", app_store: "App stores",
  lifecycle: "Lifecycle", affiliate: "Affiliate", sales_led: "Sales-led",
};
const STAGES = [["website", "Website & pixels"], ["seo", "SEO & AI search"], ["history", "Positioning history"], ["apps", "Apps & launches"], ["paid", "Ad libraries"], ["social", "Organic social"], ["founders", "Founders"], ["community", "Community"], ["write", "Writing the playbook"]];
let status = null, engine = null, state = null, es = null;
const PLATFORMS = {
  meta_ads: ["Meta ads", "#1877f2"], apple_ads: ["Apple Search Ads", "#0071e3"], tiktok: ["TikTok", "#ff0050"], instagram: ["Instagram", "#d62976"], youtube: ["YouTube", "#ff0000"],
  x: ["X", "#6b7280"], linkedin: ["LinkedIn", "#0a66c2"], reddit: ["Reddit", "#ff4500"], google_ads: ["Google ads", "#34a853"], linkedin_ads: ["LinkedIn ads", "#004182"],
};
let tab = "report", filter = "all", sortBy = "top";
function fmtN(n) { n = Number(n); if (!Number.isFinite(n)) return ""; return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e4 ? Math.round(n / 1e3) + "K" : n.toLocaleString(); }

function store(k, v) { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 1800); }
/** Only http(s) links leave the app; scraped data can't smuggle javascript: URLs. */
function safeUrl(u) { try { const x = new URL(String(u || ""), location.href); return x.protocol === "https:" || x.protocol === "http:" ? x.href : "#"; } catch { return "#"; } }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function ago(iso) { const s = (Date.now() - Date.parse(iso)) / 1000; return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; }
function favicon(domain) { return domain ? `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}` : ""; }
function initials(name) { return String(name || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase(); }
/** <img> that walks a list of candidate URLs, then falls back to initials. */
function logoEl(urls, name, cls = "logo-img") {
  const list = urls.filter(Boolean).map(safeUrl).filter(u => u !== "#");
  const fallback = () => { const s = document.createElement("span"); s.className = cls === "logo-img" ? "logo-fallback" : "initials"; s.textContent = initials(name); return s; };
  if (!list.length) return fallback();
  const img = document.createElement("img");
  img.className = cls; img.alt = ""; img.referrerPolicy = "no-referrer"; img.loading = "lazy";
  let i = 0;
  img.onerror = () => { i++; if (i < list.length) img.src = list[i]; else img.replaceWith(fallback()); };
  img.src = list[0];
  return img;
}

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function refreshStatus() {
  status = await api("/api/status");
  const set = status.scrapecreators.set;
  $("#keyDot").classList.toggle("on", set);
  $("#keyLabel").textContent = set ? "Data key on" : "Add data key";
  $("#keyBanner").hidden = set;
  renderEngines();
}

function renderEngines() {
  const saved = load("rem.engine");
  const avail = status.engines.filter(e => e.available);
  engine = (avail.find(e => e.id === saved) || avail[0]).id;
  $("#engines").innerHTML = status.engines.map(e => `
    <button type="button" class="engine" role="radio" data-engine="${e.id}" aria-checked="${e.id === engine}" ${e.available ? "" : "disabled"}>
      <strong>${e.available ? '<span class="dot on"></span>' : '<span class="dot"></span>'}${esc(e.label)}</strong>
      <span>${esc(e.detail)}</span>
    </button>`).join("");
}

$("#engines").addEventListener("click", e => {
  const b = e.target.closest("[data-engine]");
  if (!b || b.disabled) return;
  engine = b.dataset.engine;
  store("rem.engine", engine);
  document.querySelectorAll("[data-engine]").forEach(x => x.setAttribute("aria-checked", String(x === b)));
});

async function renderRecent() {
  const runs = await api("/api/runs").catch(() => []);
  $("#recentWrap").hidden = !runs.length;
  $("#recent").innerHTML = runs.slice(0, 12).map(r => `
    <a href="#/run/${encodeURIComponent(r.id)}">
      <img class="favicon" src="${esc(safeUrl(r.logo || favicon(r.domain)))}" data-fallback="${esc(favicon(r.domain))}" onerror="if(this.src!==this.dataset.fallback){this.src=this.dataset.fallback}" referrerpolicy="no-referrer" alt="">
      <span><strong>${esc(r.brand)}</strong> <span style="color:var(--faint)">${esc(r.domain || "")}</span></span>
      ${r.hasReport ? '<span class="tag">report</span>' : '<span class="tag">evidence</span>'}
      <span class="when">${ago(r.at)}</span>
    </a>`).join("");
}

document.querySelectorAll("[data-ex]").forEach(b => b.addEventListener("click", () => { $("#url").value = b.dataset.ex; $("#url").focus(); }));

$("#form").addEventListener("submit", async e => {
  e.preventDefault();
  const url = $("#url").value.trim();
  if (!url) return $("#url").focus();
  $("#go").disabled = true;
  try {
    const { jobId } = await api("/api/runs", { method: "POST", body: JSON.stringify({ url, engine }) });
    location.hash = `#/job/${jobId}`;
  } catch (err) { toast(err.message); }
  finally { $("#go").disabled = false; }
});

// ---- Run view -------------------------------------------------------------
function resetRun(title) {
  state = { stages: {}, bundle: null, markdown: "", runId: null, jobId: null, engine: null, done: false, logs: [] };
  $("#brand").textContent = title || "…";
  $("#domain").textContent = "";
  $("#logoSlot").replaceChildren();
  $("#foundersCard").hidden = true;
  $("#report").hidden = true; $("#report").innerHTML = ""; $("#cta").hidden = true;
  $("#log").hidden = true; $("#log").innerHTML = "";
  $("#error").hidden = true;
  $("#skeleton").hidden = false;
  $("#scoreCard").hidden = true; $("#metaCard").hidden = true;
  $("#copyBtn").hidden = $("#dlBtn").hidden = $("#cancelBtn").hidden = true;
  $("#valBadge").innerHTML = "";
  $("#status").textContent = "";
  $("#tabs").hidden = true; $("#contentView").hidden = true; $("#grid").replaceChildren(); filter = "all";
  setTab("report");
  renderStages();
}

function renderStages() {
  $("#stages").innerHTML = STAGES.filter(([k]) => k !== "write" || state.engine !== "none").map(([k, label]) => {
    const s = state.stages[k] || {};
    const cls = s.state === "start" ? "active" : s.state || "pending";
    const ms = s.ms ? `${(s.ms / 1000).toFixed(1)}s` : "";
    return `<li class="${cls === "pending" ? "" : cls === "active" ? "active" : "done"}" title="${esc(s.detail || "")}"><span class="ico ${cls}"></span>${label}<span class="ms">${ms}</span></li>`;
  }).join("");
}

function renderBundle(b) {
  state.bundle = b;
  $("#brand").textContent = b.brand;
  $("#domain").textContent = b.target.domain || b.target.input;
  $("#logoSlot").replaceChildren(logoEl([...(b.identity?.logos || []).map(l => l.url), favicon(b.target.domain)], b.brand));
  renderFounders(b.identity?.founders || []);
  state.content = b.content || [];
  $("#tabs").hidden = false;
  $("#contentCount").textContent = state.content.length ? String(state.content.length) : "";
  if (tab === "content") renderContent();
  document.title = `${b.brand} · REM`;
  const rows = b.scorecard.filter(c => c.status !== "unknown" || c.strength > 0).sort((a, z) => z.strength - a.strength);
  $("#score").innerHTML = rows.map(c => `
    <button data-ids="${c.evidence.join(",")}" title="${esc(c.signal)}">
      <span>${esc(LABELS[c.channel] || c.channel)} <span class="st">${c.status}</span></span>
      <span class="bars">${[1, 2, 3].map(i => `<i class="${i <= c.strength ? "on" : ""}"></i>`).join("")}</span>
    </button>`).join("");
  $("#scoreCard").hidden = !rows.length;
  $("#metaCard").hidden = false;
  $("#mEvidence").textContent = b.evidence.length;
  $("#mUnknowns").textContent = b.unknowns.length;
  $("#mCredits").textContent = b.credits.scrapecreators == null ? "no key" : b.credits.scrapecreators;
  $("#mHarness").textContent = `v${b.harness.version} · ${b.harness.sha.slice(0, 7)}`;
}

function setTab(t) {
  tab = t;
  document.querySelectorAll("#tabs [data-tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
  const showReport = t === "report";
  $("#report").hidden = !showReport || !state?.markdown;
  $("#contentView").hidden = showReport;
  if (!showReport) { $("#skeleton").hidden = true; renderContent(); }
  else if (state && !state.markdown && !state.done) $("#skeleton").hidden = false;
}
$("#tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) setTab(b.dataset.tab); });

function renderContent() {
  const items = state?.content || [];
  const counts = {};
  items.forEach(c => (counts[c.platform] = (counts[c.platform] || 0) + 1));
  $("#filters").innerHTML = `<button class="chip" data-f="all" aria-pressed="${filter === "all"}">All ${items.length}</button>` +
    Object.entries(PLATFORMS).filter(([k]) => counts[k]).map(([k, [label, color]]) => `<button class="chip" data-f="${k}" aria-pressed="${filter === k}"><span class="sw" style="background:${color}"></span>${label} ${counts[k]}</button>`).join("") +
    `<select class="sort" id="sortSel" aria-label="Sort"><option value="top">Top performing</option><option value="newest">Newest</option><option value="running">Longest running ads</option></select>`;
  $("#sortSel").value = sortBy;
  const score = c => c.metrics?.views ?? c.metrics?.likes ?? c.metrics?.score ?? c.metrics?.runningDays ?? 0;
  let list = items.filter(c => filter === "all" || c.platform === filter);
  list = [...list].sort(sortBy === "newest" ? (a, b) => String(b.date || "").localeCompare(String(a.date || "")) : sortBy === "running" ? (a, b) => (b.metrics?.runningDays || 0) - (a.metrics?.runningDays || 0) : (a, b) => (b.tags?.length ? 1 : 0) - (a.tags?.length ? 1 : 0) || score(b) - score(a));
  if (!list.length) { $("#grid").innerHTML = `<div class="empty">${items.length ? "Nothing for this filter." : "No posts, videos or ads collected. Add a Scrape Creators key (top right) to pull ads and social posts."}</div>`; return; }
  $("#grid").replaceChildren(...list.slice(0, 200).map(card));
}
$("#filters").addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (b) { filter = b.dataset.f; renderContent(); } });
$("#filters").addEventListener("change", e => { if (e.target.id === "sortSel") { sortBy = e.target.value; renderContent(); } });

function card(c) {
  const [label, color] = PLATFORMS[c.platform] || [c.platform, "#999"];
  const el = document.createElement("article");
  el.className = "item";
  const hasMedia = c.thumb || c.video;
  if (hasMedia) {
    const media = document.createElement("div");
    media.className = "media" + (c.platform === "youtube" || c.platform === "x" || c.platform === "google_ads" || c.platform === "linkedin_ads" ? " wide" : "");
    if (c.thumb) {
      const img = document.createElement("img");
      img.src = safeUrl(c.thumb); img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
      img.onerror = () => { img.remove(); if (!c.video) media.innerHTML = '<span class="ph">preview expired · open the original</span>'; };
      media.appendChild(img);
    }
    if (c.video) {
      const btn = document.createElement("button");
      btn.className = "play"; btn.setAttribute("aria-label", "Play video"); btn.innerHTML = "<span>▶</span>";
      btn.onclick = () => {
        const v = document.createElement("video");
        v.src = safeUrl(c.video); v.controls = true; v.autoplay = true; v.playsInline = true; v.referrerPolicy = "no-referrer";
        v.onerror = () => { media.innerHTML = '<span class="ph">video link expired · open the original</span>'; };
        media.replaceChildren(v);
      };
      media.appendChild(btn);
    }
    el.appendChild(media);
  } else el.classList.add("textonly");
  const m = c.metrics || {};
  const stats = [
    m.runningDays != null ? `<span><b>${m.runningDays}d</b> running</span>` : "",
    m.views != null ? `<span><b>${fmtN(m.views)}</b> views</span>` : "",
    m.likes != null ? `<span><b>${fmtN(m.likes)}</b> likes</span>` : "",
    m.comments != null ? `<span><b>${fmtN(m.comments)}</b> comments</span>` : "",
    m.shares != null ? `<span><b>${fmtN(m.shares)}</b> shares</span>` : "",
    m.score != null ? `<span><b>${fmtN(m.score)}</b> upvotes</span>` : "",
    m.variants > 1 ? `<span><b>${m.variants}</b> variants</span>` : "",
  ].join("");
  const hot = t => /long-running|top|founder|ranks on Google/.test(t);
  const body = document.createElement("div");
  body.className = "body";
  body.innerHTML = `
    <div class="top"><span class="plat"><i style="background:${color}"></i>${esc(label)}</span>${c.kind === "comment" ? "· comment" : ""}${c.status ? `<span class="state ${c.status}">${c.status === "active" ? "Active" : "Inactive"}</span>` : ""}</div>
    ${c.title ? `<h4>${esc(c.title)}</h4>` : ""}
    ${c.text ? `<p>${esc(c.text)}</p>` : ""}
    ${stats ? `<div class="stats">${stats}</div>` : ""}
    ${c.tags?.length ? `<div class="tags">${c.tags.map(t => `<span class="${hot(t) ? "hot" : ""}">${esc(t)}</span>`).join("")}</div>` : ""}
    <div class="foot"><span>${esc(c.author || "")}${c.date ? ` · ${esc(c.date)}` : ""}</span><a href="${esc(safeUrl(c.url))}" target="_blank" rel="noreferrer">Open ↗</a></div>`;
  el.appendChild(body);
  return el;
}

function renderFounders(list) {
  const shown = list.filter(f => f.confidence !== "low" || list.length <= 2).slice(0, 4);
  $("#foundersCard").hidden = !shown.length;
  $("#founders").replaceChildren(...shown.map(f => {
    const row = document.createElement("div");
    row.className = "founder";
    const pic = f.photo ? logoEl([f.photo], f.name, "") : Object.assign(document.createElement("span"), { className: "initials", textContent: initials(f.name) });
    if (pic.tagName === "IMG") pic.className = "";
    const reach = [f.linkedinFollowers ? `${Number(f.linkedinFollowers).toLocaleString()} LinkedIn` : "", f.x?.followers ? `${Number(f.x.followers).toLocaleString()} X` : ""].filter(Boolean).join(" · ");
    const info = document.createElement("div");
    info.innerHTML = `<b>${esc(f.name)}</b><span class="conf ${f.confidence}" title="Sources: ${esc((f.sources || []).join(", "))}">${esc(f.confidence)}</span>
      <div class="role">${esc(f.role || "")}${reach ? ` · ${reach}` : ""}${f.postsRecently ? " · posting" : ""}</div>
      <div class="links">${f.linkedin ? `<a href="${esc(safeUrl(f.linkedin))}" target="_blank" rel="noreferrer">LinkedIn ↗</a>` : ""}${f.x ? `<a href="${esc(safeUrl(f.x.url))}" target="_blank" rel="noreferrer">@${esc(f.x.handle)} ↗</a>` : ""}</div>`;
    row.append(pic, info);
    return row;
  }));
}

$("#score").addEventListener("click", e => {
  const b = e.target.closest("[data-ids]");
  if (b && b.dataset.ids) openEvidence(b.dataset.ids.split(","));
});

let renderQueued = false;
function renderReport(streaming) {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    const el = $("#report");
    el.hidden = tab !== "report";
    $("#skeleton").hidden = true;
    // Model-written HTML: no images/media/forms (a prompt-injected report could beacon data via image URLs).
    const html = DOMPurify.sanitize(marked.parse(state.markdown, { gfm: true }), { ADD_ATTR: ["target"], FORBID_TAGS: ["img", "picture", "source", "video", "audio", "iframe", "object", "embed", "svg", "math", "form", "input", "button", "style", "link", "meta"], FORBID_ATTR: ["style", "srcset"], ALLOWED_URI_REGEXP: /^(?:https?:|#)/i });
    el.innerHTML = html;
    linkCitations(el);
    el.querySelectorAll("a[href]").forEach(a => { a.href = safeUrl(a.getAttribute("href")); a.target = "_blank"; a.rel = "noreferrer noopener"; });
    if (streaming) { const last = el.lastElementChild; if (last) last.classList.add("caret"); }
  });
}

function linkCitations(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest("code,pre,.cite") ? NodeFilter.FILTER_REJECT : /\[?E\d+/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parts = node.nodeValue.split(/(\[E\d+(?:\s*,\s*E\d+)*\]|\bE\d+\b)/g);
    if (parts.length === 1) continue;
    const frag = document.createDocumentFragment();
    for (const part of parts) {
      const ids = part.match(/E\d+/g);
      if (ids && /^(\[E\d+(\s*,\s*E\d+)*\]|E\d+)$/.test(part) && ids.every(id => state.bundle?.evidence.some(e => e.id === id))) {
        ids.forEach(id => { const b = document.createElement("button"); b.className = "cite"; b.textContent = id; b.dataset.id = id; frag.appendChild(b); });
      } else frag.appendChild(document.createTextNode(part));
    }
    node.replaceWith(frag);
  }
}

$("#report").addEventListener("click", e => { const c = e.target.closest(".cite"); if (c) openEvidence([c.dataset.id]); });

function openEvidence(ids) {
  const items = (state.bundle?.evidence || []).filter(e => ids.includes(e.id));
  if (!items.length) return;
  $("#dTitle").textContent = items.length === 1 ? `${items[0].id} · ${items[0].title}` : `${items.length} evidence items`;
  $("#dMeta").innerHTML = items.map(e => `${esc(e.source)} · ${e.kind}${e.url ? ` · <a href="${esc(safeUrl(e.url))}" target="_blank" rel="noreferrer">open source ↗</a>` : ""}`).join("<br>");
  $("#dBody").textContent = items.map(e => (items.length > 1 ? `${e.id} · ${e.title}\n` : "") + JSON.stringify(e.data, null, 2)).join("\n\n");
  $("#drawer").classList.add("open"); $("#scrim").classList.add("open"); $("#drawer").setAttribute("aria-hidden", "false");
}
function closeDrawer() { $("#drawer").classList.remove("open"); $("#scrim").classList.remove("open"); $("#drawer").setAttribute("aria-hidden", "true"); }
$("#dClose").addEventListener("click", closeDrawer);
$("#scrim").addEventListener("click", closeDrawer);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });

function showValidation(v) {
  if (!v) return;
  const fails = v.checks.filter(c => !c.ok);
  $("#valBadge").innerHTML = `<span class="badge ${v.ok ? "ok" : "warn"}" title="${esc(v.checks.map(c => `${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`).join("\n"))}">${v.ok ? "Structure checked · facts need review" : `⚠ ${fails.length} check${fails.length > 1 ? "s" : ""} failed`}</span>`;
}

function finishReport(markdown) {
  state.markdown = markdown;
  renderReport(false);
  $("#cta").hidden = false;
  $("#copyBtn").hidden = $("#dlBtn").hidden = false;
}

function appendLog(msg, err) {
  const el = $("#log");
  el.hidden = false;
  const line = document.createElement("div");
  if (err) line.className = "err";
  line.textContent = msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function openJob(jobId, fallbackRunId) {
  resetRun("Collecting…");
  let received = 0;
  state.jobId = jobId;
  state.engine = engine;
  $("#cancelBtn").hidden = false;
  if (es) es.close();
  es = new EventSource(`/api/jobs/${jobId}/events`);
  const t0 = {};
  es.onmessage = msg => {
    received++;
    const e = JSON.parse(msg.data);
    if (e.type === "stage") {
      if (e.stage === "collect") return;
      if (e.state === "start") t0[e.stage] = performance.now();
      state.stages[e.stage] = { state: e.state, detail: e.detail, ms: e.state !== "start" && t0[e.stage] ? performance.now() - t0[e.stage] : undefined };
      renderStages();
      if (e.stage === "write" && e.state === "start") { $("#status").textContent = "Writing the playbook…"; $("#log").hidden = true; }
    } else if (e.type === "log") {
      if (e.msg.trim().startsWith("!")) appendLog(e.msg.trim(), true);
    } else if (e.type === "status") {
      $("#status").textContent = e.msg;
    } else if (e.type === "bundle") {
      state.runId = e.runId;
      renderBundle(e.bundle);
      history.replaceState(null, "", `#/run/${encodeURIComponent(e.runId)}?job=${jobId}`);
      $("#status").textContent = `${e.bundle.evidence.length} evidence items collected`;
    } else if (e.type === "delta") {
      state.markdown = e.replace ? e.text : state.markdown + e.text;
      renderReport(true);
    } else if (e.type === "report") {
      state.engine = e.engine;
      finishReport(e.markdown);
      showValidation(e.validation);
      $("#status").textContent = e.engine === "none" ? "Evidence report" : `Written by ${engineLabel(e.engine)}${e.model ? ` · ${e.model}` : ""}`;
    } else if (e.type === "error") {
      $("#error").hidden = false; $("#error").textContent = e.message;
      $("#skeleton").hidden = true;
      Object.entries(state.stages).forEach(([k, s]) => { if (s.state === "start") s.state = "error"; });
      renderStages();
    } else if (e.type === "done") {
      state.done = true; $("#cancelBtn").hidden = true; es.close();
      if (!state.markdown) $("#skeleton").hidden = true;
    }
  };
  es.onerror = () => {
    es.close();
    // Job gone (server restarted or expired): show the saved run instead.
    if (!received && fallbackRunId) return openRun(fallbackRunId);
    if (!state.done) $("#status").textContent = "Connection lost. Refresh to reload the saved run.";
  };
}

function engineLabel(id) { return (status?.engines.find(e => e.id === id) || {}).label || id; }

async function openRun(runId) {
  resetRun("Loading…");
  STAGES.forEach(([k]) => (state.stages[k] = { state: "done" }));
  try {
    const data = await api(`/api/runs/${encodeURIComponent(runId)}`);
    state.runId = runId;
    state.engine = data.report?.engine || "none";
    renderStages();
    renderBundle(data.bundle);
    if (data.report) {
      finishReport(data.report.markdown);
      showValidation(data.validation);
      $("#status").textContent = `Written by ${engineLabel(data.report.engine)}${data.report.model ? ` · ${data.report.model}` : ""}`;
    } else {
      $("#skeleton").hidden = true;
      if ((data.bundle.content || []).length) setTab("content");
      $("#status").innerHTML = `Evidence only. <button class="btn small" id="writeNow">Write the playbook with ${esc(engineLabel(engine))}</button>`;
      $("#writeNow").onclick = () => rerun(data.bundle.target.input);
    }
  } catch (err) {
    $("#skeleton").hidden = true; $("#error").hidden = false; $("#error").textContent = err.message;
  }
}

async function rerun(url) {
  const { jobId } = await api("/api/runs", { method: "POST", body: JSON.stringify({ url, engine }) });
  location.hash = `#/job/${jobId}`;
}

$("#cancelBtn").addEventListener("click", async () => { if (state.jobId) await api(`/api/jobs/${state.jobId}/cancel`, { method: "POST" }).catch(() => {}); toast("Cancelling…"); });
$("#copyBtn").addEventListener("click", async () => { await navigator.clipboard.writeText(state.markdown); toast("Copied"); });
$("#dlBtn").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([state.markdown], { type: "text/markdown" }));
  a.download = `${state.runId || "report"}.md`;
  a.click();
});

// ---- Key dialog -------------------------------------------------------------
function openKey() { $("#keyInput").value = ""; $("#keyDialog").showModal(); setTimeout(() => $("#keyInput").focus(), 30); }
$("#keyPill").addEventListener("click", openKey);
document.querySelectorAll("[data-open-key]").forEach(b => b.addEventListener("click", openKey));
$("#keyDialog").addEventListener("close", async () => {
  if ($("#keyDialog").returnValue !== "save") return;
  await api("/api/settings", { method: "POST", body: JSON.stringify({ scrapecreatorsKey: $("#keyInput").value }) });
  await refreshStatus();
  toast($("#keyInput").value ? "Key saved" : "Key removed");
});

// ---- Router -------------------------------------------------------------------
function route() {
  const h = location.hash || "#/";
  const job = h.match(/^#\/job\/([a-z0-9-]+)/);
  const run = h.match(/^#\/run\/([^?]+)(?:\?job=([a-z0-9-]+))?/);
  $("#home").hidden = !!(job || run);
  $("#runView").hidden = !(job || run);
  closeDrawer();
  if (job) openJob(job[1]);
  else if (run && run[2] && state?.jobId === run[2]) { /* live job already attached */ }
  else if (run && run[2]) openJob(run[2], decodeURIComponent(run[1]));
  else if (run) openRun(decodeURIComponent(run[1]));
  else { if (es) es.close(); document.title = "REM · Reverse Engineer Marketing"; renderRecent(); setTimeout(() => $("#url").focus(), 0); }
}
window.addEventListener("hashchange", route);
refreshStatus().then(route).catch(err => { document.body.innerHTML = `<p style="padding:24px">Could not reach the REM server: ${esc(err.message)}</p>`; });
