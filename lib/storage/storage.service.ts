import {
  VILLA_IMAGES_BUCKET,
  parseVillaStorageUrl,
  removeVillaStorageFiles,
  removeVillaImageByUrl,
  type StorageRemoveResult,
} from "@/lib/villa-image.helpers";
import {
  resolveAssetUrl,
  SITE_ASSETS_BUCKET_NAME,
} from "@/lib/storage.helpers";
import { storageProvider } from "@/lib/storage";

/* ===============================================================
   🛡️ FAZ 32 — STORAGE SERVICE (Abstraction Layer)
   ===============================================================
   AMAÇ:
     Üst katmanların doğrudan `supabase.storage.from(...)` çağrısı
     yapmasını azalt. Bu dosya storage operasyonları için tek
     ENTRY POINT (read-side).

   KAPSAM (faz 32):
     - Public URL üretimi: villa + site-assets bucket'ları
     - Bulk remove: villa-images cleanup (retry + idempotent)
     - URL→path parse: legacy + new pattern union

   DOKUNULMAYAN:
     - Upload flow (admin gallery, admin watermark/logo/favicon
       upload sayfaları) — kendi inline supabase.storage çağrılarını
       sürdürür. Bu faz read + cleanup wrapping ile sınırlı.
     - villa-image.helpers.ts — bu dosya helpers'a delegate eder,
       duplicate logic YOK.
     - storage.helpers.ts — bu dosya helpers'a delegate eder,
       duplicate logic YOK.
     - Bucket isimleri & path conventions — değişmedi.

   IMPORT GRAFIĞI:
     Şu an:
       app/* → lib/villa-image.helpers (parse / remove / paths)
       app/* → lib/storage.helpers (public URL)
       app/* → @/lib/supabase  (raw storage)
     FAZ 32 sonrası tercih edilen yol (yeni kod için):
       app/* → lib/storage/storage.service
                ↓
              villa-image.helpers / storage.helpers / @/lib/supabase

     Mevcut kod path'leri ZORLA değiştirilmedi (minimal diff).
     İleride incremental olarak yeni service'e taşınabilir.

   GELECEK MIGRATION ZEMINI:
     Supabase Storage → S3 / başka bir provider geçişinde sadece bu
     dosya + villa-image.helpers / storage.helpers değişir. Service
     ve admin sayfaları aynı interface ile çalışmaya devam eder.
   =============================================================== */

/* ---------------------------------------------------------------
   🛡️ VILLA IMAGE — Public URL (villa-images bucket)
   --------------------------------------------------------------- */

/**
 * Bucket-relative path veya full URL girdisinden gallery render için
 * absolute URL üretir. mapVilla zaten DB'de FULL URL tutuyor (legacy
 * + new pattern union); bu wrapper iki şekli de tolere eder.
 * NULL / empty → null.
 */
export function getVillaImagePublicUrl(
  pathOrUrl: string | null | undefined
): string | null {
  if (!pathOrUrl || typeof pathOrUrl !== "string") return null;
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return null;

  /* Full URL → direkt döndür (mevcut davranış). */
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  /* Bucket-relative path → public URL üret.
     FAZ 38: storageProvider delege. */
  return storageProvider.getPublicUrl(VILLA_IMAGES_BUCKET, trimmed);
}

/* ---------------------------------------------------------------
   🛡️ SITE-ASSETS — Public URL (logo / hero / category covers / ...)
   ---------------------------------------------------------------
   `resolveAssetUrl` zaten DB'deki iki format'ı (FULL URL + bucket
   path) normalize ediyor; service tarafında daha okunur isim ile
   re-export ediyoruz. */
export function getSiteAssetPublicUrl(
  value: string | null | undefined
): string | null {
  return resolveAssetUrl(value);
}

/* ---------------------------------------------------------------
   🛡️ VILLA IMAGE — Delete (bulk, retry, idempotent)
   ---------------------------------------------------------------
   villa-image.service > deleteVillaImage ve
   villa-admin.service > hardDeleteVilla zaten
   `removeVillaStorageFiles` / `removeVillaImageByUrl` helpers'ını
   kullanıyor. Burada storage service çatısı altında re-export:
   yeni call site'lar tek import path'i ile çalışsın. */

/**
 * Verilen bucket + path dizisini bulk remove. Retry + idempotent.
 * (Helper davranışı birebir korunur.)
 */
export function deleteStorageFiles(
  bucket: string,
  paths: string[]
): Promise<StorageRemoveResult> {
  return removeVillaStorageFiles(bucket, paths);
}

/**
 * Tek URL/path girdisinden bucket+path parse edip remove eder.
 * (Helper davranışı birebir korunur.)
 */
export function deleteVillaImage(
  urlOrPath: string | null | undefined
): Promise<StorageRemoveResult> {
  return removeVillaImageByUrl(urlOrPath);
}

/* ---------------------------------------------------------------
   🛡️ URL / PATH PARSE
   ---------------------------------------------------------------
   `parseVillaStorageUrl` legacy + new pattern union destekler.
   Service çatısı altında re-export — yeni call site'lar villa-image
   helpers internals'ını tanımak zorunda kalmaz. */
export function parseStorageUrl(
  urlOrPath: string | null | undefined
): { bucket: string; path: string } | null {
  return parseVillaStorageUrl(urlOrPath);
}

/* ---------------------------------------------------------------
   🛡️ BUCKET CONSTANTS — single import path
   ---------------------------------------------------------------
   Yeni kod tek bir yerden bucket adlarını alabilir. Mevcut import
   path'leri (lib/villa-image.helpers, lib/storage.helpers) zaten
   çalışıyor; bu sadece convenience re-export.
*/
export const STORAGE_BUCKETS = {
  VILLA_IMAGES: VILLA_IMAGES_BUCKET,
  SITE_ASSETS: SITE_ASSETS_BUCKET_NAME,
} as const;

/* ---------------------------------------------------------------
   🛡️ TYPE RE-EXPORT — call site'lar tek dosyadan tip alabilsin.
   --------------------------------------------------------------- */
export type { StorageRemoveResult };
