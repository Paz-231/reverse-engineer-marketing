import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Response } from "undici";
const dnsFetch = vi.hoisted(() => vi.fn());
vi.mock("undici", async () => ({ ...await vi.importActual<any>("undici"), fetch: dnsFetch }));
import { checkedDnsAddresses, pinnedAuthority, createPinnedProxyAgent } from "../src/proxy.js";
import { assertPublicAddress } from "../src/http.js";
afterEach(() => vi.clearAllMocks());

describe("pinned proxy policy", () => {
  it("rejects mixed public/private IPv4 and IPv6 answers", () => {
    expect(() => checkedDnsAddresses([{ Status: 0, Answer: [{ type: 1, data: "1.1.1.1" }, { type: 28, data: "::1" }] }], assertPublicAddress)).toThrow("Blocked");
    expect(() => checkedDnsAddresses([{ Status: 0, Answer: [{ type: 1, data: "169.254.169.254" }] }], assertPublicAddress)).toThrow("Blocked");
  });
  it("fails closed on DNS errors, malformed records and absent addresses", () => {
    for (const replies of [[{ Status: 3 }], [{ Status: 0 }], [{ Status: 0, Answer: [{ type: 1, data: "not-an-ip" }] }]]) expect(() => checkedDnsAddresses(replies, assertPublicAddress)).toThrow();
  });
  it("retains port and pins the CONNECT destination to a validated IP", async () => {
    const resolve = vi.fn().mockResolvedValue(["1.1.1.1"]);
    expect(await pinnedAuthority("source.example:443", resolve, assertPublicAddress)).toBe("1.1.1.1:443");
    expect(resolve).toHaveBeenCalledWith("source.example");
    expect(await pinnedAuthority("[2606:4700:4700::1111]:443", resolve, assertPublicAddress)).toBe("[2606:4700:4700::1111]:443");
    expect(resolve).toHaveBeenCalledTimes(1);
  });
  it("rejects credentials and private literal targets before connecting", async () => {
    await expect(pinnedAuthority("user:pass@source.example:443", vi.fn(), assertPublicAddress)).rejects.toThrow();
    await expect(pinnedAuthority("127.0.0.1:80", vi.fn(), assertPublicAddress)).rejects.toThrow("Blocked");
  });
  it("uses a public IP in the actual proxy CONNECT request, never the untrusted hostname", async () => {
    const real = await vi.importActual<typeof import("undici")>("undici");
    const seen: { path?: string; host?: string }[] = [];
    const server = createServer();
    server.on("connect", (req, socket) => { seen.push({ path: req.url, host: req.headers.host }); socket.end("HTTP/1.1 502 Synthetic test endpoint\r\nContent-Length: 0\r\n\r\n"); });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const agent = createPinnedProxyAgent(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, assertPublicAddress);
    dnsFetch.mockImplementation(async (url: URL) => new Response(JSON.stringify({ Status: 0, Answer: url.searchParams.get("type") === "A" ? [{ type: 1, data: "1.1.1.1" }] : [] })));
    try {
      await expect(real.fetch("https://source.example/", { dispatcher: agent, signal: AbortSignal.timeout(2000) })).rejects.toThrow();
      expect(seen).toEqual([{ path: "1.1.1.1:443", host: "1.1.1.1:443" }]);
      for (const [url, opts] of dnsFetch.mock.calls) {
        expect(url.origin).toBe("https://dns.google"); expect(opts.redirect).toBe("error");
      }
    } finally { await agent.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
