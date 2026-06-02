/* ===============================================================
   🛡️ SSRF HARDENING — DENYLIST APPROACH
   ===============================================================
   "Trusted domain allowlist" DEĞİL — küçük yerel firmalar, custom
   agency domain'leri, branded calendar servisleri çalışmaya devam
   etmeli. Bunun yerine "unsafe/internal network denylist":
     • Public domain'ler / public IP'ler  → KABUL
     • Internal/private/loopback/link-local hedefler → REDDET

   Bu dosya BROWSER-SAFE (no Node API). Sync string-level kontrol
   yapar; DNS resolve'lu tam guard server tarafında ssrf.server.ts
   içindedir. İki helper aynı internal ip-range logic'ini paylaşır
   → tek source-of-truth.

   Integration:
     • createExternalCalendarSource (client) → validateExternalUrlStatic
     • syncExternalCalendarSource fetchIcsBody (server) → assertSafeExternalUrl
=============================================================== */

export type SsrfReason =
  | "empty"
  | "too-long"
  | "parse"
  | "protocol"
  | "userinfo"
  | "no-host"
  | "blocked-hostname"
  | "blocked-suffix"
  | "private-ipv4"
  | "private-ipv6"
  | "dns-fail"
  | "dns-empty"
  | "dns-private-ipv4"
  | "dns-private-ipv6"
  | "too-many-redirects"
  | "redirect-missing-location";

export type SsrfValidationResult =
  | { ok: true; url: URL }
  | { ok: false; error: string; reason: SsrfReason };

/* User-facing mesaj: internal IP raw gösterilmez. */
const SAFE_REJECT_MESSAGE = "Bu URL güvenlik nedeniyle kabul edilmiyor";

const MAX_URL_LEN = 2000;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/* Tam-hostname blocklist (case-insensitive). */
const BLOCKED_HOSTNAMES = new Set<string>([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "broadcasthost",
  "0",
  "0.0.0.0",
]);

/* Suffix blocklist — `.local` (mDNS), `.internal`, `.intranet`,
   `.intra`, `.corp`, `.home.arpa` (RFC 8375), `.lan`, `.private`. */
const BLOCKED_HOSTNAME_SUFFIXES = [
  ".local",
  ".localhost",
  ".lan",
  ".internal",
  ".intranet",
  ".intra",
  ".corp",
  ".private",
  ".home.arpa",
];

/* ---------------------------------------------------------------
   IPv4 — parse + private range check
   --------------------------------------------------------------
   WHATWG URL.hostname already normalizes weird literal forms
   (decimal, octal, hex, short form) → standard dotted-decimal.
   Buraya geldiğinde `host` standart "a.b.c.d" beklenir. */
function parseIPv4(host: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  let n = 0;
  for (let i = 1; i <= 4; i++) {
    const v = Number(m[i]);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    if (String(v) !== m[i]) return null; // leading zero gibi non-canonical reject
    n = (n << 8) | v;
  }
  return n >>> 0;
}

export function isPrivateOrReservedIPv4(host: string): boolean {
  const n = parseIPv4(host);
  if (n === null) return false;
  // 0.0.0.0/8 — "this" network
  if ((n & 0xff000000) === 0x00000000) return true;
  // 10.0.0.0/8
  if ((n & 0xff000000) === 0x0a000000) return true;
  // 100.64.0.0/10 — CGNAT
  if ((n & 0xffc00000) === 0x64400000) return true;
  // 127.0.0.0/8 — loopback
  if ((n & 0xff000000) === 0x7f000000) return true;
  // 169.254.0.0/16 — link-local
  if ((n & 0xffff0000) === 0xa9fe0000) return true;
  // 172.16.0.0/12
  if ((n & 0xfff00000) === 0xac100000) return true;
  // 192.0.0.0/24 — IETF protocol assignments
  if ((n & 0xffffff00) === 0xc0000000) return true;
  // 192.168.0.0/16
  if ((n & 0xffff0000) === 0xc0a80000) return true;
  // 198.18.0.0/15 — benchmarking
  if ((n & 0xfffe0000) === 0xc6120000) return true;
  // 224.0.0.0/4 — multicast
  if ((n & 0xf0000000) === 0xe0000000) return true;
  // 240.0.0.0/4 — reserved (255.255.255.255 dahil)
  if ((n & 0xf0000000) === 0xf0000000) return true;
  return false;
}

