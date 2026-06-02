import { supabase } from "@/lib/supabase";

import type { StorageProvider } from "./storage.provider";
import type {
  StorageRemoveResult,
  StorageSignedUrlResult,
  StorageUploadOptions,
  StorageUploadResult,
} from "./storage.types";

/* ===============================================================
   🛡️ FAZ 38 — SUPABASE STORAGE PROVIDER (Implementation)
   ===============================================================
   StorageProvider interface'inin Supabase Storage implementation'u.
   TEK doğrudan `supabase.storage.*` tüketici — diğer tüm modüller
   provider üzerinden çağırır.

   ⚠️ KESIN KURAL — BYTE-IDENTICAL DAVRANIŞ:
     - upload: `.from(bucket).upload(path, body, options)` aynen
     - remove: bulk + retry + idempotent (3 attempt, 200ms / 400ms
       exponential backoff) — `lib/villa-image.helpers.ts >
       removeVillaStorageFiles` davranışıyla byte-identical.
     - getPublicUrl: `.from(bucket).getPublicUrl(path).data.publicUrl`
     - createSignedUrl: `.from(bucket).createSignedUrl(path, expiresIn)`

   ⚠️ Console tag'leri provider sınırından dışarı sızdırılmaz —
   storage helpers'ın console tag'leri caller'da (lib/storage.helpers
   ve villa-image.helpers) ayrı olarak yaşamaya devam eder.
   ÇOK ÖZEL bir durum hariç: `removeFiles` retry exhaust olduğunda
   diagnostic için `[storage.supabase.remove] FAILED_AFTER_RETRY`
   tag'i emit edilir (mevcut `[villa-image.storage.remove]
   FAILED_AFTER_RETRY` ile semantic-identical; yeni tag aynı bilgiyi
   provider perspektifinden taşır).

   AGGREGATE BOUNDARY:
     - villa-images bucket (gallery)
     - site-assets bucket (logo, watermark, branding, covers)
     - Diğer bucket'lar (gelecek) — aynı provider, aynı interface.
   =============================================================== */

/* Retry configuration — `lib/villa-image.helpers.ts` mevcut sabitleri
   ile birebir aynı; provider ayrı kopya tutar ki bağımlılık çift
   yön kurulmasın. */
const REMOVE_MAX_ATTEMPTS = 3;
const REMOVE_BASE_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const supabaseStorageProvider: StorageProvider = {
  /* ===============================================================
     UPLOAD — single blob/buffer → bucket-relative path
     ===============================================================
     Caller upload sonrası getPublicUrl ile absolute URL üretir
     (veya DB'ye path yazar; caller policy). Provider URL üretmez.
  =============================================================== */
  async upload(
    bucket: string,
    path: string,
    body: Blob | ArrayBuffer | Uint8Array,
    options?: StorageUploadOptions
  ): Promise<StorageUploadResult> {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, body, {
        contentType: options?.contentType,
        upsert: options?.upsert,
        cacheControl: options?.cacheControl,
      });
    if (error) {
      return { ok: false, error: error.message || "" };
    }
    return { ok: true };
  },

  /* ===============================================================
     REMOVE — bulk + retry + idempotent
     ===============================================================
     Davranış: `lib/villa-image.helpers.ts > removeVillaStorageFiles`
     ile byte-identical. Empty input → instant ok. "Not found"
     idempotent. Retry: 0ms → 200ms → 400ms (exponential).
  =============================================================== */
  async remove(
    bucket: string,
    paths: string[]
  ): Promise<StorageRemoveResult> {
    if (!paths || paths.length === 0) {
      return { ok: true, failed: [], attempts: 0 };
    }
    const uniquePaths = Array.from(
      new Set(
        paths.filter(
          (p) => typeof p === "string" && p.trim().length > 0
        )
      )
    );
    if (uniquePaths.length === 0) {
      return { ok: true, failed: [], attempts: 0 };
    }

    let attempt = 0;
    let lastErrorMsg = "";
    while (attempt < REMOVE_MAX_ATTEMPTS) {
      attempt++;
      const { error } = await supabase.storage
        .from(bucket)
        .remove(uniquePaths);
      if (!error) {
        return { ok: true, failed: [], attempts: attempt };
      }
      lastErrorMsg = error.message || "";
      /* Idempotent: "not found" / "object does not exist" → success. */
      if (
        /not[_ ]?found|does not exist|object[_ ]?not[_ ]?found/i.test(
          lastErrorMsg
        )
      ) {
        return { ok: true, failed: [], attempts: attempt };
      }
      if (attempt < REMOVE_MAX_ATTEMPTS) {
        const delay = REMOVE_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }

    console.error("[storage.supabase.remove] FAILED_AFTER_RETRY", {
      bucket,
      paths: uniquePaths,
      attempts: attempt,
      lastError: lastErrorMsg,
    });
    return { ok: false, failed: uniquePaths, attempts: attempt };
  },

  /* ===============================================================
     PUBLIC URL — senkron
     ===============================================================
     Empty/invalid input → null (caller fallback'e düşer).
     Supabase'in URL formatı `https://{proj}.supabase.co/storage/v1/
     object/public/{bucket}/{path}` — değişmez.
  =============================================================== */
  getPublicUrl(bucket: string, path: string): string | null {
    if (!path || typeof path !== "string" || path.trim().length === 0) {
      return null;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl || null;
  },

  /* ===============================================================
     SIGNED URL — expires-in seconds
     ===============================================================
     Result envelope; throw etmez. Caller hata durumunda kendi
     fallback'ini yapar (ör. public URL'e düşmek).
  =============================================================== */
  async createSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number
  ): Promise<StorageSignedUrlResult> {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) {
      return {
        ok: false,
        error: error?.message || "Signed URL üretilemedi",
      };
    }
    return { ok: true, signedUrl: data.signedUrl };
  },

  /* ===============================================================
     EXISTS — NOT IMPLEMENTED (Faz 38)
     ===============================================================
     Supabase JS API'sinde native `exists` yok. `list({ search })`
     veya `createSignedUrl` HEAD probe ile yaklaşık çözüm var ama
     mevcut caller'lar bu metoda dokunmadığı için Faz 38'de eklenmez.
     Sonraki cycle'da gerçek kullanım çıkarsa implement edilir.
  =============================================================== */
  async exists(_bucket: string, _path: string): Promise<boolean> {
    void _bucket;
    void _path;
    throw new Error(
      "[storage.supabase.exists] NOT_IMPLEMENTED (Faz 38)"
    );
  },
};
