/* ===============================================================
   🛡️ ADMIN MANUEL YORUM EKLEME — createVillaReviewByAdmin
   ===============================================================
   KAPSAM:
     • Validation public akışla AYNI kurallar (2..80 / 10..1500 / 1..5)
     • sanitizeName / sanitizeComment davranışı
     • "Hemen yayınla" → is_approved + approved_at
     • is_featured HER ZAMAN false
     • created_at payload'a HİÇ konulmaz (DB default)
     • repo hata senaryosu
     • yetkisiz çağrıda service/repository'ye ULAŞILMAZ
     • REGRESYON: public `createVillaReview` davranışı DEĞİŞMEDİ
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* ---------- repository mock (DB'ye ASLA inilmez) ---------- */
const insertMock = vi.fn();
const updateByIdMock = vi.fn();
const deleteByIdMock = vi.fn();
vi.mock("@/lib/db/villa-review.repository.server", () => ({
  villaReviewServerRepository: {
    insert: (...a: unknown[]) => insertMock(...a),
    updateById: (...a: unknown[]) => updateByIdMock(...a),
    deleteById: (...a: unknown[]) => deleteByIdMock(...a),
    findApprovedByVilla: vi.fn(),
    findAllApprovedRatings: vi.fn(),
    findApprovedRatingsAllVillas: vi.fn(),
    findApprovedRatingsByVilla: vi.fn(),
    findFeaturedHomepage: vi.fn(),
    findAllForAdmin: vi.fn(),
    findFeaturedStateById: vi.fn(),
    clearFeaturedByVilla: vi.fn(),
  },
}));

import {
  createVillaReviewByAdmin,
  createVillaReview,
} from "@/app/services/villa-review.service";

const VALID = {
  villa_id: "villa-1",
  guest_name: "Ayşe Yılmaz",
  rating: 5,
  comment: "Harika bir tatil oldu, ev çok temizdi.",
  publish: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  insertMock.mockResolvedValue({ error: null });
});

