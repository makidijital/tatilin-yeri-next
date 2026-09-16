/* ===============================================================
   🛡️ PHASE 10E — BATCH 4 — LAYOUT TRANSLATION GETTER TESTLERİ
   ===============================================================
   Hedef: lib/i18n/get-villa-translation.server.ts
     getVillaTranslatedBedroomNames / getVillaTranslatedBathroomNames

   Mock SEVİYESİ mevcut get-villa-translation.test.ts ile BİREBİR AYNI:
   en ALT sınırda `@/lib/db/translation.repository.server`'ın `findOne`'ı
   mock'lanır. Böylece `getTranslation` (TR kısayolu dahil) ve Batch 1'in
   `resolveLayoutTranslationNames` drift guard'ı GERÇEK kodlarıyla
   çalışır. GERÇEK DB'YE HİÇ DOKUNULMAZ.

   Mevcut 5 getter'ın testleri (get-villa-translation.test.ts) AYRI
   dosyada ve DEĞİŞTİRİLMEDİ.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

const findOneMock = vi.fn();

vi.mock("@/lib/db/translation.repository.server", () => ({
  translationRepository: {
    findOne: (...args: unknown[]) => findOneMock(...args),
  },
}));

import {
  getVillaTranslatedBedroomNames,
  getVillaTranslatedBathroomNames,
} from "@/lib/i18n/get-villa-translation.server";

const VILLA_ID = "villa-uuid-1";
const TR_BEDROOMS = ["Ana Yatak Odası", "Çocuk Odası"];
const TR_BATHROOMS = ["1. Banyo", "2. Banyo"];

const EN_ROW = {
  id: "row-1",
  villa_id: VILLA_ID,
  locale: "en",
  title: "EN Title",
  description: null,
  badge: null,
  seo_title: null,
  seo_description: null,
  bedroom_layout: [
    { i: 0, tr: "Ana Yatak Odası", name: "Master Bedroom" },
    { i: 1, tr: "Çocuk Odası", name: "Children's Bedroom" },
  ],
  bathroom_layout: [
    { i: 0, tr: "1. Banyo", name: "Bathroom 1" },
    { i: 1, tr: "2. Banyo", name: "Bathroom 2" },
  ],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  findOneMock.mockReset();
  findOneMock.mockResolvedValue({ data: EN_ROW, error: null });
});

describe("getVillaTranslatedBedroomNames / BathroomNames — mutlu yol", () => {
  it("EN oda adları çözülür", async () => {
    const names = await getVillaTranslatedBedroomNames(
      VILLA_ID,
      TR_BEDROOMS,
      "en"
    );
    expect(names).toEqual(["Master Bedroom", "Children's Bedroom"]);
  });

  it("EN banyo adları çözülür", async () => {
    const names = await getVillaTranslatedBathroomNames(
      VILLA_ID,
      TR_BATHROOMS,
      "en"
    );
    expect(names).toEqual(["Bathroom 1", "Bathroom 2"]);
  });

  it("DE için doğru locale ile sorgu atılır", async () => {
    findOneMock.mockResolvedValue({
      data: {
        ...EN_ROW,
        locale: "de",
        bedroom_layout: [
          { i: 0, tr: "Ana Yatak Odası", name: "Hauptschlafzimmer" },
          { i: 1, tr: "Çocuk Odası", name: "Kinderzimmer" },
        ],
      },
      error: null,
    });

    const names = await getVillaTranslatedBedroomNames(
      VILLA_ID,
      TR_BEDROOMS,
      "de"
    );
    expect(names).toEqual(["Hauptschlafzimmer", "Kinderzimmer"]);
    expect(findOneMock).toHaveBeenCalledWith("villa", VILLA_ID, "de");
  });

  it("AYNI translation row'dan iki alan da çözülür (tek sorgu mantığı)", async () => {
    const [bed, bath] = await Promise.all([
      getVillaTranslatedBedroomNames(VILLA_ID, TR_BEDROOMS, "en"),
      getVillaTranslatedBathroomNames(VILLA_ID, TR_BATHROOMS, "en"),
    ]);
    expect(bed).toEqual(["Master Bedroom", "Children's Bedroom"]);
    expect(bath).toEqual(["Bathroom 1", "Bathroom 2"]);
    /* İkisi de AYNI entity/parent/locale ile sorar — React cache() gerçek
       RSC render'ında bunu TEK sorguya indirir (Vitest'te memoize etmez,
       bkz. get-villa-translation.test.ts'in aynı notu). */
    for (const call of findOneMock.mock.calls) {
      expect(call).toEqual(["villa", VILLA_ID, "en"]);
    }
  });
});

