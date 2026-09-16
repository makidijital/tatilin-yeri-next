/* ===============================================================
   🛡️ PHASE 10A — app/services/villa-translation.service.ts TESTLERİ
   ===============================================================
   Hedef: getVillaTranslations / upsertVillaTranslation.

   translationRepository + villaAdminRepository MOCK'LANIR — gerçek
   DB'ye dokunulmaz (translation-repository.test.ts ile AYNI
   mock-katman prensibi). Servis katmanının iş kuralı sorumluluğu
   (locale whitelist, parent existence, alan uzunlukları, boş
   string → null normalize) BURADA test edilir; repository çağrı
   şekli translation-repository.test.ts'te zaten test edildi.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

const findAllForParentMock = vi.fn();
const upsertOneMock = vi.fn();
const findSlugByIdMock = vi.fn();

vi.mock("@/lib/db/translation.repository.server", () => ({
  translationRepository: {
    findAllForParent: (...args: unknown[]) => findAllForParentMock(...args),
    upsertOne: (...args: unknown[]) => upsertOneMock(...args),
  },
}));

vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    findSlugById: (...args: unknown[]) => findSlugByIdMock(...args),
  },
}));

const VALID_ROW = {
  id: "row-1",
  villa_id: "villa-uuid-1",
  locale: "en",
  title: "Test Villa",
  description: null,
  badge: null,
  seo_title: null,
  seo_description: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  findAllForParentMock.mockReset();
  upsertOneMock.mockReset();
  findSlugByIdMock.mockReset();

  findSlugByIdMock.mockResolvedValue({ data: { slug: "villa-slug" }, error: null });
  upsertOneMock.mockResolvedValue({ data: VALID_ROW, error: null });
  findAllForParentMock.mockResolvedValue({ data: [], error: null });
});

describe("upsertVillaTranslation", () => {
  it("EN upsert — geçerli girdi başarıyla repository.upsertOne'a ulaşır", async () => {
    const { upsertVillaTranslation } = await import(
      "@/app/services/villa-translation.service"
    );

    const result = await upsertVillaTranslation({
      villaId: "villa-uuid-1",
      locale: "en",
      title: "Test Villa",
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith(
      "villa",
      "villa-uuid-1",
      "en",
      expect.objectContaining({ title: "Test Villa" })
    );
  });

  it("DE upsert — geçerli girdi başarıyla repository.upsertOne'a ulaşır", async () => {
    const { upsertVillaTranslation } = await import(
      "@/app/services/villa-translation.service"
    );

    const result = await upsertVillaTranslation({
      villaId: "villa-uuid-1",
      locale: "de",
      title: "Test Villa DE",
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith(
      "villa",
      "villa-uuid-1",
      "de",
      expect.objectContaining({ title: "Test Villa DE" })
    );
  });

  it("mevcut EN çeviriyi günceller (aynı upsertOne çağrı deseni — repository UNIQUE(villa_id,locale) ile ayırt eder)", async () => {
    const { upsertVillaTranslation } = await import(
      "@/app/services/villa-translation.service"
    );

    await upsertVillaTranslation({ villaId: "villa-uuid-1", locale: "en", title: "V1" });
    await upsertVillaTranslation({ villaId: "villa-uuid-1", locale: "en", title: "V2 güncel" });

    expect(upsertOneMock).toHaveBeenCalledTimes(2);
    expect(upsertOneMock).toHaveBeenLastCalledWith(
      "villa",
      "villa-uuid-1",
      "en",
      expect.objectContaining({ title: "V2 güncel" })
    );
  });

  it("mevcut DE çeviriyi günceller", async () => {
    const { upsertVillaTranslation } = await import(
      "@/app/services/villa-translation.service"
    );

    await upsertVillaTranslation({ villaId: "villa-uuid-1", locale: "de", title: "V1" });
    await upsertVillaTranslation({ villaId: "villa-uuid-1", locale: "de", title: "V2 güncel" });

    expect(upsertOneMock).toHaveBeenLastCalledWith(
      "villa",
      "villa-uuid-1",
      "de",
      expect.objectContaining({ title: "V2 güncel" })
    );
  });

  it("locale 'fr' reddedilir — repository çağrılmaz", async () => {
    const { upsertVillaTranslation } = await import(
      "@/app/services/villa-translation.service"
    );

    const result = await upsertVillaTranslation({
      villaId: "villa-uuid-1",
      locale: "fr",
      title: "Titre",
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("locale 'tr' reddedilir — bu UI üzerinden TR yazılamaz", async () => {
    const { upsertVillaTranslation } = await import(
      "@/app/services/villa-translation.service"
    );

    const result = await upsertVillaTranslation({
      villaId: "villa-uuid-1",
      locale: "tr",
      title: "Türkçe Başlık",
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("boş/geçersiz villaId reddedilir — repository çağrılmaz", async () => {
    const { upsertVillaTranslation } = await import(
      "@/app/services/villa-translation.service"
    );

    const result = await upsertVillaTranslation({
      villaId: "   ",
      locale: "en",
      title: "Test",
    });

    expect(result.ok).toBe(false);
    expect(findSlugByIdMock).not.toHaveBeenCalled();
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("var olmayan villa reddedilir (findSlugById → data:null)", async () => {
    findSlugByIdMock.mockResolvedValueOnce({ data: null, error: null });

    const { upsertVillaTranslation } = await import(
      "@/app/services/villa-translation.service"
    );

    const result = await upsertVillaTranslation({
      villaId: "villa-yok",
      locale: "en",
      title: "Test",
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("boş başlık reddedilir", async () => {
    const { upsertVillaTranslation } = await import(
      "@/app/services/villa-translation.service"
    );

    const result = await upsertVillaTranslation({
      villaId: "villa-uuid-1",
      locale: "en",
      title: "   ",
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("200 karakteri aşan başlık reddedilir", async () => {
    const { upsertVillaTranslation } = await import(
      "@/app/services/villa-translation.service"
    );

    const result = await upsertVillaTranslation({
      villaId: "villa-uuid-1",
      locale: "en",
      title: "x".repeat(201),
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("boş string alanlar null'a normalize edilir (description/badge/seoTitle/seoDescription)", async () => {
    const { upsertVillaTranslation } = await import(
      "@/app/services/villa-translation.service"
    );

    await upsertVillaTranslation({
      villaId: "villa-uuid-1",
      locale: "en",
      title: "Test Villa",
      description: "   ",
      badge: "",
      seoTitle: undefined,
      seoDescription: null,
    });

    expect(upsertOneMock).toHaveBeenCalledWith(
      "villa",
      "villa-uuid-1",
      "en",
      {
        title: "Test Villa",
        description: null,
        badge: null,
        seo_title: null,
        seo_description: null,
      }
    );
  });

  it("geçerli girdi repository'ye başarıyla ulaşır ve { ok: true, row } döner", async () => {
    const { upsertVillaTranslation } = await import(
      "@/app/services/villa-translation.service"
    );

    const result = await upsertVillaTranslation({
      villaId: "villa-uuid-1",
      locale: "en",
      title: "Test Villa",
      description: "Açıklama",
      badge: "Yeni",
      seoTitle: "SEO Başlık",
      seoDescription: "SEO Açıklama",
    });

    expect(result).toEqual({ ok: true, row: VALID_ROW });
  });
});

describe("getVillaTranslations", () => {
  it("yalnız en/de satırlarını döner (tr varsa filtrelenir)", async () => {
    findAllForParentMock.mockResolvedValueOnce({
      data: [
        { ...VALID_ROW, locale: "tr" },
        { ...VALID_ROW, locale: "en" },
        { ...VALID_ROW, locale: "de" },
      ],
      error: null,
    });

    const { getVillaTranslations } = await import(
      "@/app/services/villa-translation.service"
    );

    const result = await getVillaTranslations("villa-uuid-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows.map((r) => r.locale).sort()).toEqual(["de", "en"]);
    }
  });
});
