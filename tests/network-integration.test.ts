import { describe, it, expect, vi } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
const lookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup }));
import { fetchText } from "../src/http.js";

describe("actual HTTP client uses DNS guard", () => {
  it("never connects to a local service through a DNS hostname", async () => {
    let hits = 0;
    const server = createServer((_req, res) => { hits++; res.end("private synthetic service"); });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const port = (server.address() as AddressInfo).port;
    lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    try {
      await expect(fetchText(`http://rem-audit.example:${port}/`, { timeoutMs: 2000 })).rejects.toThrow();
      expect(lookup).toHaveBeenCalled();
      expect(hits).toBe(0);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