describe("🛡️ TR — DB sorgusu YAPILMAZ", () => {
  it("locale 'tr' → findOne HİÇ çağrılmaz, TR adlar aynen döner", async () => {
    const bed = await getVillaTranslatedBedroomNames(
      VILLA_ID,
      TR_BEDROOMS,
      "tr"
    );
    const bath = await getVillaTranslatedBathroomNames(
      VILLA_ID,
      TR_BATHROOMS,
      "tr"
    );

    expect(bed).toEqual(TR_BEDROOMS);
    expect(bath).toEqual(TR_BATHROOMS);
    expect(findOneMock).not.toHaveBeenCalled();
  });
});

describe("🛡️ drift / fallback senaryoları", () => {
  it("çeviri satırı yok → TR", async () => {
    findOneMock.mockResolvedValue({ data: null, error: null });
    const names = await getVillaTranslatedBedroomNames(
      VILLA_ID,
      TR_BEDROOMS,
      "en"
    );
    expect(names).toEqual(TR_BEDROOMS);
  });

  it("layout kolonu null → TR", async () => {
    findOneMock.mockResolvedValue({
      data: { ...EN_ROW, bedroom_layout: null },
      error: null,
    });
    const names = await getVillaTranslatedBedroomNames(
      VILLA_ID,
      TR_BEDROOMS,
      "en"
    );
    expect(names).toEqual(TR_BEDROOMS);
  });

  it("layout dizi değil (bozuk veri) → TR", async () => {
    findOneMock.mockResolvedValue({
      data: { ...EN_ROW, bedroom_layout: "bozuk" },
      error: null,
    });
    const names = await getVillaTranslatedBedroomNames(
      VILLA_ID,
      TR_BEDROOMS,
      "en"
    );
    expect(names).toEqual(TR_BEDROOMS);
  });

  it("DB hatası → TR (asla throw etmez)", async () => {
    findOneMock.mockResolvedValue({ data: null, error: { message: "db" } });
    await expect(
      getVillaTranslatedBedroomNames(VILLA_ID, TR_BEDROOMS, "en")
    ).resolves.toEqual(TR_BEDROOMS);
  });

  it("🛡️ oda sayısı değişmiş (uzunluk uyuşmazlığı) → TÜM dizi reddedilir", async () => {
    const trPlusOne = [...TR_BEDROOMS, "Misafir Odası"];
    const names = await getVillaTranslatedBedroomNames(
      VILLA_ID,
      trPlusOne,
      "en"
    );
    expect(names).toEqual(trPlusOne);
  });

  it("🛡️ TR adı değişmiş → YALNIZ o satır TR'ye düşer", async () => {
    const renamed = ["Ebeveyn Odası", "Çocuk Odası"];
    const names = await getVillaTranslatedBedroomNames(VILLA_ID, renamed, "en");
    expect(names).toEqual(["Ebeveyn Odası", "Children's Bedroom"]);
  });

  it("🛡️ odalar yeniden sıralanmış → çeviri YANLIŞ ODAYA bağlanmaz", async () => {
    const reordered = ["Çocuk Odası", "Ana Yatak Odası"];
    const names = await getVillaTranslatedBedroomNames(
      VILLA_ID,
      reordered,
      "en"
    );
    expect(names).toEqual(reordered);
    expect(names).not.toContain("Master Bedroom");
    expect(names).not.toContain("Children's Bedroom");
  });

  it("boş name → o satır TR'ye düşer (kısmi çeviri)", async () => {
    findOneMock.mockResolvedValue({
      data: {
        ...EN_ROW,
        bedroom_layout: [
          { i: 0, tr: "Ana Yatak Odası", name: "Master Bedroom" },
          { i: 1, tr: "Çocuk Odası", name: "" },
        ],
      },
      error: null,
    });
    const names = await getVillaTranslatedBedroomNames(
      VILLA_ID,
      TR_BEDROOMS,
      "en"
    );
    expect(names).toEqual(["Master Bedroom", "Çocuk Odası"]);
  });

  it("boş TR layout → boş dizi, çeviri sızmaz", async () => {
    const names = await getVillaTranslatedBedroomNames(VILLA_ID, [], "en");
    expect(names).toEqual([]);
  });
});
