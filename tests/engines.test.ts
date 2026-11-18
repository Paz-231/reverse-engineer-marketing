import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { existsSync, statSync } from "node:fs";
const calls = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: calls.spawn }));
import { writerEnv, writeReport } from "../src/engines.js";

describe("report process boundary", () => {
  it("allows runtime locations but no keys or injected runtime options", () => {
    const env = writerEnv({ PATH: "/bin", HOME: "/safe-home", OPENAI_API_KEY: "test", ANTHROPIC_API_KEY: "test", ANTHROPIC_AUTH_TOKEN: "test", SCRAPECREATORS_API_KEY: "test", NODE_OPTIONS: "--import evil", LD_PRELOAD: "evil", RANDOM_SECRET: "test" });
    expect(env).toEqual({ PATH: "/bin", HOME: "/safe-home" });
  });
  it("fails closed for the unsafe nested Codex writer", async () => {
    await expect(writeReport("codex", {} as any)).rejects.toThrow("use REM through MCP");
    expect(calls.spawn).not.toHaveBeenCalled();
  });
  it("uses private unique scratch folders, disables Claude tools and removes scratch", async () => {
    const folders: string[] = [];
    calls.spawn.mockImplementation((_cmd, args, opts) => {
      folders.push(opts.cwd);
      expect(statSync(opts.cwd).mode & 0o777).toBe(0o700);
      expect(args[args.indexOf("--tools") + 1]).toBe("");
      expect(args).toContain("--strict-mcp-config");
      expect(args[args.indexOf("--setting-sources") + 1]).toBe("project");
      const p = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() });
      p.stdin.once("finish", () => {
        p.stdout.end(JSON.stringify({ type: "result", result: "Synthetic report" }) + "\n");
        setImmediate(() => p.emit("close", 0));
      });
      return p;
    });
    const bundle = { brand: "Audit", target: { input: "audit.example" }, generatedAt: "2026-11-18", evidence: [], unknowns: [], sources: [] } as any;
    await writeReport("claude-code", bundle); await writeReport("claude-code", bundle);
    expect(folders[0]).not.toBe(folders[1]);
    expect(folders.every(f => !existsSync(f))).toBe(true);
  });
});
