/* ===============================================================
   🛡️ PHASE 10E BATCH 2 — villa-layout-translation.service.ts TESTLERİ
   ===============================================================
   Hedef: getVillaLayoutTranslations / upsertVillaLayoutTranslation.

   Mock katmanı villa-translation-service.test.ts (Phase 10A) deseniyle
   AYNI: translationRepository MOCK'LANIR, gerçek DB'ye DOKUNULMAZ.
   Parent existence + TR layout referansı `getVillaById` üzerinden
   geldiği için `@/app/services/villa.service` de mock'lanır.

   ODAK: (a) partial upsert — yalnız gönderilen kolon yazılır,
   (b) title/description/badge/seo_* payload'a ASLA girmez,
   (c) drift (uzunluk/index/TR ad) durumunda yazım REDDEDİLİR,
   (d) TR villa layout'una ASLA yazılmaz.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

const findAllForParentMock = vi.fn();
const upsertOneMock = vi.fn();
const getVillaByIdMock = vi.fn();

vi.mock("@/lib/db/translation.repository.server", () => ({
  translationRepository: {
    findAllForParent: (...args: unknown[]) => findAllForParentMock(...args),
    upsertOne: (...args: unknown[]) => upsertOneMock(...args),
  },
}));

vi.mock("@/app/services/villa.service", () => ({
  getVillaById: (...args: unknown[]) => getVillaByIdMock(...args),
}));

import {
  getVillaLayoutTranslations,
  upsertVillaLayoutTranslation,
} from "@/app/services/villa-layout-translation.service";

const VILLA_ID = "villa-uuid-1";

const TR_BEDROOMS = [
  { name: "Ana Yatak Odası", beds: [{ type: "double", count: 1 }] },
  { name: "Çocuk Odası", beds: [{ type: "single", count: 2 }] },
];
const TR_BATHROOMS = [
  { name: "1. Banyo", type: "full" },
  { name: "2. Banyo", type: "shower_wc" },
];

const EN_BEDROOM_INPUT = [
  { i: 0, tr: "Ana Yatak Odası", name: "Master Bedroom" },
  { i: 1, tr: "Çocuk Odası", name: "Children's Bedroom" },
];
const EN_BATHROOM_INPUT = [
  { i: 0, tr: "1. Banyo", name: "Bathroom 1" },
  { i: 1, tr: "2. Banyo", name: "Bathroom 2" },
];

const VALID_ROW = {
  id: "row-1",
  villa_id: VILLA_ID,
  locale: "en",
  title: "Mevcut EN Başlık",
  description: "Mevcut EN açıklama",
  badge: "Mevcut rozet",
  seo_title: "Mevcut SEO",
  seo_description: "Mevcut SEO açıklama",
  bedroom_layout: EN_BEDROOM_INPUT,
  bathroom_layout: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  findAllForParentMock.mockReset();
  upsertOneMock.mockReset();
  getVillaByIdMock.mockReset();

  getVillaByIdMock.mockResolvedValue({
    id: VILLA_ID,
    bedroom_layout: TR_BEDROOMS,
    bathroom_layout: TR_BATHROOMS,
  });
  upsertOneMock.mockResolvedValue({ data: VALID_ROW, error: null });
  findAllForParentMock.mockResolvedValue({ data: [], error: null });
});

/* ---------------------------------------------------------------
   1-5 — MUTLU YOL
   --------------------------------------------------------------- */
