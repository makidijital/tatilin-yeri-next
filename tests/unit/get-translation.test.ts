/* ===============================================================
   🛡️ PHASE 5 — TRANSLATION READ LAYER: TESTLER
   ===============================================================
   Hedef: lib/i18n/get-translation.server.ts (getTranslation,
   resolveTranslatedField, isTranslationEntity)

   `translationRepository` (Phase 3) mock'lanır — GERÇEK DB'YE HİÇ
   DOKUNULMAZ, production translation tabloları (şu an boş olabilir)
   bu testten ETKİLENMEZ/TEST VERİSİ YAZILMAZ. Aynı desen: Phase 3'ün
   translation-repository.test.ts'i (db seviyesinde), burada bir
   katman yukarıda — translationRepository'nin KENDİSİ mock'lanıyor,
   böylece "getTranslation doğru parent/locale ile findOne'ı çağırıyor
   mu" ayrı ve net test edilir (repository'nin kendi DB wiring'i zaten
   Phase 3'te test edili — burada TEKRAR EDİLMEZ).

   Mevcut price-engine / discount / pool-heating / reservation / TR
   route / Phase 1B-2-4A-4B testlerine HİÇ dokunulmadı.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  getTranslation,
  resolveTranslatedField,
  isTranslationEntity,
} from "@/lib/i18n/get-translation.server";

const findOneMock = vi.fn();

vi.mock("@/lib/db/translation.repository.server", () => ({
  translationRepository: {
    findOne: (...args: unknown[]) => findOneMock(...args),
  },
}));

beforeEach(() => {
  findOneMock.mockReset();
});

const enVillaRow = {
  id: "t-en-1",
  villa_id: "villa-uuid-1",
  locale: "en" as const,
  title: "Villa In Love",
  description: null,
  badge: null,
  seo_title: null,
  seo_description: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const deVillaRow = {
  ...enVillaRow,
  id: "t-de-1",
  locale: "de" as const,
  title: "Villa Verliebt",
};

describe("getTranslation", () => {
  /* --- 1) TR locale --- */
  it("1) locale='tr' → findOne HİÇ ÇAĞRILMAZ, null döner (TR için gereksiz DB bağımlılığı yok)", async () => {
    const result = await getTranslation("villa", "villa-uuid-1", "tr");
    expect(result).toBeNull();
    expect(findOneMock).not.toHaveBeenCalled();
  });

  /* --- 2) EN + mevcut --- */
  it("2) locale='en' + çeviri mevcut → satırın TAMAMINI döner", async () => {
    findOneMock.mockResolvedValue({ data: enVillaRow, error: null });
    const result = await getTranslation("villa", "villa-uuid-1", "en");
    expect(result).toEqual(enVillaRow);
  });

  /* --- 3) DE + mevcut --- */
  it("3) locale='de' + çeviri mevcut → satırın TAMAMINI döner", async () => {
    findOneMock.mockResolvedValue({ data: deVillaRow, error: null });
    const result = await getTranslation("villa", "villa-uuid-1", "de");
    expect(result).toEqual(deVillaRow);
  });

  /* --- 4) EN yok --- */
  it("4) locale='en' + çeviri YOK (0 satır) → null döner", async () => {
    findOneMock.mockResolvedValue({ data: null, error: null });
    const result = await getTranslation("villa", "villa-uuid-2", "en");
    expect(result).toBeNull();
  });

  /* --- 5) DE yok --- */
  it("5) locale='de' + çeviri YOK (0 satır) → null döner", async () => {
    findOneMock.mockResolvedValue({ data: null, error: null });
    const result = await getTranslation("villa", "villa-uuid-2", "de");
    expect(result).toBeNull();
  });

  /* --- 6) Geçersiz locale --- */
  it("6) geçersiz locale ('fr') → toLocale ile 'tr'ye düşer, findOne ÇAĞRILMAZ, null döner", async () => {
    const result = await getTranslation(
      "villa",
      "villa-uuid-1",
      // @ts-expect-error kasıtlı geçersiz locale — runtime güvenliği test edilir
      "fr"
    );
    expect(result).toBeNull();
    expect(findOneMock).not.toHaveBeenCalled();
  });

  /* --- 7) Geçersiz entity --- */
  it("7) geçersiz entity ('villa_rule' — audit'in yanlış ismi) → findOne ÇAĞRILMAZ, null döner", async () => {
    const result = await getTranslation(
      // @ts-expect-error kasıtlı geçersiz entity — runtime güvenliği test edilir
      "villa_rule",
      "rule-uuid-1",
      "en"
    );
    expect(result).toBeNull();
    expect(findOneMock).not.toHaveBeenCalled();
  });

  /* --- 8) Doğru parent/locale sorgusu --- */
  it("8) findOne DOĞRU (entity, parentId, resolvedLocale) argümanlarıyla çağrılır", async () => {
    findOneMock.mockResolvedValue({ data: null, error: null });
    await getTranslation("rule_item", "rule-uuid-9", "de");
    expect(findOneMock).toHaveBeenCalledTimes(1);
    expect(findOneMock).toHaveBeenCalledWith("rule_item", "rule-uuid-9", "de");
  });

  /* --- 9) Boş tablo / tüm entity'ler güvenli --- */
  it("9) translation tablosu boşken (data:null,error:null) 9 entity'nin TAMAMI için güvenli null döner", async () => {
    findOneMock.mockResolvedValue({ data: null, error: null });
    const entities = [
      "villa",
      "villa_location",
      "villa_type",
      "villa_feature",
      "rule_item",
      "price_include_item",
      "villa_distance",
      "page",
      "faq",
    ] as const;

    for (const entity of entities) {
      const result = await getTranslation(entity, "some-parent-id", "en");
      expect(result).toBeNull();
    }
    expect(findOneMock).toHaveBeenCalledTimes(entities.length);
  });

  /* --- Ek: DB hatası --- */
  it("DB hatası dönerse (error != null) exception FIRLATMADAN null döner", async () => {
    findOneMock.mockResolvedValue({
      data: null,
      error: { message: "connection lost" },
    });
    await expect(
      getTranslation("villa", "villa-uuid-1", "en")
    ).resolves.toBeNull();
  });

  /* --- Ek: boş parentId --- */
  it("boş parentId → findOne ÇAĞRILMAZ, null döner", async () => {
    const result = await getTranslation("villa", "", "en");
    expect(result).toBeNull();
    expect(findOneMock).not.toHaveBeenCalled();
  });
});

