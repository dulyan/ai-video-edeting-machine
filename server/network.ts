import dns from "node:dns/promises";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
export function isPublicAddress(address: string): boolean {
  if (net.isIP(address) === 6)
    return (
      !/^(::|fc|fd|fe[89ab]|ff)/i.test(address) &&
      !address.toLowerCase().startsWith("2001:db8")
    );
  const [a, b] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
export async function publicFetch(input: string): Promise<Response> {
  let url = new URL(input);
  for (let i = 0; i < 6; i++) {
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.port && !["80", "443"].includes(url.port))
    )
      throw new Error("Use a public HTTP(S) URL");
    const addresses = await dns.lookup(url.hostname.replace(/^\[|\]$/g, ""), {
      all: true,
    });
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
      throw new Error("Private network URLs are not allowed");
    // Pin the validated address into this exact connection; never resolve a second time.
    const address = addresses[0];
    const response = await new Promise<Response>((resolve, reject) => {
      const request = (url.protocol === "https:" ? https : http).request(
        url,
        {
          headers: { "User-Agent": "AI-Video-Edeting-Machine/1.0" },
          lookup: ((_hostname: any, options: any, callback: any) => {
            if (options?.all)
              callback(null, [
                { address: address.address, family: address.family },
              ]);
            else callback(null, address.address, address.family);
          }) as any,
        },
        (incoming) => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(incoming.headers)) {
            if (Array.isArray(value))
              value.forEach((v) => headers.append(name, v));
            else if (value !== undefined) headers.set(name, value);
          }
          resolve(
            new Response(
              [204, 304].includes(incoming.statusCode || 200)
                ? null
                : (Readable.toWeb(incoming) as any),
              { status: incoming.statusCode || 200, headers },
            ),
          );
        },
      );
      request.setTimeout(120000, () =>
        request.destroy(new Error("Remote request timed out")),
      );
      request.on("error", reject);
      request.end();
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      url = new URL(response.headers.get("location") || "", url);
      continue;
    }
    if (!response.ok)
      throw new Error(`Remote server returned ${response.status}`);
    return response;
  }
  throw new Error("Too many redirects");
}
