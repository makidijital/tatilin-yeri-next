/* ===============================================================
   🛡️ VİLLA GALERİSİ — DIRECT-TO-R2 UPLOAD (sunucu tarafı)
   ===============================================================
   Kilitlenen davranışlar:
     A) upload-url route
        - oturumsuz → 401, izinsiz → 403 (presign HİÇ çağrılmaz)
        - yetkili admin → imzalı adres + SUNUCUNUN ürettiği key
        - key mevcut naming mantığıyla (max sıra + 1, slug__id8)
        - istemcinin gönderdiği key / villa yok sayılır
        - URL kısa ömürlü (120 sn), tip + boyut imzaya dahil
        - yanlış tip / aşırı boyut / silinmiş villa reddedilir
     B) addGalleryImage (kayıt)
        - doğru key + R2'de var → mevcut addVillaImage + invalidation
        - başka villanın key'i → kayıt YOK
        - R2'de nesne yok → kayıt YOK
        - DB başarısız → yeni nesne sunucuda silinir
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

const VILLA_ID = "2f99586c-1111-4222-8333-444455556666";
const OTHER_VILLA_ID = "9a8b7c6d-1111-4222-8333-444455556666";

/* ---------------- auth / yetki ---------------- */
const auth = {
  caller: { ok: true, caller: { id: "admin-1" } } as
    | { ok: true; caller: { id: string } }
    | { ok: false; status: number; error: string },
  perm: true,
};
vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminCaller: async () => auth.caller,
  authorizeAdminSession: async () => auth.caller,
}));
vi.mock("@/lib/auth/action-authz", () => ({
  FORBIDDEN_MESSAGE: "Bu işlem için yetkiniz yok",
  callerHasPermission: async (_id: string, need: string) =>
    auth.perm && need === "villas",
  requirePermission: async () => ({ id: "admin-1" }),
}));

/* ---------------- veri ---------------- */
const villaState = {
  deleted_at: null as string | null,
  exists: true,
  slug: "villa-casa-del-mar" as string | null,
  images: [
    { id: "i1", villa_id: VILLA_ID, image_url: "villas/villa-casa-del-mar__2f99586c/gallery-0001-aaaa.webp" },
    { id: "i2", villa_id: VILLA_ID, image_url: "villas/villa-casa-del-mar__2f99586c/gallery-0007-bbbb.webp" },
  ],
};
vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    findForPrivateTokenLookup: async (id: string) => ({
      data: villaState.exists
        ? { id, deleted_at: villaState.deleted_at, is_active: true, private_access_token: null }
        : null,
      error: null,
    }),
    findSlugById: async () => ({ data: { slug: villaState.slug }, error: null }),
  },
}));
vi.mock("@/app/services/villa-image/villa-image.read", () => ({
  getVillaImages: async () => villaState.images,
}));

/* ---------------- R2 ---------------- */
const presign = vi.fn(
  async (...args: [string, string, Record<string, unknown>]) =>
    `https://acct.r2.cloudflarestorage.com/bucket/${args[1]}?X-Amz-Expires=120`
);
const head = vi.fn(
  async (): Promise<{ contentLength: number; contentType: string | null } | null> => ({
    contentLength: 4000,
    contentType: "image/webp",
  })
);
vi.mock("@/lib/storage/s3-storage.provider", () => ({
  presignPutObject: (b: string, k: string, o: Record<string, unknown>) => presign(b, k, o),
  headObjectInfo: () => head(),
}));
const removeServer = vi.fn(async () => ({ ok: true, failed: [], attempts: 1 }));
vi.mock("@/lib/storage/server", () => ({
  removeServer: (...a: unknown[]) => removeServer(...(a as [])),
}));

