// Explicit proxy support without allowing target DNS rebinding at the proxy.
// Resolve through a fixed HTTPS DNS service, then CONNECT to a checked IP literal.
// The original origin remains untouched for HTTP Host, TLS SNI and certificate checks.
import { isIP } from "node:net";
import { Client, ProxyAgent, fetch, type Dispatcher } from "undici";
import { readLimited } from "./response-body.js";

type CheckAddress = (address: string) => void;
interface DnsReply {
  Status?: number;
  Answer?: { type?: number; data?: string }[];
}

export function checkedDnsAddresses(replies: DnsReply[], check: CheckAddress): string[] {
  const addresses: string[] = [];
  for (const reply of replies) {
    if (reply.Status !== 0 || !Array.isArray(reply.Answer ?? [])) throw new Error("Public DNS lookup failed");
    for (const record of reply.Answer ?? []) {
      if (record.type !== 1 && record.type !== 28) continue;
      if (typeof record.data !== "string" || isIP(record.data) !== (record.type === 1 ? 4 : 6)) throw new Error("Invalid DNS address record");
      check(record.data);
      addresses.push(record.data);
    }
  }
  if (!addresses.length) throw new Error("Public DNS returned no addresses");
  // Prefer IPv4 for proxy compatibility, while validating ALL IPv4/IPv6 answers.
  return [...new Set(addresses)].sort((a, b) => isIP(a) - isIP(b));
}

export async function pinnedAuthority(authority: string, resolve: (hostname: string) => Promise<string[]>, check: CheckAddress): Promise<string> {
  const u = new URL(`http://${authority}`);
  if (u.username || u.password || u.pathname !== "/" || u.search || u.hash) throw new Error("Invalid CONNECT authority");
  const hostname = u.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) ? [hostname] : await resolve(hostname);
  if (!addresses.length) throw new Error("Public DNS returned no addresses");
  addresses.forEach(check);
  const address = addresses[0]!;
  return `${isIP(address) === 6 ? `[${address}]` : address}:${u.port || "80"}`;
}

export function createPinnedProxyAgent(uri: string, check: CheckAddress): ProxyAgent {
  const proxy = new URL(uri);
  if (proxy.protocol !== "http:" && proxy.protocol !== "https:") throw new Error("Pinned proxy requires an HTTP(S) proxy");
  // This separate agent is ONLY used for the fixed DNS endpoint, never source URLs.
  const dnsAgent = new ProxyAgent({ uri, connectTimeout: 10_000 });
  const resolve = async (hostname: string): Promise<string[]> => {
    const replies = await Promise.all(["A", "AAAA"].map(async type => {
      const url = new URL("https://dns.google/resolve");
      url.searchParams.set("name", hostname);
      url.searchParams.set("type", type);
      const response = await fetch(url, { dispatcher: dnsAgent, redirect: "error", signal: AbortSignal.timeout(10_000) });
      if (response.status !== 200) {
        await response.body?.cancel();
        throw new Error("Public DNS service unavailable");
      }
      return JSON.parse(await readLimited(response, 65_536)) as DnsReply;
    }));
    return checkedDnsAddresses(replies, check);
  };
  const agent = new ProxyAgent({
    uri, proxyTunnel: true, connectTimeout: 15_000,
    clientFactory(origin, options) {
      const client = new Client(origin, options);
      const connect = client.connect.bind(client);
      // ProxyAgent uses the promise overload. Preserve the original origin for TLS.
      client.connect = (async (params: Dispatcher.ConnectOptions) => {
        const authority = await pinnedAuthority(params.path!, resolve, check);
        return connect({ ...params, path: authority, headers: { ...params.headers, host: authority } });
      }) as typeof client.connect;
      return client;
    },
  });
  // Closing the source dispatcher must close its fixed DNS transport as well.
  const close = agent.close.bind(agent) as unknown as (callback: (err?: Error) => void) => void;
  agent.close = ((callback?: () => void) => {
    // Use the callback overload: Undici's promise overload calls this.close again.
    const closed = Promise.all([
      new Promise<void>((resolve, reject) => close(err => err ? reject(err) : resolve())),
      dnsAgent.close(),
    ]).then(() => undefined);
    if (callback) { closed.then(callback, callback); return; }
    return closed;
  }) as typeof agent.close;
  return agent;
}
