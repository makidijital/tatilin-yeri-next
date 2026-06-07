/* ===============================================================
   🛡️ FAZ 38 — STORAGE BARREL
   ===============================================================
   Tek import path: `import { storageProvider, STORAGE_BUCKETS }
   from "@/lib/storage"`.

   Provider seçimi tek noktada — gelecekte Supabase yerine R2/S3
   adapter eklenirse burada switch:
     export const storageProvider: StorageProvider = isR2Enabled
       ? r2StorageProvider
       : supabaseStorageProvider;
   =============================================================== */

import { supabaseStorageProvider } from "./supabase-storage.provider";
import { resolveCdnPublicUrl } from "./cdn.config";
import { isR2WriteEnabled, isDualWriteEnabled } from "./write.config";
import type { StorageProvider } from "./storage.provider";
import type {
  StorageUploadOptions,
  StorageUploadResult,
  StorageRemoveResult,
} from "./storage.types";

export { STORAGE_BUCKETS } from "./storage.constants";
export type { StorageBucket } from "./storage.constants";

export type {
  StorageProvider,
} from "./storage.provider";
export type {
  StorageUploadOptions,
  StorageRemoveResult,
  StorageUploadResult,
  StorageSignedUrlResult,
  StoragePathParts,
} from "./storage.types";

/* 🛡️ FAZ B — Read Layer config re-export (CDN switch + host eşleme). */
export {
  STORAGE_DRIVER,
  isCdnReadEnabled,
  getCdnBaseForBucket,
  bucketFromCdnHost,
} from "./cdn.config";

/* ===============================================================
   🛡️ FAZ C / ADIM 2 — WRITE SEAM SWITCH (READ DOKUNULMADI)
   ===============================================================
   WRITE DRIVER — READ'TEN BAĞIMSIZ AYRI FLAG:
     `NEXT_PUBLIC_STORAGE_WRITE_DRIVER` (default "supabase").
     Read `STORAGE_DRIVER`'dan AYRI tutuldu çünkü production'da read
     zaten r2; tek flag olsaydı bu deploy upload/remove'u anında
     flip ederdi. Ayrı flag → bu deploy'da write SUPABASE kalır
     (sıfır canlı değişiklik); write R2'ye yalnız bu flag set edilince.

   DAVRANIŞ:
     write=supabase (default)         → supabaseStorageProvider (BYTE-IDENTICAL)
     write=r2 + BROWSER               → /api/admin/storage/{upload,remove}
     write=r2 + SERVER (hardDelete)   → supabaseStorageProvider (GEÇİCİ GUARD;
       server remove R2'ye SONRAKİ adımda taşınacak — hard delete kırılmaz)

   ⚠️ getPublicUrl / CDN / read: Faz B AYNEN korunur (DOKUNULMADI).
   ⚠️ adminFetch dinamik import (yalnız browser + r2 yolunda yüklenir);
     statik import grafiği değişmez → server bundle etkilenmez.

   DUAL-WRITE (Adım 3): NEXT_PUBLIC_STORAGE_DUAL_WRITE=true iken
     write=r2 + browser yolunda R2 (primary) + Supabase (best-effort)
     ikisine de yazılır → rollback'te veri kaybı olmaz. Flag'ler
     `write.config.ts`'te merkezli.

   ROLLBACK: NEXT_PUBLIC_STORAGE_WRITE_DRIVER=supabase (veya tanımsız)
     → upload/remove tamamen Supabase (rebuild gerektirir; NEXT_PUBLIC inline).
   =============================================================== */

/* Route-backed upload (yalnız browser + write=r2). adminFetch Bearer
   ekler; FormData → /api/admin/storage/upload. */
