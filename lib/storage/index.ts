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

/** Aktif provider — Faz 38'de Supabase. */
export const storageProvider = supabaseStorageProvider;