describe("upsertVillaLayoutTranslation — başarılı kayıt", () => {
  it("1) EN bedroom çevirisi kaydedilir", async () => {
    const result = await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: EN_BEDROOM_INPUT,
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith("villa", VILLA_ID, "en", {
      bedroom_layout: EN_BEDROOM_INPUT,
    });
  });

  it("2) DE bedroom çevirisi kaydedilir", async () => {
    const deInput = [
      { i: 0, tr: "Ana Yatak Odası", name: "Hauptschlafzimmer" },
      { i: 1, tr: "Çocuk Odası", name: "Kinderzimmer" },
    ];
    const result = await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "de",
      bedroomLayout: deInput,
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith("villa", VILLA_ID, "de", {
      bedroom_layout: deInput,
    });
  });

  it("3) EN bathroom çevirisi kaydedilir", async () => {
    const result = await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bathroomLayout: EN_BATHROOM_INPUT,
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith("villa", VILLA_ID, "en", {
      bathroom_layout: EN_BATHROOM_INPUT,
    });
  });

  it("4) DE bathroom çevirisi kaydedilir", async () => {
    const deInput = [
      { i: 0, tr: "1. Banyo", name: "Badezimmer 1" },
      { i: 1, tr: "2. Banyo", name: "Badezimmer 2" },
    ];
    const result = await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "de",
      bathroomLayout: deInput,
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith("villa", VILLA_ID, "de", {
      bathroom_layout: deInput,
    });
  });

  it("5) bedroom + bathroom BİRLİKTE kaydedilebilir", async () => {
    const result = await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: EN_BEDROOM_INPUT,
      bathroomLayout: EN_BATHROOM_INPUT,
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith("villa", VILLA_ID, "en", {
      bedroom_layout: EN_BEDROOM_INPUT,
      bathroom_layout: EN_BATHROOM_INPUT,
    });
  });
});

/* ---------------------------------------------------------------
   6-7 — LOCALE WHITELIST
   --------------------------------------------------------------- */
describe("locale whitelist", () => {
  it("6) 'tr' locale REDDEDİLİR — DB'ye yazılmaz", async () => {
    const result = await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "tr",
      bedroomLayout: EN_BEDROOM_INPUT,
    });

    expect(result).toEqual({
      ok: false,
      error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir",
    });
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("7) bilinmeyen locale REDDEDİLİR — DB'ye yazılmaz", async () => {
    for (const locale of ["fr", "", "EN", "en-US", "xx"]) {
      upsertOneMock.mockClear();
      const result = await upsertVillaLayoutTranslation({
        villaId: VILLA_ID,
        locale,
        bedroomLayout: EN_BEDROOM_INPUT,
      });
      expect(result.ok).toBe(false);
      expect(upsertOneMock).not.toHaveBeenCalled();
    }
  });
});

/* ---------------------------------------------------------------
   8-9 — BOŞ / TRIM
   --------------------------------------------------------------- */
