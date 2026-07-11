import { storageProvider } from "@/lib/storage";
import {
  parseVillaStorageUrl,
  type StorageRemoveResult,
} from "@/lib/villa-image.helpers";

/* ===============================================================
   🛡️ VILLA IMAGE STORAGE — I/O SEAM (server-oriented)
   ===============================================================
   AMAÇ (client/server ayrıştırma sprinti):
     `lib/villa-image.helpers.ts` artık YALNIZ pure/client-safe
     path + parse + sequence helper'ı. Storage remove I/O
     (deleteVillaImage + hardDeleteVilla cleanup zinciri) bu ayrı
     dosyada TOPLANDI → helpers dosyası client bundle'a girse bile
     (AdminGallery path helper'larını import ediyor) hiçbir storage
     I/O mantığı taşımaz.

   ⚠️ NEDEN HENÜZ `import "server-only"` YOK (bilinçli):
     Bu dosyanın tüketicisi `app/services/villa-image/villa-image.
     delete.ts` (SRP split sonrası). Silme fonksiyonlarının TEK
     çağıranı admin galeri CLIENT sayfası — çünkü silme yazma RLS'i
     (`villa_images_admin_write` → authenticated + is_active_admin())
     admin'in cookie-backed session'ıyla YALNIZ browser'da sağlanır.
     Server-side anon `db` cookie okumaz (lib/supabase.ts Faz-4) →
     auth.uid()=NULL → silme RLS ile bloklanır. Bu yüzden silme
     browser'da çalışır ve zincir
       galeri(client) → villa-image.delete → bu dosya
     client bundle'a girer; `server-only` guard'ı buraya eklemek
     BUILD HATA verir. Guard, admin auth server-side sağlanabildiğinde
     (Faz-4 cookie-aware server client) eklenir — bkz. sprint raporu.

   ⚠️ DAVRANIŞ DEĞİŞMEDİ (byte-identical):
     Fonksiyonlar helpers'taki ORİJİNAL gövdeyle birebir aynı.
     Hâlâ `storageProvider.remove` (barrel) çağrılır — server
     bağlamında Supabase provider'a düşer (bugünkü davranış).
     Sadece DOSYA KONUMU değişti; retry / idempotent semantic /
     sonuç envelope aynen korunur.

   İLERİ MİGRASYON HAZIRLIĞI:
     villa-image.service bölündükten sonra bu dosya `server-only`
     olur ve buradaki `storageProvider.remove` → `lib/storage/
     server.ts > removeServer` (R2/S3 seam)'e çevrilebilir —
     client dosyalarına DOKUNMADAN. Ayrıştırmanın asıl amacı bu.
   =============================================================== */

/**
 * Storage'dan bulk remove + retry + idempotent (provider içinde).
 *
 * Imza + sonuç envelope (`ok/failed/attempts`) helpers'taki eski
 * `removeVillaStorageFiles` ile byte-identical. `_maxAttempts`
 * Faz 38'den beri YOK SAYILIR (provider sabit 3 attempt); geriye
 * uyumluluk için parametre korunur.
 *
 * @param bucket bucket adı (örn. `villa-images`)
 * @param paths bucket-relative path dizisi (boş → instant ok)
 * @param _maxAttempts ⚠️ YOK SAYILIR (provider içinde sabit).
 */
export async function removeVillaStorageFiles(
  bucket: string,
  paths: string[],
  _maxAttempts?: number
): Promise<StorageRemoveResult> {
  void _maxAttempts;
  return storageProvider.remove(bucket, paths);
}

/**
 * Tek URL/path girdisinden bucket+path parse edip remove eder.
 * Parse `parseVillaStorageUrl` (pure, client-safe helper) ile;
 * cleanup pipeline'ı tek çağrıya iner. Caller başarı / orphan
 * ayrımını boolean/envelope ile alır.
 */
export async function removeVillaImageByUrl(
  urlOrPath: string | null | undefined
): Promise<StorageRemoveResult> {
  const parsed = parseVillaStorageUrl(urlOrPath);
  if (!parsed) {
    console.warn("[villa-image.storage.remove] PATH_PARSE_FAILED", {
      input: urlOrPath,
    });
    return { ok: false, failed: [], attempts: 0 };
  }
  return removeVillaStorageFiles(parsed.bucket, [parsed.path]);
}
