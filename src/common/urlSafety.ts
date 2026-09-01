/**
 * SSRF guard shared by every upstream (LLM / Whisper / embedding) request.
 *
 * Rejects non-http(s) URLs and loopback / link-local / cloud-metadata hosts
 * (localhost, 127.0.0.0/8, 0.0.0.0, 169.254.0.0/16, ::1). Private LAN ranges
 * (10.x, 172.16-31.x, 192.168.x) are still allowed so self-hosted LLM endpoints
 * keep working.
 */
export function isSafeUpstreamUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  // IPv6 hostnames keep their brackets in URL.hostname; strip them before matching.
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "0.0.0.0" || host === "::" || host === "::1") return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const a = Number(host.split(".")[0]);
    const b = Number(host.split(".")[1]);
    if (a === 127 || a === 0) return false; // loopback / unspecified
    if (a === 169 && b === 254) return false; // link-local / cloud metadata
  }
  return true;
}

/**
 * Whether a URL points at a self-hosted endpoint (loopback or private LAN),
 * where no cloud API key is required. Used to let self-hosted FunASR (and other
 * local ASR/LLM servers) run without a fake cloud key.
 */
export function isPrivateEndpoint(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::" || host === "::1") return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (a === 127 || a === 0) return true;
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

/**
 * Whether a host string is loopback / private / link-local / metadata.
 * Used to block SSRF when a *remote* URL is fetched on the user's behalf
 * (e.g. a video URL handed to yt-dlp). Unlike isPrivateEndpoint / isSafeUpstreamUrl,
 * this rejects private LAN ranges too — there is no legitimate reason for a
 * user-supplied *video* URL to point at an internal host.
 */
function isNonPublicHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "::" || h === "::1" || h === "0.0.0.0" || h === "0") return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv4 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true; // unspecified / private / loopback
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 192 && b === 0) return true; // 192.0.0.0/24 special
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
    if (a >= 224) return true; // multicast/reserved
  }
  // IPv6 literals — treat link-local (fe80::/10) and loopback as non-public
  if (h.includes(":")) {
    if (h === "::1" || h === "::") return true;
    if (/^fe[89ab]/.test(h)) return true; // fe80::/10 link-local
    if (/^f[c-f]/.test(h)) return true; // fc00::/7 unique-local
  }
  return false;
}

/**
 * Synchronous check: is this a public http(s) URL (no loopback/private/link-local
 * literal host). Does NOT resolve DNS — use assertSafePublicUrl for the
 * DNS-resolution variant.
 */
export function isSafePublicHttpUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  return !isNonPublicHost(parsed.hostname);
}

/**
 * Resolve a hostname and reject it if it points at a non-public address
 * (defends against DNS-rebinding SSRF). Returns false on lookup failure.
 */
export async function resolveHostIsPublic(hostname: string): Promise<boolean> {
  const { lookup } = await import("dns").catch(() => ({ lookup: undefined as any }));
  if (!lookup) return false;
  const host = hostname.replace(/^\[|\]$/g, "");
  return new Promise<boolean>((resolve) => {
    lookup(host, { all: true, verbatim: true }, (err: NodeJS.ErrnoException | null, addresses: Array<{ address: string }>) => {
      if (err || !addresses?.length) { resolve(false); return; }
      // All resolved addresses must be public.
      for (const a of addresses) {
        if (isNonPublicHost(a.address)) { resolve(false); return; }
      }
      resolve(true);
    });
  });
}

/**
 * Full SSRF guard for user-supplied *remote* URLs (video links). Checks the
 * literal host, then resolves DNS and rejects if any address is non-public.
 * Throws an Error with a Chinese message on failure.
 */
export async function assertSafePublicUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("链接格式不正确");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("仅支持 http/https 链接");
  }
  const host = parsed.hostname;
  if (isNonPublicHost(host)) {
    throw new Error("不允许访问内部或本地地址");
  }
  // Skip DNS for IP literals (already checked) — no rebinding possible.
  const isIpLiteral = /^(\d{1,3}(\.\d{1,3}){3}|\[?[0-9a-f:]+\]?)$/i.test(host.replace(/^\[|\]$/g, ""));
  if (!isIpLiteral && !(await resolveHostIsPublic(host))) {
    throw new Error("无法解析链接地址或该地址不安全");
  }
}