/* ---------------- kayıt ---------------- */
const addVillaImage = vi.fn(async () => true);
vi.mock("@/app/services/villa-image/villa-image.mutations", () => ({
  addVillaImage: (...a: unknown[]) => addVillaImage(...(a as [])),
}));
vi.mock("@/app/services/villa-image/villa-image.delete", () => ({
  deleteVillaImage: async () => true,
  deleteAllVillaImages: async () => ({ ok: true, removed: 0, orphans: [] }),
}));
const invalidate = vi.fn();
vi.mock("@/lib/villas-cache-invalidation.server", () => ({
  invalidateVillasCache: (...a: unknown[]) => invalidate(...a),
}));

import { POST as uploadUrl } from "@/app/api/admin/villas/[id]/gallery/upload-url/route";
import { addGalleryImage } from "@/app/(admin)/maki-admin/villas/[id]/galeri/gallery.action";
import {
  GALLERY_UPLOAD_URL_TTL_SECONDS,
  isGalleryKeyForVilla,
} from "@/app/services/villa-image/villa-image.direct-upload";

function req(body: unknown) {
  return new Request("http://x/api/admin/villas/x/gallery/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  auth.caller = { ok: true, caller: { id: "admin-1" } };
  auth.perm = true;
  villaState.deleted_at = null;
  villaState.exists = true;
  presign.mockClear();
  head.mockClear();
  removeServer.mockClear();
  addVillaImage.mockClear();
  addVillaImage.mockResolvedValue(true);
  invalidate.mockClear();
});

const KEY_RE = /^villas\/villa-casa-del-mar__2f99586c\/villa-casa-del-mar-0008-[0-9a-f]{4}\.webp$/;

/* ===============================================================
   A) upload-url
   =============================================================== */
describe("A) /api/admin/villas/[id]/gallery/upload-url", () => {
  it("oturumsuz kullanıcı URL alamaz (401)", async () => {
    auth.caller = { ok: false, status: 401, error: "Oturum bulunamadı" };
    const res = await uploadUrl(req({ size: 1000, contentType: "image/webp" }), ctx(VILLA_ID));
    expect(res.status).toBe(401);
    expect(presign).not.toHaveBeenCalled();
  });

  it("'villas' izni olmayan admin URL alamaz (403)", async () => {
    auth.perm = false;
    const res = await uploadUrl(req({ size: 1000, contentType: "image/webp" }), ctx(VILLA_ID));
    expect(res.status).toBe(403);
    expect(presign).not.toHaveBeenCalled();
  });

  it("yetkili admin imzalı URL alır; key SUNUCUDA üretilir (max sıra + 1)", async () => {
    const res = await uploadUrl(
      /* İstemcinin gönderdiği key / villa YOK SAYILIR. */
      req({ size: 4000, contentType: "image/webp", key: "villas/hack/evil.webp", villaId: OTHER_VILLA_ID }),
      ctx(VILLA_ID)
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; key: string; uploadUrl: string; expiresIn: number };
    expect(json.ok).toBe(true);
    expect(json.key).toMatch(KEY_RE);
    expect(json.uploadUrl).toContain(json.key);
    expect(res.headers.get("cache-control")).toBe("no-store");

    expect(presign).toHaveBeenCalledTimes(1);
    const [bucket, key, opts] = presign.mock.calls[0];
    expect(bucket).toBe("tatilinyeri-villa-images");
    expect(key).toBe(json.key);
    expect(opts).toEqual({
      contentType: "image/webp",
      contentLength: 4000,
      expiresIn: GALLERY_UPLOAD_URL_TTL_SECONDS,
    });
  });

  it("URL kısa ömürlü (≤ 120 sn)", async () => {
    expect(GALLERY_UPLOAD_URL_TTL_SECONDS).toBeLessThanOrEqual(120);
    const res = await uploadUrl(req({ size: 10, contentType: "image/webp" }), ctx(VILLA_ID));
    const json = (await res.json()) as { expiresIn: number };
    expect(json.expiresIn).toBe(GALLERY_UPLOAD_URL_TTL_SECONDS);
  });

  it("başka villanın id'siyle alınan key yalnız O villanın klasöründedir", async () => {
    const res = await uploadUrl(req({ size: 10, contentType: "image/webp" }), ctx(OTHER_VILLA_ID));
    const json = (await res.json()) as { key: string };
    expect(json.key).toContain("__9a8b7c6d/");
    expect(isGalleryKeyForVilla(VILLA_ID, json.key)).toBe(false);
    expect(isGalleryKeyForVilla(OTHER_VILLA_ID, json.key)).toBe(true);
  });

  it("yanlış tip, sıfır/aşırı boyut ve silinmiş/olmayan villa reddedilir", async () => {
    expect((await uploadUrl(req({ size: 10, contentType: "image/png" }), ctx(VILLA_ID))).status).toBe(400);
    expect((await uploadUrl(req({ size: 0, contentType: "image/webp" }), ctx(VILLA_ID))).status).toBe(400);
    expect(
      (await uploadUrl(req({ size: 50 * 1024 * 1024, contentType: "image/webp" }), ctx(VILLA_ID))).status
    ).toBe(413);
    villaState.deleted_at = "2026-01-01";
    expect((await uploadUrl(req({ size: 10, contentType: "image/webp" }), ctx(VILLA_ID))).status).toBe(404);
    villaState.deleted_at = null;
    villaState.exists = false;
    expect((await uploadUrl(req({ size: 10, contentType: "image/webp" }), ctx(VILLA_ID))).status).toBe(404);
    expect(presign).not.toHaveBeenCalled();
  });
});

