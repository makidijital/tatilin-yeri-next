import "server-only";

import { s3StorageProvider } from "./s3-storage.provider";
import type { StorageRemoveResult } from "./storage.types";

/* ===============================================================
   🛡️ SERVER-SIDE STORAGE REMOVE (server-only) — R2
   ===============================================================
   AMAÇ:
     Server bağlamındaki remove (özellikle hardDeleteVilla cleanup)
     doğrudan R2'ye gider. Client seam (index.ts) HTTP route kullanır;
     server route HTTP kullanamaz (Bearer yok) → burada
     `s3StorageProvider`'ı DOĞRUDAN çağırır.

   ⚠️ `import "server-only"`: s3StorageProvider (AWS SDK) yalnız server.
     Bu modül client bundle'a sızarsa BUILD HATA.

   ⚠️ Dönüş tipi StorageRemoveResult → caller (storage-cleanup)
     `result.ok` kontrolü değişmeden çalışır.
   =============================================================== */

export async function removeServer(
  bucket: string,
  paths: string[]
): Promise<StorageRemoveResult> {
  return s3StorageProvider.remove(bucket, paths);
}