describe("boş değer ve trim", () => {
  it("8a) boş name satırı name:'' olarak yazılır (okuma tarafı TR'ye fallback eder)", async () => {
    const result = await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: [
        { i: 0, tr: "Ana Yatak Odası", name: "Master Bedroom" },
        { i: 1, tr: "Çocuk Odası", name: "" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith("villa", VILLA_ID, "en", {
      bedroom_layout: [
        { i: 0, tr: "Ana Yatak Odası", name: "Master Bedroom" },
        { i: 1, tr: "Çocuk Odası", name: "" },
      ],
    });
  });

  it("8b) TÜM name'ler boşsa kolon NULL yazılır (çeviri yok semantiği)", async () => {
    const result = await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: [
        { i: 0, tr: "Ana Yatak Odası", name: "" },
        { i: 1, tr: "Çocuk Odası", name: "   " },
      ],
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith("villa", VILLA_ID, "en", {
      bedroom_layout: null,
    });
  });

  it("9) name ve tr trim edilir", async () => {
    const result = await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: [
        { i: 0, tr: "  Ana Yatak Odası  ", name: "  Master Bedroom  " },
        { i: 1, tr: "Çocuk Odası", name: "Children's Bedroom" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith("villa", VILLA_ID, "en", {
      bedroom_layout: EN_BEDROOM_INPUT,
    });
  });
});

/* ---------------------------------------------------------------
   10-12 — DRIFT / SHAPE REDDİ
   --------------------------------------------------------------- */
describe("🛡️ drift ve shape doğrulaması — yazım REDDEDİLİR", () => {
  it("10a) dizi olmayan girdi reddedilir", async () => {
    for (const bad of ["x", 42, true, { i: 0 }]) {
      upsertOneMock.mockClear();
      const result = await upsertVillaLayoutTranslation({
        villaId: VILLA_ID,
        locale: "en",
        bedroomLayout: bad,
      });
      expect(result.ok).toBe(false);
      expect(upsertOneMock).not.toHaveBeenCalled();
    }
  });

  it("10b) bozuk kayıt içeren dizi reddedilir", async () => {
    const result = await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: [
        { i: 0, tr: "Ana Yatak Odası", name: "Master Bedroom" },
        null,
      ],
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("10c) uzunluk TR layout ile uyuşmuyorsa reddedilir (oda eklendi/silindi)", async () => {
    const result = await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: [{ i: 0, tr: "Ana Yatak Odası", name: "Master Bedroom" }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("düzeni değişmiş");
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("11) yanlış index reddedilir", async () => {
    const result = await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: [
        { i: 1, tr: "Ana Yatak Odası", name: "Master Bedroom" },
        { i: 0, tr: "Çocuk Odası", name: "Children's Bedroom" },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("sıra");
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("12) TR kaynak adı eşleşmiyorsa reddedilir (bayat layout üzerinden kayıt)", async () => {
    const result = await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: [
        { i: 0, tr: "Ebeveyn Odası", name: "Master Bedroom" },
        { i: 1, tr: "Çocuk Odası", name: "Children's Bedroom" },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("düzeni değişmiş");
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("12b) banyo tarafında da aynı drift kuralları geçerli", async () => {
    const result = await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bathroomLayout: [
        { i: 0, tr: "Eski Banyo", name: "Bathroom 1" },
        { i: 1, tr: "2. Banyo", name: "Bathroom 2" },
      ],
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("12c) drift durumunda TEK bir alan bile yazılmaz (bedroom geçerli + bathroom bozuk)", async () => {
    const result = await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: EN_BEDROOM_INPUT,
      bathroomLayout: [{ i: 0, tr: "1. Banyo", name: "Bathroom 1" }],
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });
});

/* ---------------------------------------------------------------
   13-16 — DATA SAFETY
   --------------------------------------------------------------- */
describe("🛡️ DATA SAFETY — partial upsert ve dokunulmazlık", () => {
  it("13) YALNIZ bedroom kaydedilirse payload'da bathroom_layout HİÇ YOK", async () => {
    await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: EN_BEDROOM_INPUT,
    });

    const fields = upsertOneMock.mock.calls[0][3] as Record<string, unknown>;
    expect(Object.keys(fields)).toEqual(["bedroom_layout"]);
    expect("bathroom_layout" in fields).toBe(false);
  });

  it("14) YALNIZ bathroom kaydedilirse payload'da bedroom_layout HİÇ YOK", async () => {
    await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bathroomLayout: EN_BATHROOM_INPUT,
    });

    const fields = upsertOneMock.mock.calls[0][3] as Record<string, unknown>;
    expect(Object.keys(fields)).toEqual(["bathroom_layout"]);
    expect("bedroom_layout" in fields).toBe(false);
  });

  it("15) title/description/badge/seo_* payload'a ASLA girmez", async () => {
    await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: EN_BEDROOM_INPUT,
      bathroomLayout: EN_BATHROOM_INPUT,
    });

    const fields = upsertOneMock.mock.calls[0][3] as Record<string, unknown>;
    for (const forbidden of [
      "title",
      "description",
      "badge",
      "seo_title",
      "seo_description",
    ]) {
      expect(forbidden in fields).toBe(false);
    }
    expect(Object.keys(fields).sort()).toEqual([
      "bathroom_layout",
      "bedroom_layout",
    ]);
  });

  it("15b) input'a kaçak alan eklense bile payload'a sızmaz", async () => {
    await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: EN_BEDROOM_INPUT,
      /* @ts-expect-error — bilinçli olarak tip dışı alan gönderiliyor */
      title: "KAÇAK BAŞLIK",
      seoTitle: "KAÇAK SEO",
    });

    const fields = upsertOneMock.mock.calls[0][3] as Record<string, unknown>;
    expect(Object.keys(fields)).toEqual(["bedroom_layout"]);
  });

  it("16) villa TR layout'una (villa.bedroom_layout) YAZMA çağrısı YOK — getVillaById salt-okunur", async () => {
    await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: EN_BEDROOM_INPUT,
    });

    /* getVillaById YALNIZ okuma için, tek argümanla çağrılır. */
    expect(getVillaByIdMock).toHaveBeenCalledTimes(1);
    expect(getVillaByIdMock).toHaveBeenCalledWith(VILLA_ID);
    /* Tek DB yazma çağrısı: translationRepository.upsertOne, hedef entity
       "villa" translation tablosu — villa tablosu DEĞİL. */
    expect(upsertOneMock).toHaveBeenCalledTimes(1);
    expect(upsertOneMock.mock.calls[0][0]).toBe("villa");
  });
});

/* ---------------------------------------------------------------
   PARENT EXISTENCE + GİRDİ DOĞRULAMA + OKUMA
   --------------------------------------------------------------- */
describe("parent existence ve girdi doğrulama", () => {
  it("villa yoksa (getVillaById null) yazım reddedilir", async () => {
    getVillaByIdMock.mockResolvedValueOnce(null);

    const result = await upsertVillaLayoutTranslation({
      villaId: "yok",
      locale: "en",
      bedroomLayout: EN_BEDROOM_INPUT,
    });

    expect(result).toEqual({ ok: false, error: "Villa bulunamadı" });
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("boş villaId reddedilir — villa okuması bile yapılmaz", async () => {
    const result = await upsertVillaLayoutTranslation({
      villaId: "   ",
      locale: "en",
      bedroomLayout: EN_BEDROOM_INPUT,
    });

    expect(result).toEqual({ ok: false, error: "Geçersiz villa" });
    expect(getVillaByIdMock).not.toHaveBeenCalled();
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("hiçbir layout alanı verilmezse reddedilir", async () => {
    const result = await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
    });

    expect(result).toEqual({ ok: false, error: "Kaydedilecek çeviri yok" });
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("TR layout boş olan villada boş dizi kabul edilir → NULL yazılır", async () => {
    getVillaByIdMock.mockResolvedValueOnce({
      id: VILLA_ID,
      bedroom_layout: [],
      bathroom_layout: [],
    });

    const result = await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: [],
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith("villa", VILLA_ID, "en", {
      bedroom_layout: null,
    });
  });

  it("repository hatası kullanıcıya hata olarak döner", async () => {
    upsertOneMock.mockResolvedValueOnce({ data: null, error: { message: "db" } });

    const result = await upsertVillaLayoutTranslation({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: EN_BEDROOM_INPUT,
    });

    expect(result).toEqual({ ok: false, error: "Çeviri kaydedilemedi" });
  });
});

describe("getVillaLayoutTranslations", () => {
  it("EN/DE satırları döner, TR filtrelenir", async () => {
    findAllForParentMock.mockResolvedValueOnce({
      data: [
        { ...VALID_ROW, locale: "tr" },
        { ...VALID_ROW, locale: "en" },
        { ...VALID_ROW, locale: "de" },
      ],
      error: null,
    });

    const result = await getVillaLayoutTranslations(VILLA_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows.map((r) => r.locale)).toEqual(["en", "de"]);
    }
  });

  it("boş villaId reddedilir", async () => {
    const result = await getVillaLayoutTranslations("  ");
    expect(result).toEqual({ ok: false, error: "Geçersiz villa" });
    expect(findAllForParentMock).not.toHaveBeenCalled();
  });

  it("repository hatası → okunamadı", async () => {
    findAllForParentMock.mockResolvedValueOnce({
      data: null,
      error: { message: "db" },
    });
    const result = await getVillaLayoutTranslations(VILLA_ID);
    expect(result).toEqual({ ok: false, error: "Çeviriler okunamadı" });
  });
});
