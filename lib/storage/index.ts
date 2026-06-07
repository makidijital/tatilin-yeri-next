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
import type { StorageProvider } from "./storage.provider";

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
   🛡️ FAZ B — AKTİF PROVIDER (READ = CDN-AWARE, WRITE = SUPABASE)
   ===============================================================
   getPublicUrl: STORAGE_DRIVER=r2 ise CDN base URL üretir
     (resolveCdnPublicUrl), aksi halde Supabase getPublicUrl'e düşer.
   upload / remove / createSignedUrl / exists: Supabase implementasyonu
     AYNEN korunur (Faz B upload'a DOKUNMAZ). Method'lar `this`
     kullanmadığı için referans atama güvenli.

   ROLLBACK: NEXT_PUBLIC_STORAGE_DRIVER=supabase (veya tanımsız)
     → resolveCdnPublicUrl daima null → tamamen eski davranış.
   =============================================================== */
export const storageProvider: StorageProvider = {
  upload: supabaseStorageProvider.upload,
  remove: supabaseStorageProvider.remove,
  createSignedUrl: supabaseStorageProvider.createSignedUrl,
  exists: supabaseStorageProvider.exists,
  getPublicUrl(bucket: string, path: string): string | null {
    const cdn = resolveCdnPublicUrl(bucket, path);
    if (cdn) return cdn;
    return supabaseStorageProvider.getPublicUrl(bucket, path);
  },
};
