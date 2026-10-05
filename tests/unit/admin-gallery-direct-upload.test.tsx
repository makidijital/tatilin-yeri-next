/* ===============================================================
   🛡️ AdminGallery — DIRECT-TO-R2 (istemci) davranış kilidi
   ===============================================================
   - Dosyalar SIRALI işlenir: dosya1 → R2 → DB, dosya2 → R2 → DB …
   - Byte'lar eski VPS route'una (`storageProvider.upload`) GİTMEZ.
   - DB'ye SUNUCUNUN verdiği key yazılır (onUploaded(key)).
   - Upload başarısız → kayıt yok, sıradaki dosyaya geçilir.
   - DB başarısız → mevcut istemci rollback'i (storageProvider.remove).
   - WebP dönüşümü (1600px, image/webp, 0.8) AYNEN.
   - 2 MB sınırı AYNEN.
   - uploadGalleryImageDirect: URL al → imzalı adrese PUT.
=============================================================== */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";

const log: string[] = [];

vi.mock("@/app/components/admin/notifications/NotificationProvider", () => ({
  useConfirm: () => async () => true,
  useNotify: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/app/components/villa/admin-gallery.action", () => ({
  reorderGalleryImages: vi.fn(),
  setGalleryCover: vi.fn(),
}));

const storageUpload = vi.fn();
const storageRemove = vi.fn(async (_b: string, paths: string[]) => {
  log.push(`remove:${paths.join(",")}`);
  return { ok: true, failed: [], attempts: 1 };
});
vi.mock("@/lib/storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/storage")>()),
  storageProvider: {
    upload: (...a: unknown[]) => storageUpload(...a),
    remove: (b: string, p: string[]) => storageRemove(b, p),
    getPublicUrl: () => null,
  },
}));

let directResults: Array<{ ok: true; key: string } | { ok: false; error: string }> = [];
const direct = vi.fn(async (villaId: string, blob: Blob, ct: string) => {
  log.push(`direct:${villaId}:${blob.type}:${ct}`);
  return directResults.shift() ?? { ok: false as const, error: "none" };
});
vi.mock("@/lib/storage/gallery-direct-upload.client", () => ({
  uploadGalleryImageDirect: (v: string, b: Blob, c: string) => direct(v, b, c),
}));

import AdminGallery from "@/app/components/villa/AdminGallery";

