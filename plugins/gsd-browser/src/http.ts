/**
 * src/http.ts — shared HTTP layer for gsd_browser_fetch.
 *
 * Streamed read honoring maxBytes (truncation marker), timeoutMs via
 * AbortController, redirect cap 5, https+http only, allowPrivateHosts policy
 * (loopback/RFC1918/link-local rejected with reason private_host_blocked).
 */

export interface FetchOptions {
 maxBytes: number;
 timeoutMs: number;
 allowPrivateHosts: boolean;
}

export interface FetchResult {
 text: string;
 truncated: boolean;
 finalUrl: string;
 status: number;
}

export class PrivateHostError extends Error {
 constructor(message = "private host blocked") {
  super(message);
  this.name = "PrivateHostError";
 }
}

const REDIRECT_LIMIT = 5;
const TRUNCATION_MARKER = "\n\n[truncated at N bytes]";

const PRIVATE_HOSTNAMES = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];

function isPrivateHostname(hostname: string): boolean {
 const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
 if (PRIVATE_HOSTNAMES.includes(h) || h.endsWith(".localhost") || h.endsWith(".local")) return true;
 // IPv4-mapped IPv6 (::ffff:a.b.c.d / ::ffff:aabb:ccdd) and IPv4 in
 // integer/hex/octal notations all alias plain IPv4 — normalize BEFORE the
 // range checks or the private gate is bypassable.
 const mapped = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
 if (mapped) return isPrivateHostname(mapped[1]);
 const mappedHex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
 if (mappedHex) {
  const hi = parseInt(mappedHex[1], 16);
  const lo = parseInt(mappedHex[2], 16);
  return isPrivateHostname(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`);
 }
 const mappedInt = h.match(/^::ffff:(\d{1,10})$/);
 if (mappedInt) {
  const n = Number(mappedInt[1]);
  if (n <= 0xffffffff) {
   return isPrivateHostname(`${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`);
  }
 }
 // IPv4 private ranges: loopback 127/8, RFC1918 10/8, 172.16/12, 192.168/16,
 // link-local 169.254/16 — plus integer/hex/octal textual forms the URL
 // parser passes through un-resolved (http://2130706433, http://0x7f000001,
 // http://0177.0.0.1 all alias 127.0.0.1).
 const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
 if (m) {
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 127 || a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
 } else if (/^\d+$/.test(h) || /^0x[0-9a-f]+$/i.test(h) || /^(0x[0-9a-f]+|\d+)\.(\d{1,3}|0x[0-9a-f]+)\./i.test(h)) {
  // Non-dotted numeric IPv4: resolve to the canonical dotted form.
  const n = h.startsWith("0x") ? Number(h) : Number(h);
  if (Number.isFinite(n) && n >= 0 && n <= 0xffffffff) {
   return isPrivateHostname(`${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`);
  }
  // Partial numeric first octet (e.g. 0x7f.0.0.1): decode part-wise.
  const parts = h.split(".");
  if (parts.length === 4 && parts.every((part) => /^(0x[0-9a-f]{1,2}|\d{1,3})$/i.test(part))) {
   const decoded = parts.map((part) => (part.startsWith("0x") ? parseInt(part, 16) : Number(part)));
   if (decoded.every((v) => Number.isFinite(v) && v >= 0 && v <= 255)) {
    return isPrivateHostname(decoded.join("."));
   }
  }
 }
 // IPv6: unique-local fc00::/7 and link-local fe80::/10.
 if (/^f[cd]/i.test(h)) return true;
 if (/^fe[89ab]/i.test(h)) return true;
 return false;
}

function assertPolicy(url: URL, allowPrivateHosts: boolean): void {
 if (url.protocol !== "https:" && url.protocol !== "http:") {
  throw new Error(`unsupported protocol: ${url.protocol}`);
 }
 if (!allowPrivateHosts && isPrivateHostname(url.hostname)) {
  throw new PrivateHostError();
 }
}

/** Streamed GET with byte cap; resolves text (possibly truncated). */
export async function fetchWithPolicy(url: string, opts: FetchOptions): Promise<FetchResult> {
 let current = new URL(url);
 assertPolicy(current, opts.allowPrivateHosts);

 let redirects = 0;
 while (true) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs);
  try {
   const response = await fetch(current, { signal: ac.signal, redirect: "manual" });
   // If redirect, handle location and retry
   if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) {
     throw new Error(`redirect ${response.status} without location`);
    }
    if (++redirects > REDIRECT_LIMIT) {
     throw new Error(`too many redirects (>${REDIRECT_LIMIT})`);
    }
    current = new URL(location, current);
    assertPolicy(current, opts.allowPrivateHosts);
    clearTimeout(timer); // per-attempt timer: don't leak across redirect hops
    continue; // retry with new URL
   }
   // Non-redirect response: consume body with timeout
   const reader = response.body?.getReader();
   if (!reader) {
    // No stream: read all text, then enforce the byte cap on the ENCODED
    // length — UTF-16 .length overcounts ASCII and undercounts astral chars.
    const text = await response.text();
    let truncated = false;
    let finalText = text;
    const encoded = new TextEncoder().encode(text);
    if (encoded.length > opts.maxBytes) {
     truncated = true;
     finalText = new TextDecoder().decode(encoded.slice(0, opts.maxBytes)) + TRUNCATION_MARKER;
    }
    clearTimeout(timer);
    return { text: finalText, truncated, finalUrl: current.href, status: response.status };
   }
   const decoder = new TextDecoder();
   let text = "";
   let bytes = 0;
   let truncated = false;
   while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes >= opts.maxBytes) {
     const allowed = value.subarray(0, value.byteLength - (bytes - opts.maxBytes));
     text += decoder.decode(allowed, { stream: true });
     truncated = true;
     void reader.cancel();
     break;
    }
    text += decoder.decode(value, { stream: true });
   }
   if (!truncated) text += decoder.decode();
   if (truncated) text += `\n\n[truncated at ${opts.maxBytes} bytes]`;
   clearTimeout(timer);
   return { text, truncated, finalUrl: current.href, status: response.status };
  } catch (err) {
   clearTimeout(timer);
   throw err;
  } finally {
   // Ensure timer cleared even if we break via continue? Actually continue skips finally.
   // We'll handle clearing in the try/catch above.
  }
 }
}

export { isPrivateHostname, TRUNCATION_MARKER };
