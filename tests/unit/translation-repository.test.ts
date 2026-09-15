/* ===============================================================
   🛡️ PHASE 3 / 8D-1 — DATABASE TRANSLATION ARCHITECTURE: REPOSITORY TESTS
   ===============================================================
   Hedef: lib/i18n/translations.types.ts (TRANSLATION_ENTITY_CONFIG)
          lib/db/translation.repository.server.ts (translationRepository
          — findOne/findAllForParent Phase 3, findManyForLocale Phase 8D-1)

   DB bağlantısı KULLANILMAZ — `lib/db/native`'in `dbNative.from()`
   çağrısı mock'lanır, yalnız DOĞRU tablo/kolon adlarıyla
   çağrıldığı doğrulanır (aynı desen: bu projede repository
   testleri de gerçek DB yerine repository/provider mock'lar —
   bkz. discount-collection service testleri).

   🛡️ PHASE 8D-1: mock chain'e `in()` eklendi (yalnız EKLEME —
   `findOne`/`findAllForParent` testleri `.in()` hiç çağırmadığı için
   ETKİLENMEZ). `findManyForLocale` bu fazda hiçbir call-site
   tarafından KULLANILMIYOR — testler yalnız repository/query-wiring
   doğruluğunu kanıtlıyor.

   Mevcut price-engine / discount / pool-heating / reservation
   testlerine HİÇ dokunulmadı.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TRANSLATION_ENTITY_CONFIG,
  type TranslationEntity,
} from "@/lib/i18n/translations.types";

/* ---------------- ENTITY_CONFIG — statik registry doğrulaması ---------------- */

describe("TRANSLATION_ENTITY_CONFIG — 9 tablo, doğru table/parentIdColumn", () => {
  const expected: Record<
    TranslationEntity,
    { table: string; parentIdColumn: string }
  > = {
    villa: { table: "villa_translations", parentIdColumn: "villa_id" },
    villa_location: {
      table: "villa_location_translations",
      parentIdColumn: "location_id",
    },
    villa_type: {
      table: "villa_type_translations",
      parentIdColumn: "type_id",
    },
    villa_feature: {
      table: "villa_feature_translations",
      parentIdColumn: "feature_id",
    },
    rule_item: {
      table: "rule_item_translations",
      parentIdColumn: "rule_id",
    },
    price_include_item: {
      table: "price_include_item_translations",
      parentIdColumn: "include_id",
    },
    villa_distance: {
      table: "villa_distance_translations",
      parentIdColumn: "distance_id",
    },
    page: { table: "page_translations", parentIdColumn: "page_id" },
    faq: { table: "faq_translations", parentIdColumn: "faq_id" },
  };

  it("tam olarak 9 entity içeriyor", () => {
    expect(Object.keys(TRANSLATION_ENTITY_CONFIG)).toHaveLength(9);
  });

  it.each(Object.entries(expected))(
    "%s → doğru table + parentIdColumn",
    (entity, cfg) => {
      expect(
        TRANSLATION_ENTITY_CONFIG[entity as TranslationEntity]
      ).toEqual(cfg);
    }
  );

  it("rule_item YANLIŞ isimle (villa_rule) YOK — audit düzeltmesi kalıcı", () => {
    expect(
      Object.prototype.hasOwnProperty.call(
        TRANSLATION_ENTITY_CONFIG,
        "villa_rule"
      )
    ).toBe(false);
  });
});

/* ---------------- translationRepository — wiring (mock'lu) ---------------- */

const fromMock = vi.fn();
const eqMock = vi.fn();
const selectMock = vi.fn();
const maybeSingleMock = vi.fn();
/* 🛡️ PHASE 8D-1 — yalnız findManyForLocale'ın kullandığı `.in()` için. */
const inMock = vi.fn();

