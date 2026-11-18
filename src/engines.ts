// Tool-free Claude writer and Anthropic API. Codex integrates through MCP,
// not a nested subprocess with read access to the host.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { synthesize, userPrompt } from "./analyze/synthesize.js";
import { loadHarness, systemPrompt } from "./harness.js";
import type { EvidenceBundle } from "./index.js";

export type EngineId = "claude-code" | "codex" | "anthropic-api" | "none";

export interface EngineInfo {
  id: EngineId;
  label: string;
  available: boolean;
  detail: string;
}

export async function detectEngines(): Promise<EngineInfo[]> {
  const claude = await version("claude");
  const api = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  return [
    { id: "claude-code", label: "Claude Code", available: Boolean(claude), detail: claude ? `${claude} · uses your Claude subscription` : "not installed (npm i -g @anthropic-ai/claude-code)" },
    { id: "codex", label: "Codex via MCP", available: false, detail: "Use REM as an MCP tool in Codex. The web subprocess writer is disabled because read-only is not tool isolation." },
    { id: "anthropic-api", label: "Anthropic API", available: api, detail: api ? "ANTHROPIC_API_KEY · billed per token" : "set ANTHROPIC_API_KEY" },
    { id: "none", label: "Evidence only", available: true, detail: "no AI, raw evidence report" },
  ];
}

function version(bin: string): Promise<string | null> {
  return new Promise(resolve => {
    const p = spawn(bin, ["--version"], { env: writerEnv(), stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", d => (out += d));
    p.on("error", () => resolve(null));
    p.on("close", code => resolve(code === 0 ? out.trim().split("\n")[0]!.slice(0, 60) : null));
    const timer = setTimeout(() => (p.kill(), resolve(null)), 8000);
    p.once("close", () => clearTimeout(timer));
    p.once("error", () => clearTimeout(timer));
    timer.unref();
  });
}

export interface WriteOptions {
  model?: string;
  onText?: (delta: string) => void;
  onStatus?: (msg: string) => void;
  signal?: AbortSignal;
}

export async function writeReport(engine: EngineId, bundle: EvidenceBundle, opts: WriteOptions = {}): Promise<{ markdown: string; model?: string }> {
  // The model name becomes a CLI argument: never let it look like a flag.
  if (opts.model && !/^[A-Za-z0-9][A-Za-z0-9._:/\[\]-]{0,80}$/.test(opts.model)) throw new Error("Invalid model name");
  if (engine === "claude-code") return claudeCode(bundle, opts);
  if (engine === "codex") throw new Error("Codex subprocess writer disabled: use REM through MCP in your agent instead");
  if (engine === "anthropic-api") {
    const res = await synthesize(bundle, { model: opts.model, onText: opts.onText });
    return { markdown: res.markdown, model: res.model };
  }
  throw new Error(`Engine ${engine} does not write reports`);
}

/** Allow only runtime/auth-location settings; never inherit API keys, hooks or injection flags. */
export function writerEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "HOME", "USERPROFILE", "SystemRoot", "WINDIR", "LANG", "LC_ALL", "TMPDIR", "TMP", "TEMP"]) {
    if (source[key]) env[key] = source[key];
  }
  return env;
}

async function claudeCode(bundle: EvidenceBundle, opts: WriteOptions): Promise<{ markdown: string; model?: string }> {
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--tools", "",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--setting-sources", "project",
    "--system-prompt", systemPrompt(loadHarness()),
  ];
  if (opts.model) args.push("--model", opts.model);
  const cwd = mkdtempSync(join(tmpdir(), "rem-writer-"));
  const timeout = AbortSignal.timeout(5 * 60_000);
  try {
    return await new Promise((resolve, reject) => {
      const p = spawn("claude", args, { cwd, env: writerEnv(), signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout });
      let text = "";
      let model: string | undefined;
      let final: string | undefined;
      let error: string | undefined;
      p.stderr.resume(); // Drain without exposing credentials echoed by the CLI.
      createInterface({ input: p.stdout }).on("line", line => {
        let m: any;
        try {
          m = JSON.parse(line);
        } catch {
          return;
        }
        if (m.type === "system" && m.subtype === "init") {
          model = m.model;
          opts.onStatus?.(`Claude Code (${m.model}${m.apiKeySource && m.apiKeySource !== "none" ? `, ${m.apiKeySource}` : ", subscription"}) is writing…`);
        } else if (m.type === "stream_event" && m.event?.type === "content_block_delta" && m.event.delta?.type === "text_delta") {
          text += m.event.delta.text;
          opts.onText?.(m.event.delta.text);
        } else if (m.type === "result") {
          if (m.is_error) error = String(m.result || m.subtype || "Claude Code failed");
          else final = m.result;
        }
      });
      p.on("error", err => reject(err));
      p.on("close", code => {
        const markdown = (final ?? text).trim();
        if (error) reject(new Error(error));
        else if (code !== 0 || !markdown) reject(new Error(`Claude Code failed (exit ${code}); check authentication and model availability`));
        else resolve({ markdown, model });
      });
      p.stdin.end(userPrompt(bundle));
    });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
