/* ===============================================================
   🛡️ VİLLA GALERİSİ — DIRECT-TO-R2 UPLOAD (client)
   ===============================================================
   1) `/api/admin/villas/{id}/gallery/upload-url` → kısa ömürlü imzalı
      PUT adresi + SUNUCUNUN ürettiği object key (küçük JSON; adminFetch
      401'de oturumu tazeleyip bir kez tekrarlar).
   2) Dosya imzalı adrese DOĞRUDAN R2'ye PUT edilir — VPS'ten geçmez.

   Dönüş `StorageUploadResult` benzeri zarf; throw etmez (eski
   `storageProvider.upload` ile aynı tutum). Key yalnız başarıda döner.
   =============================================================== */

export type GalleryDirectUploadResult =
  | { ok: true; key: string }
  | { ok: false; error: string };

export async function uploadGalleryImageDirect(
  villaId: string,
  blob: Blob,
  contentType: string = "image/webp"
): Promise<GalleryDirectUploadResult> {
  try {
    const { adminFetch } = await import("@/lib/admin-fetch");
    const res = await adminFetch(
      `/api/admin/villas/${encodeURIComponent(villaId)}/gallery/upload-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ size: blob.size, contentType }),
      }
    );
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      uploadUrl?: string;
      key?: string;
      contentType?: string;
    };
    if (!res.ok || !json.ok || !json.uploadUrl || !json.key) {
      return { ok: false, error: json.error || `HTTP ${res.status}` };
    }

    /* Content-Type imzaya dahil → sunucunun döndürdüğü değer AYNEN
       gönderilir. Content-Length'i tarayıcı gövdeden kendisi koyar
       (= blob.size, imzalanan değer). */
    const put = await fetch(json.uploadUrl, {
      method: "PUT",
      body: blob,
      headers: { "Content-Type": json.contentType || contentType },
    });
    if (!put.ok) {
      return { ok: false, error: `R2 PUT HTTP ${put.status}` };
    }
    return { ok: true, key: json.key };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "direct upload error",
    };
  }
}