vi.mock("@/lib/db/native", () => ({
  dbNative: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

beforeEach(() => {
  fromMock.mockReset();
  eqMock.mockReset();
  selectMock.mockReset();
  maybeSingleMock.mockReset();
  inMock.mockReset();

  /* Chainable stub: from() → {select} → {eq} → {eq} → {maybeSingle}
     (Phase 3) / from() → {select} → {in} → {eq} (Phase 8D-1, .then()
     ile resolve edilir — .maybeSingle() ÇAĞRILMAZ, findAllForParent
     ile AYNI "çok satır" deseni). Aynı obje her adımda kendini döner
     (fluent chain simülasyonu). */
  const chain: Record<string, unknown> = {};
  chain.select = (...args: unknown[]) => {
    selectMock(...args);
    return chain;
  };
  chain.eq = (...args: unknown[]) => {
    eqMock(...args);
    return chain;
  };
  chain.in = (...args: unknown[]) => {
    inMock(...args);
    return chain;
  };
  chain.maybeSingle = (...args: unknown[]) => {
    maybeSingleMock(...args);
    return Promise.resolve({ data: null, error: null });
  };
  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve({ data: [], error: null }).then(resolve);
  fromMock.mockReturnValue(chain);
});

describe("translationRepository.findOne", () => {
  it("doğru tablo + parentIdColumn + locale ile db.from(...).eq(...).eq('locale', ...) çağırır", async () => {
    const { translationRepository } = await import(
      "@/lib/db/translation.repository.server"
    );

    await translationRepository.findOne("villa", "villa-uuid-1", "en");

    expect(fromMock).toHaveBeenCalledWith("villa_translations");
    expect(selectMock).toHaveBeenCalledWith("*");
    expect(eqMock).toHaveBeenCalledWith("villa_id", "villa-uuid-1");
    expect(eqMock).toHaveBeenCalledWith("locale", "en");
    expect(maybeSingleMock).toHaveBeenCalled();
  });

  it("rule_item entity → rule_item_translations + rule_id kullanır", async () => {
    const { translationRepository } = await import(
      "@/lib/db/translation.repository.server"
    );

    await translationRepository.findOne("rule_item", "rule-uuid-1", "de");

    expect(fromMock).toHaveBeenCalledWith("rule_item_translations");
    expect(eqMock).toHaveBeenCalledWith("rule_id", "rule-uuid-1");
    expect(eqMock).toHaveBeenCalledWith("locale", "de");
  });
});

describe("translationRepository.findAllForParent", () => {
  it("doğru tablo + parentIdColumn ile db.from(...).select('*').eq(...) çağırır (locale filtresi YOK)", async () => {
    const { translationRepository } = await import(
      "@/lib/db/translation.repository.server"
    );

    await translationRepository.findAllForParent("page", "page-uuid-1");

    expect(fromMock).toHaveBeenCalledWith("page_translations");
    expect(selectMock).toHaveBeenCalledWith("*");
    expect(eqMock).toHaveBeenCalledWith("page_id", "page-uuid-1");
    expect(eqMock).not.toHaveBeenCalledWith("locale", expect.anything());
  });
});

/* ===============================================================
   🛡️ PHASE 8D-1 — translationRepository.findManyForLocale
   ===============================================================
   "Birden fazla parent, TEK locale" batch okuma — N+1 önleme
   altyapısı (Phase 8D audit bulgusu). BU FAZDA HİÇBİR call-site
   KULLANMIYOR — yalnız repository/query-wiring doğruluğu test
   ediliyor (findOne/findAllForParent ile AYNI mock seviyesi/desen).
   =============================================================== */
describe("translationRepository.findManyForLocale", () => {
  /* a) doğru entity → doğru translation table
     b) doğru parent ID column ile .in(...)
     c) doğru locale ile .eq(...) */
  it("doğru tablo + parentIdColumn ile .in(...) + doğru locale ile .eq(...) çağırır", async () => {
    const { translationRepository } = await import(
      "@/lib/db/translation.repository.server"
    );

    await translationRepository.findManyForLocale(
      "villa_feature",
      ["feature-uuid-1", "feature-uuid-2"],
      "en"
    );

    expect(fromMock).toHaveBeenCalledWith("villa_feature_translations");
    expect(selectMock).toHaveBeenCalledWith("*");
    expect(inMock).toHaveBeenCalledWith("feature_id", [
      "feature-uuid-1",
      "feature-uuid-2",
    ]);
    expect(eqMock).toHaveBeenCalledWith("locale", "en");
    /* .maybeSingle() ÇAĞRILMAZ — findAllForParent ile AYNI "çok satır"
       davranışı, findOne'dan FARKLI. */
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it("rule_item entity → rule_item_translations + rule_id + 'de' locale kullanır", async () => {
    const { translationRepository } = await import(
      "@/lib/db/translation.repository.server"
    );

    await translationRepository.findManyForLocale(
      "rule_item",
      ["rule-uuid-1"],
      "de"
    );

    expect(fromMock).toHaveBeenCalledWith("rule_item_translations");
    expect(inMock).toHaveBeenCalledWith("rule_id", ["rule-uuid-1"]);
    expect(eqMock).toHaveBeenCalledWith("locale", "de");
  });

  /* d) birden fazla parent ID'nin TEK sorguda kullanılması */
  it("N parent ID → TEK db.from() çağrısı (N ayrı sorgu DEĞİL)", async () => {
    const { translationRepository } = await import(
      "@/lib/db/translation.repository.server"
    );

    await translationRepository.findManyForLocale(
      "villa_distance",
      ["d1", "d2", "d3", "d4", "d5"],
      "en"
    );

    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(inMock).toHaveBeenCalledTimes(1);
    expect(inMock).toHaveBeenCalledWith("distance_id", [
      "d1",
      "d2",
      "d3",
      "d4",
      "d5",
    ]);
  });

  /* e) parentIds=[] → DB query YOK, boş sonuç */
  it("parentIds=[] → db.from() HİÇ ÇAĞRILMAZ, { data: [], error: null } döner", async () => {
    const { translationRepository } = await import(
      "@/lib/db/translation.repository.server"
    );

    const result = await translationRepository.findManyForLocale(
      "price_include_item",
      [],
      "en"
    );

    expect(fromMock).not.toHaveBeenCalled();
    expect(result).toEqual({ data: [], error: null });
  });

  /* f) mevcut 9 TranslationEntity config'inden mapping doğruluğu —
     TRANSLATION_ENTITY_CONFIG ile AYNI kaynaktan (registry testiyle
     tutarlı, tekrar hardcode edilmedi). */
  it.each(
    Object.entries(TRANSLATION_ENTITY_CONFIG) as Array<
      [TranslationEntity, { table: string; parentIdColumn: string }]
    >
  )(
    "%s entity → config'teki table + parentIdColumn ile çağrılır",
    async (entity, cfg) => {
      const { translationRepository } = await import(
        "@/lib/db/translation.repository.server"
      );

      await translationRepository.findManyForLocale(
        entity,
        ["some-parent-id"],
        "en"
      );

      expect(fromMock).toHaveBeenCalledWith(cfg.table);
      expect(inMock).toHaveBeenCalledWith(cfg.parentIdColumn, [
        "some-parent-id",
      ]);
    }
  );
});
