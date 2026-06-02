import { storageProvider, STORAGE_BUCKETS } from "@/lib/storage";

/* ===============================================================
   🔥 ADMIN BRANDING — TEK MERKEZİ HELPER
   ===============================================================
   Sadece ADMIN PANEL branding'i için. Frontend site logosu /
   site watermark'ı / front header — bu dosya tarafından
   YÖNETİLMEZ; onlar settings.site_logo / settings.watermark_logo
   üzerinden çalışır ve aynen korunur.

   Sabit dosya yolları:
     site-assets/branding/admin-logo.webp
     site-assets/branding/admin-icon.webp

   ÖNEMLİ:
     - Random filename YOK; her upload aynı path'in üstüne yazar
       (upsert: true).
     - Public URL'e cache-bust query (?ts=...) eklenir;
       browser/CDN eski görseli göstermesin.
     - DB migration / yeni tablo YOK; URL'ler dosya yolundan
       deterministic üretilir.

   FALLBACK:
     Storage'da dosya yoksa public URL 404 döner; consumer
     <img onError> ile hardcoded mark'a düşer (admin sidebar
     "M" rozeti, login "M" kutusu, default favicon vb).
   =============================================================== */

/* FAZ 38: bucket sabit storage.constants'tan; backward-compat
   const re-export. */
export const ADMIN_BRANDING_BUCKET = STORAGE_BUCKETS.SITE_ASSETS;
export const ADMIN_BRANDING_FOLDER = "branding";

/* ---------------- KEY → FIXED PATH ---------------- */
export type AdminBrandingFileKey = "admin-logo" | "admin-icon";

export const ADMIN_BRANDING_PATHS: Record<
  AdminBrandingFileKey,
  string
> = {
  "admin-logo": `${ADMIN_BRANDING_FOLDER}/admin-logo.webp`,
  "admin-icon": `${ADMIN_BRANDING_FOLDER}/admin-icon.webp`,
};

/* ---------------- PUBLIC URL — HYDRATION-SAFE ----------------
   - cacheBust verilmezse: cache-bust query EKLENMEZ → URL stable.
     SSR ve client ilk render birebir aynı string üretir, React
     hydration mismatch oluşmaz.
   - cacheBust verilirse (upload sonrası ya da useEffect içindeki
     mounted timestamp): "?ts=..." eklenir, browser/CDN eski görseli
     atlatır.

   Önce kullandığımız "module-level Date.now()" pattern'i SSR'da
   T1, client'ta T2 üretiyordu → hydration warning. Bu fonksiyon
   artık module-level timestamp KULLANMAZ; cache-bust kararı
   tüketicilere bırakılır (genelde useEffect post-mount).

   Dosya henüz yüklenmemişse storage 404 döner; hata UI tarafında
   <img onError> ile yakalanmalı (helper sessiz kalır).
---------------------------------------------------------------- */
export function getAdminBrandingUrl(
  fileKey: AdminBrandingFileKey,
  cacheBust?: number | string | null
): string {
  /* FAZ 38: storageProvider.getPublicUrl delege; URL formatı +
     hydration-safe stable string aynen (cache-bust query caller'da). */
  const path = ADMIN_BRANDING_PATHS[fileKey];
  const base = storageProvider.getPublicUrl(ADMIN_BRANDING_BUCKET, path) || "";
  if (!base) return "";
  if (cacheBust === undefined || cacheBust === null) {
    return base;
  }
  return `${base}?ts=${encodeURIComponent(String(cacheBust))}`;
}

/* ---------------- CONVENIENCE WRAPPERS ----------------
   Çağıran taraflarda tip-güvenli, kısa import:
     getAdminLogoUrl()  → admin sidebar / login mark
     getAdminIconUrl()  → admin favicon link injection
---------------------------------------------------------------- */
export function getAdminLogoUrl(
  cacheBust?: number | string | null
): string {
  return getAdminBrandingUrl("admin-logo", cacheBust);
}

export function getAdminIconUrl(
  cacheBust?: number | string | null
): string {
  return getAdminBrandingUrl("admin-icon", cacheBust);
}

/* ---------------- VALIDATION ---------------- */
export const ADMIN_BRANDING_ALLOWED_MIME: ReadonlyArray<string> = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
];

export const ADMIN_BRANDING_ALLOWED_EXT: ReadonlyArray<string> = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
];

