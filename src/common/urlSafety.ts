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