/* =============================================================== */
describe("1) Geçerli admin yorumu", () => {
  it("1a) ok:true döner ve insert TEK kez çağrılır", async () => {
    const res = await createVillaReviewByAdmin(VALID);
    expect(res).toEqual({ ok: true });
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("1b) payload alanları tam ve doğru", async () => {
    await createVillaReviewByAdmin(VALID);
    const p = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(p.villa_id).toBe("villa-1");
    expect(p.guest_name).toBe("Ayşe Yılmaz");
    expect(p.rating).toBe(5);
    expect(p.comment).toBe("Harika bir tatil oldu, ev çok temizdi.");
  });
});

describe("2) villa_id zorunlu", () => {
  it("2a) boş villa_id → red, insert ÇAĞRILMAZ", async () => {
    const res = await createVillaReviewByAdmin({ ...VALID, villa_id: "" });
    expect(res.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("2b) yalnız boşluk → red", async () => {
    const res = await createVillaReviewByAdmin({ ...VALID, villa_id: "   " });
    expect(res.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("3) Ad Soyad 2–80 (public kurallarla AYNI)", () => {
  it("3a) 1 karakter → red", async () => {
    const res = await createVillaReviewByAdmin({ ...VALID, guest_name: "A" });
    expect(res.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("3b) tam 2 karakter → kabul", async () => {
    const res = await createVillaReviewByAdmin({ ...VALID, guest_name: "Al" });
    expect(res.ok).toBe(true);
  });

  it("3c) 80 karakter → kabul, 81 → red", async () => {
    expect(
      (await createVillaReviewByAdmin({ ...VALID, guest_name: "a".repeat(80) })).ok
    ).toBe(true);
    insertMock.mockClear();
    const over = await createVillaReviewByAdmin({
      ...VALID,
      guest_name: "a".repeat(81),
    });
    expect(over.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("4) Yorum 10–1500 (public kurallarla AYNI)", () => {
  it("4a) 9 karakter → red", async () => {
    const res = await createVillaReviewByAdmin({ ...VALID, comment: "123456789" });
    expect(res.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("4b) tam 10 karakter → kabul", async () => {
    expect(
      (await createVillaReviewByAdmin({ ...VALID, comment: "1234567890" })).ok
    ).toBe(true);
  });

  it("4c) 1500 → kabul, 1501 → red", async () => {
    expect(
      (await createVillaReviewByAdmin({ ...VALID, comment: "a".repeat(1500) })).ok
    ).toBe(true);
    insertMock.mockClear();
    const over = await createVillaReviewByAdmin({
      ...VALID,
      comment: "a".repeat(1501),
    });
    expect(over.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("5) Rating 1–5", () => {
  it("5a) 0 ve 6 → red", async () => {
    expect((await createVillaReviewByAdmin({ ...VALID, rating: 0 })).ok).toBe(false);
    expect((await createVillaReviewByAdmin({ ...VALID, rating: 6 })).ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("5b) NaN → red", async () => {
    const res = await createVillaReviewByAdmin({
      ...VALID,
      rating: Number("abc"),
    });
    expect(res.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("5c) 4.6 → 5'e yuvarlanır (public ile AYNI davranış)", async () => {
    await createVillaReviewByAdmin({ ...VALID, rating: 4.6 });
    expect(
      (insertMock.mock.calls[0][0] as Record<string, unknown>).rating
    ).toBe(5);
  });

  it("5d) 1 ve 5 sınırları kabul", async () => {
    expect((await createVillaReviewByAdmin({ ...VALID, rating: 1 })).ok).toBe(true);
    expect((await createVillaReviewByAdmin({ ...VALID, rating: 5 })).ok).toBe(true);
  });
});

describe("6) Sanitize — MEVCUT helper'lar kullanılır", () => {
  it("6a) İsimdeki çoklu boşluk teklenir + trim", async () => {
    await createVillaReviewByAdmin({
      ...VALID,
      guest_name: "  Ayşe    Yılmaz  ",
    });
    expect(
      (insertMock.mock.calls[0][0] as Record<string, unknown>).guest_name
    ).toBe("Ayşe Yılmaz");
  });

  it("6b) Yorumda 3+ ardışık newline çift newline'a iner + trim", async () => {
    await createVillaReviewByAdmin({
      ...VALID,
      comment: "  Birinci satır.\n\n\n\nİkinci satır.  ",
    });
    expect(
      (insertMock.mock.calls[0][0] as Record<string, unknown>).comment
    ).toBe("Birinci satır.\n\nİkinci satır.");
  });

  it("6c) \\r\\n → \\n normalize", async () => {
    await createVillaReviewByAdmin({
      ...VALID,
      comment: "Birinci satır.\r\nİkinci satır.",
    });
    expect(
      (insertMock.mock.calls[0][0] as Record<string, unknown>).comment
    ).toBe("Birinci satır.\nİkinci satır.");
  });
});

describe("7) Hemen yayınla → is_approved + approved_at", () => {
  it("7a) publish:true → is_approved true, approved_at ISO timestamp", async () => {
    await createVillaReviewByAdmin({ ...VALID, publish: true });
    const p = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(p.is_approved).toBe(true);
    expect(typeof p.approved_at).toBe("string");
    expect(p.approved_at as string).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    );
  });

  it("7b) publish:false → is_approved false, approved_at null", async () => {
    await createVillaReviewByAdmin({ ...VALID, publish: false });
    const p = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(p.is_approved).toBe(false);
    expect(p.approved_at).toBeNull();
  });

  it("7c) publish verilmezse yayına ALINMAZ (defansif default)", async () => {
    const rest = {
      villa_id: VALID.villa_id,
      guest_name: VALID.guest_name,
      rating: VALID.rating,
      comment: VALID.comment,
    };
    await createVillaReviewByAdmin(rest);
    const p = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(p.is_approved).toBe(false);
    expect(p.approved_at).toBeNull();
  });
});

describe("8) is_featured HER ZAMAN false", () => {
  it("8a) publish true iken bile false", async () => {
    await createVillaReviewByAdmin({ ...VALID, publish: true });
    expect(
      (insertMock.mock.calls[0][0] as Record<string, unknown>).is_featured
    ).toBe(false);
  });

  it("8b) input'a is_featured sızdırılsa bile payload false kalır", async () => {
    await createVillaReviewByAdmin({
      ...VALID,
      ...({ is_featured: true } as unknown as object),
    });
    expect(
      (insertMock.mock.calls[0][0] as Record<string, unknown>).is_featured
    ).toBe(false);
  });
});

describe("9) created_at payload'a KONULMAZ (DB default)", () => {
  it("9a) payload'da created_at anahtarı YOK", async () => {
    await createVillaReviewByAdmin(VALID);
    const p = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(p)).not.toContain("created_at");
  });

  it("9b) payload anahtar kümesi tam olarak beklenen 7 alan", async () => {
    await createVillaReviewByAdmin(VALID);
    const p = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(p).sort()).toEqual(
      [
        "approved_at",
        "comment",
        "guest_name",
        "is_approved",
        "is_featured",
        "rating",
        "villa_id",
      ].sort()
    );
  });
});

describe("10) Repository hata senaryosu", () => {
  it("10a) insert error → ok:false, ham DB mesajı SIZDIRILMAZ", async () => {
    insertMock.mockResolvedValue({
      error: { message: 'insert or update violates foreign key "villa_reviews_villa_id_fkey"' },
    });
    const res = await createVillaReviewByAdmin(VALID);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("Yorum kaydedilemedi. Lütfen tekrar deneyin.");
      expect(res.error).not.toContain("fkey");
    }
  });
});

/* =============================================================== */
describe("11) Yetki — reviews izni yoksa service/repository çağrılmaz", () => {
  it("11a) requirePermission THROW ederse insert HİÇ çağrılmaz", async () => {
    vi.resetModules();
    const requirePermissionMock = vi.fn(async () => {
      throw new Error("Yetkisiz: bu işlem için izniniz yok");
    });
    const adminInsertMock = vi.fn();
    vi.doMock("@/lib/auth/action-authz", () => ({
      requirePermission: requirePermissionMock,
    }));
    vi.doMock("@/lib/db/villa-review.repository.server", () => ({
      villaReviewServerRepository: { insert: adminInsertMock },
    }));

    const mod = await import("@/app/services/villa-review.action");
    await expect(mod.createVillaReviewByAdminAction(VALID)).rejects.toThrow(
      /Yetkisiz/
    );
    expect(requirePermissionMock).toHaveBeenCalledWith("reviews");
    expect(adminInsertMock).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/auth/action-authz");
    vi.doUnmock("@/lib/db/villa-review.repository.server");
  });

  it("11b) Yetki varsa service çalışır ve insert çağrılır", async () => {
    vi.resetModules();
    const adminInsertMock = vi.fn(async () => ({ error: null }));
    vi.doMock("@/lib/auth/action-authz", () => ({
      requirePermission: vi.fn(async () => ({ id: "admin-1" })),
    }));
    vi.doMock("@/lib/db/villa-review.repository.server", () => ({
      villaReviewServerRepository: { insert: adminInsertMock },
    }));

    const mod = await import("@/app/services/villa-review.action");
    const res = await mod.createVillaReviewByAdminAction(VALID);
    expect(res).toEqual({ ok: true });
    expect(adminInsertMock).toHaveBeenCalledTimes(1);
    vi.doUnmock("@/lib/auth/action-authz");
    vi.doUnmock("@/lib/db/villa-review.repository.server");
  });
});

/* =============================================================== */
describe("12) REGRESYON — public akış DEĞİŞMEDİ", () => {
  it("12a) createVillaReview HÂLÂ is_approved:false ile insert eder", async () => {
    const res = await createVillaReview({
      villa_id: "villa-1",
      guest_name: "Misafir Kişi",
      rating: 4,
      comment: "Guest tarafından gönderilen yorum metni.",
    });
    expect(res.ok).toBe(true);
    const p = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(p.is_approved).toBe(false);
    expect(p.is_featured).toBe(false);
  });

  it("12b) createVillaReview payload'ında approved_at ve created_at YOK", async () => {
    await createVillaReview({
      villa_id: "villa-1",
      guest_name: "Misafir Kişi",
      rating: 4,
      comment: "Guest tarafından gönderilen yorum metni.",
    });
    const keys = Object.keys(
      insertMock.mock.calls[0][0] as Record<string, unknown>
    );
    expect(keys).not.toContain("approved_at");
    expect(keys).not.toContain("created_at");
  });

  it("12c) SOURCE-LOCK — public fonksiyon gövdesinde is_approved:false hardcoded", () => {
    const src = readFileSync(
      join(process.cwd(), "app/services/villa-review.service.ts"),
      "utf8"
    );
    const pub = src.slice(
      src.indexOf("export async function createVillaReview("),
      src.indexOf("export async function getVillaReviewsForAdmin(")
    );
    expect(pub).toContain("is_approved: false");
    expect(pub).not.toContain("publish");
    expect(pub).not.toContain("approved_at");
  });

  it("12d) SOURCE-LOCK — createVillaReviewAction permission'SIZ kalmalı", () => {
    const src = readFileSync(
      join(process.cwd(), "app/services/villa-review.action.ts"),
      "utf8"
    );
    /* YALNIZ fonksiyon GÖVDESİ — sonraki fonksiyonun doc-comment'i
       "requirePermission" kelimesini içerdiği için dilim gövdeyle
       sınırlandırılır. */
    const start = src.indexOf(
      "export async function createVillaReviewAction("
    );
    const act = src.slice(start, src.indexOf("\n}\n", start));
    expect(act).toContain("return createVillaReview(...args);");
    expect(act).not.toContain("requirePermission");
  });

  it("12e) SOURCE-LOCK — admin action requirePermission(\"reviews\") ile başlar", () => {
    const src = readFileSync(
      join(process.cwd(), "app/services/villa-review.action.ts"),
      "utf8"
    );
    const act = src.slice(
      src.indexOf("export async function createVillaReviewByAdminAction(")
    );
    expect(act).toContain('await requirePermission("reviews");');
  });

  it("12f) SOURCE-LOCK — repository'ye YENİ insert metodu eklenmedi", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/db/villa-review.repository.server.ts"),
      "utf8"
    );
    const inserts = src.match(/async\s+insert\w*\s*\(/g) || [];
    expect(inserts).toHaveLength(1);
  });
});