describe("isTranslationEntity", () => {
  it("bilinen entity'ler için true döner", () => {
    expect(isTranslationEntity("villa")).toBe(true);
    expect(isTranslationEntity("faq")).toBe(true);
  });

  it("bilinmeyen/geçersiz değerler için false döner", () => {
    expect(isTranslationEntity("villa_rule")).toBe(false);
    expect(isTranslationEntity("")).toBe(false);
    expect(isTranslationEntity(null)).toBe(false);
    expect(isTranslationEntity(42)).toBe(false);
  });
});

describe("resolveTranslatedField", () => {
  it("çeviri değeri dolu bir string'se onu döner", () => {
    expect(resolveTranslatedField("Villa In Love", "Villa Aşkım")).toBe(
      "Villa In Love"
    );
  });

  it("çeviri null ise parent değerine düşer", () => {
    expect(resolveTranslatedField(null, "Villa Aşkım")).toBe("Villa Aşkım");
  });

  it("çeviri undefined ise parent değerine düşer", () => {
    expect(resolveTranslatedField(undefined, "Villa Aşkım")).toBe(
      "Villa Aşkım"
    );
  });

  it("çeviri boş string ise parent değerine düşer", () => {
    expect(resolveTranslatedField("", "Villa Aşkım")).toBe("Villa Aşkım");
  });

  it("çeviri yalnız boşluk karakterlerinden oluşuyorsa parent değerine düşer", () => {
    expect(resolveTranslatedField("   ", "Villa Aşkım")).toBe("Villa Aşkım");
  });

  it("parent değeri de null olabilir (generic T korunur)", () => {
    expect(resolveTranslatedField(null, null)).toBeNull();
  });

  it("dolu çeviri KIRPILMADAN (trim edilmeden) aynen döner", () => {
    expect(resolveTranslatedField("  Villa In Love  ", "fallback")).toBe(
      "  Villa In Love  "
    );
  });
});