/* ===============================================================
   B) addGalleryImage — kayıt
   =============================================================== */
describe("B) addGalleryImage — direct upload sonrası kayıt", () => {
  const KEY = "villas/villa-casa-del-mar__2f99586c/villa-casa-del-mar-0008-c0de.webp";

  it("doğru key + R2'de var → mevcut addVillaImage (relative path) + cache invalidation", async () => {
    expect(await addGalleryImage(VILLA_ID, KEY)).toBe(true);
    expect(head).toHaveBeenCalledTimes(1);
    expect(addVillaImage).toHaveBeenCalledWith(VILLA_ID, KEY);
    expect(invalidate).toHaveBeenCalledWith("admin.gallery.add");
    expect(removeServer).not.toHaveBeenCalled();
  });

  it("başka villanın klasöründeki key → kayıt YOK, silme YOK", async () => {
    const otherKey = "villas/baska-villa__9a8b7c6d/gallery-0001-abcd.webp";
    expect(await addGalleryImage(VILLA_ID, otherKey)).toBe(false);
    expect(addVillaImage).not.toHaveBeenCalled();
    expect(removeServer).not.toHaveBeenCalled();
  });

  it("biçimsiz key → kayıt YOK", async () => {
    expect(await addGalleryImage(VILLA_ID, "villas/villa__2f99586c/../../x.webp")).toBe(false);
    expect(await addGalleryImage(VILLA_ID, "https://cdn/x.webp")).toBe(false);
    expect(addVillaImage).not.toHaveBeenCalled();
  });

  it("R2'de nesne yok (upload yarıda kalmış) → kayıt YOK", async () => {
    head.mockResolvedValueOnce(null);
    expect(await addGalleryImage(VILLA_ID, KEY)).toBe(false);
    expect(addVillaImage).not.toHaveBeenCalled();
  });

  it("R2 upload başarılı ama DB başarısız → yeni nesne sunucuda temizlenir", async () => {
    addVillaImage.mockResolvedValueOnce(false);
    expect(await addGalleryImage(VILLA_ID, KEY)).toBe(false);
    expect(removeServer).toHaveBeenCalledWith("tatilinyeri-villa-images", [KEY]);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("izinsiz kullanıcı kayıt yapamaz (R2'ye bile bakılmaz)", async () => {
    auth.perm = false;
    expect(await addGalleryImage(VILLA_ID, KEY)).toBe(false);
    expect(head).not.toHaveBeenCalled();
    expect(addVillaImage).not.toHaveBeenCalled();
  });
});
