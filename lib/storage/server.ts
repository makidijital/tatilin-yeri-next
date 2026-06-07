import "server-only";

import { supabaseStorageProvider } from "./supabase-storage.provider";
import { s3StorageProvider } from "./s3-storage.provider";
import { isR2WriteEnabled, isDualWriteEnabled } from "./write.config";
import type { StorageRemoveResult } from "./storage.types";

/* ===============================================================
   🛡️ FAZ C / ADIM 3 — SERVER-SIDE STORAGE WRITE/REMOVE (server-only)
   ===============================================================
   AMAÇ:
     Server bağlamındaki remove (özellikle hardDeleteVilla cleanup)
     write-driver-aware olsun. Client seam (index.ts) HTTP route
     kullanır; server route HTTP kullanamaz (Bearer yok) → server
     burada `s3StorageProvider`'ı DOĞRUDAN çağırır.

   ⚠️ `import "server-only"`: s3StorageProvider (AWS SDK) yalnız
     server. Bu modül client bundle'a sızarsa BUILD HATA.

   DAVRANIŞ:
     write=supabase (default) → supabaseStorageProvider.remove
       → bugünkü hardDelete cleanup ile BYTE-IDENTICAL (server anon,
         best-effort, retry/idempotent provider içinde).
     write=r2                 → s3StorageProvider.remove (PRIMARY)
       + dual açıksa Supabase remove BEST-EFFORT (sonuç primary'den).

   ⚠️ Hard delete zinciri KORUNUR: dönüş tipi StorageRemoveResult
     (removeVillaStorageFiles ile aynı shape) → caller (storage-cleanup)
     `result.ok` kontrolü değişmeden çalışır.
   =============================================================== */

export async function removeServer(
  bucket: string,
  paths: string[]
): Promise<StorageRemoveResult> {
  /* DEFAULT (write=supabase): bugünkü davranış birebir. */
  if (!isR2WriteEnabled()) {
    return supabaseStorageProvider.remove(bucket, paths);
  }

  /* write=r2: PRIMARY = R2 (read kaynağı R2 olduğu için silme R2'den
     yapılmalı, yoksa silinen görsel CDN'de kalır). */
  const primary = await s3StorageProvider.remove(bucket, paths);

  /* Dual açıksa Supabase tarafını da temizle (best-effort; rollback
     simetrisi). Supabase server-side anon remove best-effort'tur
     (mevcut hardDelete davranışıyla aynı sınıf); hata primary'yi
     etkilemez. */
  if (isDualWriteEnabled()) {
    try {
      const supa = await supabaseStorageProvider.remove(bucket, paths);
      if (!supa.ok) {
        console.warn("[storage.server.remove] DUAL_SUPABASE_ORPHAN", {
          bucket,
          failed: supa.failed,
          attempts: supa.attempts,
        });
      }
    } catch (err) {
      console.warn(
        "[storage.server.remove] DUAL_SUPABASE_EXCEPTION",
        err instanceof Error ? err.message : err
      );
    }
  }

  return primary;
}
