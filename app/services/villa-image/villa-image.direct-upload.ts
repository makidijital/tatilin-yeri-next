import "server-only";

import {
  presignPutObject,
  headObjectInfo,
} from "@/lib/storage/s3-storage.provider";
import {
  VILLA_IMAGES_BUCKET,
  buildVillaImagePath,
  nextGallerySequenceFromUrls,
} from "@/lib/villa-image.helpers";
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import { getVillaImages } from "./villa-image.read";

/* ===============================================================
   🛡️ VİLLA GALERİSİ — DIRECT-TO-R2 UPLOAD (server-only)
   ===============================================================
   ESKİ:  Browser → /api/admin/storage/upload (VPS) → R2
   YENİ:  Browser → (VPS: imzalı kısa ömürlü PUT adresi) → R2 doğrudan

   VPS dosya byte'larını ARTIK ALMAZ. Görevleri:
     1) `createGalleryUploadTicket` — villa doğrulama + object key'i
        SUNUCU üretir (eski istemci mantığıyla BİREBİR: mevcut galeri
        görsellerinden `nextGallerySequenceFromUrls` + `buildVillaImagePath`)
        + imzalı PUT adresi (Content-Type + Content-Length imzada).
     2) `verifyUploadedGalleryObject` — DB kaydından önce key bu villanın
        klasörüne mi ait ve nesne R2'de gerçekten var mı (HeadObject).

   Yetki kontrolü (oturum + "villas" izni) çağıran route/action'da,
   mevcut desenle yapılır. Key formatı, CDN URL'i, DB kaydı DEĞİŞMEDİ.
   =============================================================== */

/** Tarayıcı her zaman WebP olarak yükler (AdminGallery `convertToWebP`,
 *  eski akışta da `contentType: "image/webp"` gönderiliyordu). */
export const GALLERY_UPLOAD_CONTENT_TYPE = "image/webp";

/** Son (dönüştürülmüş) dosya için üst sınır. Giriş zaten ≤ 2 MB ve
 *  1600px'e küçültülüyor; tipik çıktı 150–600 KB. Canvas'ın WebP
 *  üretemediği tarayıcılarda (PNG fallback) daha büyük olabileceği için
 *  pay bırakıldı. */
export const GALLERY_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** İmzalı adres ömrü (saniye). R2 süreyi isteğin BAŞLADIĞI anda kontrol
 *  eder; kısa tutulur. */
export const GALLERY_UPLOAD_URL_TTL_SECONDS = 120;

export type GalleryUploadTicketResult =
  | {
      ok: true;
      uploadUrl: string;
      key: string;
      contentType: string;
      expiresIn: number;
    }
  | { ok: false; status: number; error: string };

/* Galeri key'i (lib/villa-image.helpers.ts > buildVillaImagePath):
     villas/<slug>__<villaId ilk 8 hex>/<slug|gallery>-NNNN-xxxx.webp
   Slug sonradan değişebilir → yalnız villa kimliği (shortId) bağlayıcıdır.
   Karakter sınıfı `.` ve `/` içermez → path traversal mümkün değil. */
function shortIdOf(villaId: string): string {
  return String(villaId || "")
    .replace(/[^a-f0-9]/gi, "")
    .slice(0, 8)
    .toLowerCase();
}

export function isGalleryKeyForVilla(villaId: string, key: string): boolean {
  const shortId = shortIdOf(villaId);
  if (shortId.length !== 8 || typeof key !== "string") return false;
  const re = new RegExp(
    `^villas/[a-z0-9-]+__${shortId}/[a-z0-9-]+-\\d{4}-[0-9a-f]{4}\\.webp$`
  );
  return re.test(key);
}

export async function createGalleryUploadTicket(
  villaId: string,
  input: { size: unknown; contentType: unknown }
): Promise<GalleryUploadTicketResult> {
  if (!villaId) return { ok: false, status: 400, error: "id gerekli" };

  if (input.contentType !== GALLERY_UPLOAD_CONTENT_TYPE) {
    return { ok: false, status: 400, error: "Geçersiz dosya tipi" };
  }
  const size = Number(input.size);
  if (!Number.isInteger(size) || size <= 0) {
    return { ok: false, status: 400, error: "Geçersiz dosya boyutu" };
  }
  if (size > GALLERY_UPLOAD_MAX_BYTES) {
    return { ok: false, status: 413, error: "Dosya çok büyük" };
  }

  /* Villa var mı + silinmemiş mi + slug + mevcut galeri (sıra numarası). */
  const [lookup, slugRes, images] = await Promise.all([
    villaAdminRepository.findForPrivateTokenLookup(villaId),
    villaAdminRepository.findSlugById(villaId),
    getVillaImages(villaId),
  ]);
  if (lookup.error) {
    console.error("[gallery.directUpload] villa lookup FAILED", lookup.error.message);
    return { ok: false, status: 500, error: "Villa doğrulanamadı" };
  }
  if (!lookup.data || lookup.data.deleted_at) {
    return { ok: false, status: 404, error: "Villa bulunamadı" };
  }
  const slug = (slugRes.data?.slug as string | null | undefined) ?? null;

  /* Eski istemci mantığıyla BİREBİR: mevcut görsellerin en yüksek sıra
     numarası + 1. Başarısız yükleme DB'ye yazılmadığı için sıra
     ilerlemez (eski davranış); rand4 eki çakışmayı önler. */
  const seq = nextGallerySequenceFromUrls(
    images.map((i) => (i?.image_url as string | null) ?? null)
  );
  const key = buildVillaImagePath({ id: villaId, slug }, seq, "webp");

  try {
    const uploadUrl = await presignPutObject(VILLA_IMAGES_BUCKET, key, {
      contentType: GALLERY_UPLOAD_CONTENT_TYPE,
      contentLength: size,
      expiresIn: GALLERY_UPLOAD_URL_TTL_SECONDS,
    });
    return {
      ok: true,
      uploadUrl,
      key,
      contentType: GALLERY_UPLOAD_CONTENT_TYPE,
      expiresIn: GALLERY_UPLOAD_URL_TTL_SECONDS,
    };
  } catch (err) {
    console.error(
      "[gallery.directUpload] presign FAILED",
      err instanceof Error ? err.message : err
    );
    return { ok: false, status: 500, error: "Yükleme adresi oluşturulamadı" };
  }
}

/** DB kaydından önce: key bu villaya ait mi + nesne R2'de var mı +
 *  tip/boyut beklenen sınırlarda mı. */
export async function verifyUploadedGalleryObject(
  villaId: string,
  key: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isGalleryKeyForVilla(villaId, key)) {
    return { ok: false, reason: "key villa ile eşleşmiyor" };
  }
  let info: Awaited<ReturnType<typeof headObjectInfo>>;
  try {
    info = await headObjectInfo(VILLA_IMAGES_BUCKET, key);
  } catch (err) {
    return {
      ok: false,
      reason:
        "R2 doğrulanamadı: " + (err instanceof Error ? err.message : String(err)),
    };
  }
  if (!info) return { ok: false, reason: "R2 nesnesi bulunamadı" };
  if (info.contentLength <= 0 || info.contentLength > GALLERY_UPLOAD_MAX_BYTES) {
    return { ok: false, reason: "R2 nesne boyutu geçersiz" };
  }
  if (info.contentType && info.contentType !== GALLERY_UPLOAD_CONTENT_TYPE) {
    return { ok: false, reason: "R2 nesne tipi geçersiz" };
  }
  return { ok: true };
}
