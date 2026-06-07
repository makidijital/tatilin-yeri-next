import { STORAGE_BUCKETS, type StorageBucket } from "./storage.constants";

/* ===============================================================
   🛡️ FAZ B — STORAGE READ LAYER: CDN CONFIG (client-safe)
   ===============================================================
   AMAÇ:
     Read (public URL) tarafını provider-agnostic CDN'e taşımak.
     `STORAGE_DRIVER=r2` iken `getPublicUrl` Supabase SDK yerine
     bucket başına CDN base URL'i üretir:
       villa-images → NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES (cdn.villayagel.com)
       site-assets  → NEXT_PUBLIC_CDN_BASE_SITE_ASSETS  (assets.villayagel.com)

   ⚠️ FAZ B KAPSAMI — yalnız READ:
     upload / remove / createSignedUrl AYNEN Supabase'de kalır
     (bu dosya onlara dokunmaz). Bu faz yalnız okuma URL'lerini
     CDN'e yönlendirir.

   ⚠️ ROLLBACK-SAFE DEFAULT:
     `NEXT_PUBLIC_STORAGE_DRIVER` tanımsız → "supabase" → bu modül
     resolveCdnPublicUrl'de daima `null` döner → caller Supabase
     getPublicUrl'e düşer → davranış BYTE-IDENTICAL. Üretimde CDN'e
     geçiş yalnız env flip ile; geri alma da env ile.

   ⚠️ CLIENT-SAFE:
     `import "server-only"` YOK — getPublicUrl hem RSC hem browser
     (VillaCard vs.) bağlamında çalışır. Bu yüzden tüm env'ler
     `NEXT_PUBLIC_` prefix'li (secret değil; yalnız public CDN host).
   =============================================================== */

/** Aktif storage sürücüsü. Default "supabase" (rollback-safe). */
export const STORAGE_DRIVER = (
  process.env.NEXT_PUBLIC_STORAGE_DRIVER || "supabase"
)
  .trim()
  .toLowerCase();

/** CDN-read açık mı? (yalnız read; upload her hâlükârda Supabase — Faz B). */
export function isCdnReadEnabled(): boolean {
  return (
    STORAGE_DRIVER === "r2" ||
    STORAGE_DRIVER === "s3" ||
    STORAGE_DRIVER === "cdn"
  );
}

/* Bucket → CDN base URL (trailing slash temizlenir; boş → undefined). */
const CDN_BASES: Record<string, string | undefined> = {
  [STORAGE_BUCKETS.VILLA_IMAGES]:
    (process.env.NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES || "").replace(
      /\/+$/,
      ""
    ) || undefined,
  [STORAGE_BUCKETS.SITE_ASSETS]:
    (process.env.NEXT_PUBLIC_CDN_BASE_SITE_ASSETS || "").replace(
      /\/+$/,
      ""
    ) || undefined,
};

/** Verilen bucket için CDN base URL (yoksa null). */
export function getCdnBaseForBucket(bucket: string): string | null {
  return CDN_BASES[bucket] ?? null;
}

/**
 * Driver=r2 VE bucket için CDN base tanımlıysa absolute CDN URL döner.
 * Aksi halde `null` → caller Supabase `getPublicUrl`'e düşer (rollback-safe).
 *   resolveCdnPublicUrl("villa-images", "villas/x/y.webp")
 *     → "https://cdn.villayagel.com/villas/x/y.webp"   (driver=r2)
 *     → null                                            (driver=supabase)
 */
export function resolveCdnPublicUrl(
  bucket: string,
  path: string
): string | null {
  if (!isCdnReadEnabled()) return null;
  if (!path || typeof path !== "string") return null;
  const trimmed = path.trim().replace(/^\/+/, "");
  if (!trimmed) return null;
  const base = getCdnBaseForBucket(bucket);
  if (!base) return null;
  return `${base}/${trimmed}`;
}

/**
 * CDN host → bucket eşlemesi (parseVillaStorageUrl remove yolu için).
 * Bir CDN URL'inin (cdn./assets.villayagel.com) hangi bucket'a ait
 * olduğunu, env'deki CDN base host'larıyla eşleştirerek bulur.
 * Eşleşme yoksa null.
 */
export function bucketFromCdnHost(host: string): StorageBucket | null {
  const h = (host || "").toLowerCase();
  const candidates: StorageBucket[] = [
    STORAGE_BUCKETS.VILLA_IMAGES,
    STORAGE_BUCKETS.SITE_ASSETS,
  ];
  for (const bucket of candidates) {
    const base = getCdnBaseForBucket(bucket);
    if (!base) continue;
    try {
      if (new URL(base).host.toLowerCase() === h) return bucket;
    } catch {
      /* malformed base → atla */
    }
  }
  return null;
}