/* ---------------- canvas / bitmap stub'ları (jsdom'da yok) ---------------- */
const toBlobArgs: unknown[][] = [];
beforeEach(() => {
  log.length = 0;
  toBlobArgs.length = 0;
  storageUpload.mockClear();
  storageRemove.mockClear();
  direct.mockClear();
  vi.stubGlobal("createImageBitmap", async () => ({ width: 4000, height: 3000 }));
  vi.stubGlobal("alert", vi.fn());
  HTMLCanvasElement.prototype.getContext = (() => ({ drawImage: () => {} })) as never;
  HTMLCanvasElement.prototype.toBlob = function (
    this: HTMLCanvasElement,
    cb: BlobCallback,
    type?: string,
    q?: number
  ) {
    toBlobArgs.push([this.width, this.height, type, q]);
    cb(new Blob(["x"], { type: type || "" }));
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function file(name: string, size = 1000) {
  const f = new File(["a"], name, { type: "image/jpeg" });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

function setup(onUploaded: (url: string) => Promise<boolean | void>) {
  const utils = render(
    <AdminGallery
      images={[]}
      villaId="2f99586c-1111-4222-8333-444455556666"
      villaSlug="villa-x"
      onUploaded={onUploaded}
      onDelete={async () => {}}
      onReorder={async () => {}}
    />
  );
  const input = utils.container.querySelector('input[type="file"]') as HTMLInputElement;
  return { ...utils, input };
}

describe("AdminGallery — direct-to-R2", () => {
  it("sıralı: dosya1 → R2 → DB, dosya2 → R2 → DB; eski VPS upload'ı kullanılmaz", async () => {
    directResults = [
      { ok: true, key: "villas/villa-x__2f99586c/villa-x-0001-aaaa.webp" },
      { ok: true, key: "villas/villa-x__2f99586c/villa-x-0002-bbbb.webp" },
    ];
    const onUploaded = vi.fn(async (k: string) => {
      log.push(`db:${k}`);
      return true;
    });
    const { input } = setup(onUploaded);
    fireEvent.change(input, { target: { files: [file("a.jpg"), file("b.jpg")] } });

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(2));
    expect(log).toEqual([
      "direct:2f99586c-1111-4222-8333-444455556666:image/webp:image/webp",
      "db:villas/villa-x__2f99586c/villa-x-0001-aaaa.webp",
      "direct:2f99586c-1111-4222-8333-444455556666:image/webp:image/webp",
      "db:villas/villa-x__2f99586c/villa-x-0002-bbbb.webp",
    ]);
    expect(storageUpload).not.toHaveBeenCalled();
    /* WebP dönüşümü aynen: 1600px genişlik, image/webp, kalite 0.8. */
    expect(toBlobArgs[0]).toEqual([1600, 1200, "image/webp", 0.8]);
  });

  it("upload başarısız → o dosya için kayıt yok, sonraki dosyaya geçilir", async () => {
    directResults = [
      { ok: false, error: "R2 PUT HTTP 403" },
      { ok: true, key: "villas/villa-x__2f99586c/villa-x-0001-cccc.webp" },
    ];
    const onUploaded = vi.fn(async () => true);
    const { input } = setup(onUploaded);
    fireEvent.change(input, { target: { files: [file("a.jpg"), file("b.jpg")] } });
    await waitFor(() => expect(direct).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(onUploaded).toHaveBeenCalledWith("villas/villa-x__2f99586c/villa-x-0001-cccc.webp");
  });

  it("DB başarısız → mevcut istemci rollback'i (sunucunun verdiği key silinir)", async () => {
    directResults = [{ ok: true, key: "villas/villa-x__2f99586c/villa-x-0001-dddd.webp" }];
    const onUploaded = vi.fn(async () => false);
    const { input } = setup(onUploaded);
    fireEvent.change(input, { target: { files: [file("a.jpg")] } });
    await waitFor(() =>
      expect(storageRemove).toHaveBeenCalledWith("tatilinyeri-villa-images", [
        "villas/villa-x__2f99586c/villa-x-0001-dddd.webp",
      ])
    );
  });

  it("2 MB sınırı aynen: büyük dosya yüklenmez", async () => {
    directResults = [];
    const onUploaded = vi.fn(async () => true);
    const { input } = setup(onUploaded);
    fireEvent.change(input, { target: { files: [file("big.jpg", 3 * 1024 * 1024)] } });
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(direct).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });
});

/* ===============================================================
   uploadGalleryImageDirect — URL al → imzalı adrese PUT
   =============================================================== */
describe("uploadGalleryImageDirect", () => {
  it("önce upload-url (JSON, boyut), sonra imzalı adrese PUT (Content-Type)", async () => {
    vi.doUnmock("@/lib/storage/gallery-direct-upload.client");
    const { uploadGalleryImageDirect } = await vi.importActual<
      typeof import("@/lib/storage/gallery-direct-upload.client")
    >("@/lib/storage/gallery-direct-upload.client");
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        if (url.includes("/gallery/upload-url")) {
          return new Response(
            JSON.stringify({
              ok: true,
              uploadUrl: "https://acct.r2.cloudflarestorage.com/b/k?sig=1",
              key: "villas/v__2f99586c/v-0001-abcd.webp",
              contentType: "image/webp",
            }),
            { status: 200 }
          );
        }
        return new Response(null, { status: 200 });
      })
    );
    const blob = new Blob(["12345"], { type: "image/webp" });
    const res = await uploadGalleryImageDirect("villa-1", blob, "image/webp");
    expect(res).toEqual({ ok: true, key: "villas/v__2f99586c/v-0001-abcd.webp" });
    expect(calls[0].url).toBe("/api/admin/villas/villa-1/gallery/upload-url");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ size: 5, contentType: "image/webp" });
    expect(calls[1].url).toBe("https://acct.r2.cloudflarestorage.com/b/k?sig=1");
    expect(calls[1].init.method).toBe("PUT");
    expect(calls[1].init.body).toBe(blob);
    expect((calls[1].init.headers as Record<string, string>)["Content-Type"]).toBe("image/webp");
  });

  it("URL alınamazsa R2'ye hiç gidilmez; PUT reddedilirse hata döner", async () => {
    const { uploadGalleryImageDirect } = await vi.importActual<
      typeof import("@/lib/storage/gallery-direct-upload.client")
    >("@/lib/storage/gallery-direct-upload.client");
    const f1 = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "Yetkiniz yok" }), { status: 403 }));
    vi.stubGlobal("fetch", f1);
    expect(await uploadGalleryImageDirect("v", new Blob(["x"]))).toEqual({ ok: false, error: "Yetkiniz yok" });
    expect(f1).toHaveBeenCalledTimes(1);

    const f2 = vi.fn(async (url: string) =>
      url.includes("upload-url")
        ? new Response(JSON.stringify({ ok: true, uploadUrl: "https://r2/x", key: "k", contentType: "image/webp" }))
        : new Response(null, { status: 403 })
    );
    vi.stubGlobal("fetch", f2);
    expect(await uploadGalleryImageDirect("v", new Blob(["x"]))).toEqual({ ok: false, error: "R2 PUT HTTP 403" });
  });
});