export const ADMIN_BRANDING_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export type AdminBrandingValidation =
  | { ok: true }
  | { ok: false; error: string };

export function validateAdminBrandingFile(
  file: File
): AdminBrandingValidation {
  const lowerName = (file.name || "").toLowerCase();
  const okMime = ADMIN_BRANDING_ALLOWED_MIME.includes(file.type);
  const okExt = ADMIN_BRANDING_ALLOWED_EXT.some((ext) =>
    lowerName.endsWith(ext)
  );
  if (!okMime && !okExt) {
    return {
      ok: false,
      error: "Sadece PNG, JPG, JPEG, WebP veya SVG yükleyebilirsin.",
    };
  }
  if (file.size > ADMIN_BRANDING_MAX_BYTES) {
    const mb = (ADMIN_BRANDING_MAX_BYTES / (1024 * 1024)).toFixed(0);
    return {
      ok: false,
      error: `Dosya boyutu ${mb}MB'tan büyük olamaz.`,
    };
  }
  return { ok: true };
}

/* ---------------- WEBP CONVERSION (browser canvas) ----------------
   Settings page logo/watermark akışıyla aynı pattern: input
   PNG/JPG/JPEG/SVG/WebP → tarayıcı canvas üzerinden WebP blob.
   Şeffaflık (alpha channel) korunur. Logo için makul üst sınır
   1024px genişlik (admin sidebar / login bg gibi farklı boyut
   gerekirse maxWidth override edilebilir).
---------------------------------------------------------------- */
async function fileToBitmap(file: File): Promise<{
  bitmap: ImageBitmap | null;
  img: HTMLImageElement | null;
  width: number;
  height: number;
}> {
  // SVG → createImageBitmap her tarayıcıda desteklenmez; <img> yolu
  if (
    file.type === "image/svg+xml" ||
    file.name.toLowerCase().endsWith(".svg")
  ) {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("SVG yüklenemedi"));
      el.src = url;
    });
    return {
      bitmap: null,
      img,
      width: img.naturalWidth || 1024,
      height: img.naturalHeight || 1024,
    };
  }

  const bitmap = await createImageBitmap(file);
  return {
    bitmap,
    img: null,
    width: bitmap.width,
    height: bitmap.height,
  };
}

export async function convertToAdminBrandingWebP(
  file: File,
  options?: { maxWidth?: number; quality?: number }
): Promise<Blob> {
  const maxWidth = options?.maxWidth ?? 1024;
  const quality = options?.quality ?? 0.92;

  const { bitmap, img, width, height } = await fileToBitmap(file);
  const scale = Math.min(1, maxWidth / Math.max(1, width));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context alınamadı");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (bitmap) {
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  } else if (img) {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("WebP dönüşümü başarısız"));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality
    );
  });
}

/* ---------------- UPLOAD (overwrite + cache-bust) ----------------
   Sabit yola upsert:true ile yazar; başarı durumunda yeni cache-bust
   timestamp'i döner (UI bunu state'te tutup img src'sine yansıtır).
   Hata akışı: upload error → throw; UI catch eder.
---------------------------------------------------------------- */
export type AdminBrandingUploadResult = {
  publicUrl: string;
  cacheBust: number;
};

export async function uploadAdminBranding(
  fileKey: AdminBrandingFileKey,
  file: File,
  options?: { maxWidth?: number; quality?: number }
): Promise<AdminBrandingUploadResult> {
  const validation = validateAdminBrandingFile(file);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const blob = await convertToAdminBrandingWebP(file, options);
  const path = ADMIN_BRANDING_PATHS[fileKey];

  /* FAZ 38: storageProvider.upload delege; contentType + upsert +
     cacheControl aynen. Console tag + throw mesajı route-edge'de. */
  const result = await storageProvider.upload(
    ADMIN_BRANDING_BUCKET,
    path,
    blob,
    {
      contentType: "image/webp",
      upsert: true,
      cacheControl: "3600",
    }
  );

  if (!result.ok) {
    console.error("[admin-branding.upload] FAILED", {
      fileKey,
      path,
      error: result.error,
    });
    throw new Error(result.error || "Yükleme başarısız");
  }

  const cacheBust = Date.now();
  return {
    publicUrl: getAdminBrandingUrl(fileKey, cacheBust),
    cacheBust,
  };
}
