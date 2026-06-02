/* ===============================================================
   🛡️ SSRF HARDENING — SERVER-SIDE DNS-AWARE VALIDATOR
   ===============================================================
   ssrf.ts'in sync validator'ı string-level kontroller yapar; bu
   dosya ek olarak DNS resolve sonrası IP'leri private range guard'a
   sokar. Defense against DNS rebinding ve "public hostname →
   private IP" trick'leri.

   Bu dosya YALNIZ server tarafında import edilmelidir (route
   handlers, server actions, RSC, server-only services).
   `node:dns` Browser bundle'ında bulunmadığı için client-side
   import build hatası verir → doğal koruma.
=============================================================== */

import { promises as dns } from "node:dns";
import {
  validateExternalUrlStatic,
  isPrivateOrReservedIPv4,
  isBlockedIPv6,
  SAFE_REJECT_MESSAGE,
  type SsrfValidationResult,
} from "@/lib/security/ssrf";

/* validateExternalUrl(url) — full DNS-aware validation.
   1) Static validator (URL parse, protocol, userinfo, hostname/IP
      literal blocklist).
   2) Hostname DNS lookup (all=true) — herhangi bir resolved IP
      private/reserved/link-local ise REJECT.
   Pragmatik DNS rebinding defense: lookup ↔ fetch arasındaki TTL
   window'unda IP değişebilir; bu helper bunu mutlak garanti
   etmez ama % 99 saldırı vektörünü kapatır. Mutlak garanti için
   resolved IP'ye pinning + Host header rewrite gerekir (kapsam dışı). */
export async function validateExternalUrl(
  rawUrl: unknown
): Promise<SsrfValidationResult> {
  const staticRes = validateExternalUrlStatic(rawUrl);
  if (!staticRes.ok) return staticRes;

  const parsed = staticRes.url;
  const host = parsed.hostname;

  /* Eğer host zaten IP literal ise (static'te private check geçti →
     public IP), DNS lookup atlamaya gerek yok. */
  if (
    /^(\d{1,3}\.){3}\d{1,3}$/.test(host) ||
    host.includes(":")
  ) {
    return { ok: true, url: parsed };
  }

  /* DNS resolve — tüm adresleri al, herhangi biri private ise REJECT. */
  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    return {
      ok: false,
      error: "Bu URL çözümlenemedi (DNS hatası)",
      reason: "dns-fail",
    };
  }
  if (!addrs || addrs.length === 0) {
    return {
      ok: false,
      error: "Bu URL çözümlenemedi (DNS hatası)",
      reason: "dns-empty",
    };
  }
  for (const a of addrs) {
    if (a.family === 4) {
      if (isPrivateOrReservedIPv4(a.address)) {
        return {
          ok: false,
          error: SAFE_REJECT_MESSAGE,
          reason: "dns-private-ipv4",
        };
      }
    } else if (a.family === 6) {
      if (isBlockedIPv6(a.address)) {
        return {
          ok: false,
          error: SAFE_REJECT_MESSAGE,
          reason: "dns-private-ipv6",
        };
      }
    }
  }

  return { ok: true, url: parsed };
}

/* assertSafeExternalUrl — convenience throw variant.
   Servis katmanı catch'i mesajı kullanıcıya iletebilir. */
export async function assertSafeExternalUrl(rawUrl: unknown): Promise<URL> {
  const res = await validateExternalUrl(rawUrl);
  if (!res.ok) {
    const err = new Error(res.error) as Error & { ssrfReason?: string };
    err.ssrfReason = res.reason;
    throw err;
  }
  return res.url;
}