/* ---------------------------------------------------------------
   IPv6 — string-level blocked range check
   --------------------------------------------------------------
   WHATWG URL.hostname IPv6 literal'i `[::1]` → `::1` (bracket
   strip) ve canonical lower-case verir. Buraya canonical form
   beklenir. */
function isV6Literal(host: string): boolean {
  if (!host.includes(":")) return false;
  // Geniş tolerans — sadece `0-9a-f:.` karakterleri varsa
  return /^[0-9a-f:.]+$/i.test(host);
}

export function isBlockedIPv6(host: string): boolean {
  if (!isV6Literal(host)) return false;
  const v = host.toLowerCase();
  // :: (unspecified) ve ::1 (loopback)
  if (v === "::" || v === "::0" || v === "::1") return true;
  // IPv4-mapped ::ffff:a.b.c.d → underlying IPv4 kontrol
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(v);
  if (mapped) return isPrivateOrReservedIPv4(mapped[1]);
  // ::ffff:7f00:1 gibi hex form da olabilir — pragmatik kapsam dışı,
  // çoğu host bunu üretmez; URL.hostname normalize edilmiş bekleniyor.
  // fc00::/7 — Unique Local Address
  if (/^f[cd][0-9a-f]{2}:/.test(v)) return true;
  // fe80::/10 — link-local
  if (/^fe[89ab][0-9a-f]:/.test(v)) return true;
  // ff00::/8 — multicast
  if (/^ff[0-9a-f]{2}:/.test(v)) return true;
  return false;
}

/* ---------------------------------------------------------------
   Public sync validator — browser-safe.
   Yalnız string-level kontroller (URL parse, protocol, userinfo,
   hostname blocklist, IP literal). DNS resolve YAPMAZ — admin form
   submit'inde anlık feedback için. Server-side syncExternal* tarafı
   ek olarak DNS guard ekler (ssrf.server.ts). */
export function validateExternalUrlStatic(
  rawUrl: unknown
): SsrfValidationResult {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return { ok: false, error: "URL boş olamaz", reason: "empty" };
  }
  const trimmed = rawUrl.trim();
  if (trimmed.length > MAX_URL_LEN) {
    return { ok: false, error: "URL çok uzun", reason: "too-long" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Geçersiz URL formatı", reason: "parse" };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return {
      ok: false,
      error: "Yalnız http:// ve https:// adresleri kabul edilir",
      reason: "protocol",
    };
  }

  /* userinfo (user:pass@host) — SSRF bypass vektörü; iCal feed'lerde
     gerekli değil → reject. */
  if (parsed.username !== "" || parsed.password !== "") {
    return {
      ok: false,
      error: SAFE_REJECT_MESSAGE,
      reason: "userinfo",
    };
  }

  const host = parsed.hostname; // WHATWG URL already lower-cases & strips brackets
  if (!host) {
    return {
      ok: false,
      error: "URL host bilgisi içermiyor",
      reason: "no-host",
    };
  }

  if (BLOCKED_HOSTNAMES.has(host)) {
    return {
      ok: false,
      error: SAFE_REJECT_MESSAGE,
      reason: "blocked-hostname",
    };
  }
  for (const sfx of BLOCKED_HOSTNAME_SUFFIXES) {
    if (host.endsWith(sfx)) {
      return {
        ok: false,
        error: SAFE_REJECT_MESSAGE,
        reason: "blocked-suffix",
      };
    }
  }

  if (isPrivateOrReservedIPv4(host)) {
    return {
      ok: false,
      error: SAFE_REJECT_MESSAGE,
      reason: "private-ipv4",
    };
  }
  if (isBlockedIPv6(host)) {
    return {
      ok: false,
      error: SAFE_REJECT_MESSAGE,
      reason: "private-ipv6",
    };
  }

  return { ok: true, url: parsed };
}

/* Sadece string-level reject mesajı — server-side helper de aynı
   mesajı paylaşır. Internal IP raw gösterilmez. */
export { SAFE_REJECT_MESSAGE };