async function routeUpload(
  bucket: string,
  path: string,
  body: Blob | ArrayBuffer | Uint8Array,
  options?: StorageUploadOptions
): Promise<StorageUploadResult> {
  try {
    const { adminFetch } = await import("@/lib/admin-fetch");
    /* Blob → doğrudan; ArrayBuffer/Uint8Array → Blob'a sar. Cast yalnız
       tip (BlobPart generic strict'i); runtime'da ikisi de geçerli. */
    const blob =
      body instanceof Blob
        ? body
        : new Blob([body as unknown as BlobPart]);
    const form = new FormData();
    form.append("file", blob);
    form.append("bucket", bucket);
    form.append("path", path);
    if (options?.contentType) form.append("contentType", options.contentType);
    if (options?.cacheControl) form.append("cacheControl", options.cacheControl);
    form.append("upsert", String(options?.upsert ?? false));
    const res = await adminFetch("/api/admin/storage/upload", {
      method: "POST",
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "upload route error",
    };
  }
}

/* Route-backed remove (yalnız browser + write=r2).
   JSON → /api/admin/storage/remove. Sonuç envelope byte-identical. */
async function routeRemove(
  bucket: string,
  paths: string[]
): Promise<StorageRemoveResult> {
  try {
    const { adminFetch } = await import("@/lib/admin-fetch");
    const res = await adminFetch("/api/admin/storage/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket, paths }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      failed?: string[];
      attempts?: number;
    };
    if (!res.ok) {
      return { ok: false, failed: paths, attempts: json.attempts ?? 0 };
    }
    return {
      ok: json.ok ?? false,
      failed: json.failed ?? [],
      attempts: json.attempts ?? 0,
    };
  } catch {
    return { ok: false, failed: paths, attempts: 0 };
  }
}

export const storageProvider: StorageProvider = {
  async upload(
    bucket: string,
    path: string,
    body: Blob | ArrayBuffer | Uint8Array,
    options?: StorageUploadOptions
  ): Promise<StorageUploadResult> {
    /* write=r2 + browser → route (PRIMARY). Aksi halde Supabase
       (default + server bağlamı). */
    if (isR2WriteEnabled() && typeof window !== "undefined") {
      const primary = await routeUpload(bucket, path, body, options);
      /* Dual-write: R2 başarılıysa Supabase'e de yaz (best-effort;
         rollback simetrisi). R2 fail ise dual denenmez (tutarlılık). */
      if (primary.ok && isDualWriteEnabled()) {
        try {
          const supa = await supabaseStorageProvider.upload(
            bucket,
            path,
            body,
            options
          );
          if (!supa.ok) {
            console.warn("[storage.dualWrite.upload] SUPABASE_FAIL", {
              bucket,
              path,
              error: supa.error,
            });
          }
        } catch (err) {
          console.warn(
            "[storage.dualWrite.upload] SUPABASE_EXCEPTION",
            err instanceof Error ? err.message : err
          );
        }
      }
      return primary;
    }
    return supabaseStorageProvider.upload(bucket, path, body, options);
  },
  async remove(
    bucket: string,
    paths: string[]
  ): Promise<StorageRemoveResult> {
    /* write=r2 + browser → route (PRIMARY) + dual Supabase best-effort.
       SERVER (hardDelete) bu seam'i KULLANMAZ → `lib/storage/server.ts`
       removeServer ile R2'ye gider (hard delete kırılmaz). */
    if (isR2WriteEnabled() && typeof window !== "undefined") {
      const primary = await routeRemove(bucket, paths);
      if (isDualWriteEnabled()) {
        try {
          const supa = await supabaseStorageProvider.remove(bucket, paths);
          if (!supa.ok) {
            console.warn("[storage.dualWrite.remove] SUPABASE_ORPHAN", {
              bucket,
              failed: supa.failed,
              attempts: supa.attempts,
            });
          }
        } catch (err) {
          console.warn(
            "[storage.dualWrite.remove] SUPABASE_EXCEPTION",
            err instanceof Error ? err.message : err
          );
        }
      }
      return primary;
    }
    return supabaseStorageProvider.remove(bucket, paths);
  },
  createSignedUrl: supabaseStorageProvider.createSignedUrl,
  exists: supabaseStorageProvider.exists,
  /* 🛡️ READ — Faz B AYNEN (DOKUNULMADI). */
  getPublicUrl(bucket: string, path: string): string | null {
    const cdn = resolveCdnPublicUrl(bucket, path);
    if (cdn) return cdn;
    return supabaseStorageProvider.getPublicUrl(bucket, path);
  },
};
