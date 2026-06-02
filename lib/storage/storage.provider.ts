import type {
  StorageRemoveResult,
  StorageSignedUrlResult,
  StorageUploadOptions,
  StorageUploadResult,
} from "./storage.types";

/* ===============================================================
   🛡️ FAZ 38 — STORAGE PROVIDER INTERFACE
   ===============================================================
   Storage provider için minimum kontrat. Supabase Storage / R2 / S3
   / Bunny aynı interface'i uygular. Provider-agnostic; bucket
   isimleri parametre olarak gelir (storage.constants.ts).

   ⚠️ KESIN KURAL — METHOD SEMANTIK:
     upload         → tek dosya upload; existing path'i upsert flag'i
                       belirler. ContentType + cacheControl provider'a
                       iletilir. Başarı/hata Result envelope.
     remove         → bulk remove; "not found" idempotent success
                       sayılır. Retry strategy provider implementation
                       sorumluluğunda (Supabase impl 3x exponential).
     getPublicUrl   → senkron; bucket-relative path → absolute URL.
                       Yoksa ya da geçersizse null.
     createSignedUrl→ async; expires-in seconds. Result envelope.
     exists         → optional probe (storage layer'da listing/head
                       Supabase API'sinde native değil — Faz 38'de
                       NOT-IMPLEMENTED placeholder; gerçek kullanım
                       için sonraki cycle).

   ⚠️ Repository pattern'iyle paralel: provider sessiz hata yönetir,
   business policy (throw mesajları, console tag'leri) caller
   tarafında kalır. provider sadece raw I/O + sonuç wrapping.
   =============================================================== */

export interface StorageProvider {
  /** Upload a single file/blob to a bucket-relative path.
   *  Returns success/error envelope; throw etmez. */
  upload(
    bucket: string,
    path: string,
    body: Blob | ArrayBuffer | Uint8Array,
    options?: StorageUploadOptions
  ): Promise<StorageUploadResult>;

  /** Bulk remove. "Not found" idempotent success (re-runs safe).
   *  Retry strategy provider'a özel; result envelope tüm caller'lar
   *  için byte-identical shape. */
  remove(bucket: string, paths: string[]): Promise<StorageRemoveResult>;

  /** Senkron public URL builder. Bucket-relative path → absolute
   *  HTTPS URL. Yoksa/empty/invalid → null. */
  getPublicUrl(bucket: string, path: string): string | null;

  /** Pre-signed URL — `expiresIn` seconds.
   *  Result envelope; throw etmez. */
  createSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number
  ): Promise<StorageSignedUrlResult>;

  /** Optional probe — Faz 38'de NOT-IMPLEMENTED (Supabase API'sinde
   *  native exists yok). Sonraki cycle'da `list({ search: path })`
   *  veya HEAD via createSignedUrl ile çözülür. */
  exists?(bucket: string, path: string): Promise<boolean>;
}
