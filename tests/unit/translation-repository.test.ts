/* ===============================================================
   🛡️ PHASE 3 — DATABASE TRANSLATION ARCHITECTURE: REPOSITORY TESTS
   ===============================================================
   Hedef: lib/i18n/translations.types.ts (TRANSLATION_ENTITY_CONFIG)
          lib/db/translation.repository.server.ts (translationRepository)

   DB bağlantısı KULLANILMAZ — `lib/db/native`'in `dbNative.from()`
   çağrısı mock'lanır, yalnız DOĞRU tablo/kolon adlarıyla
   çağrıldığı doğrulanır (aynı desen: bu projede repository
   testleri de gerçek DB yerine repository/provider mock'lar —
   bkz. discount-collection service testleri).

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

  /* Chainable stub: from() → {select} → {eq} → {eq} → {maybeSingle}
     Aynı obje her adımda kendini döner (fluent chain simülasyonu). */
  const chain: Record<string, unknown> = {};
  chain.select = (...args: unknown[]) => {
    selectMock(...args);
    return chain;
  };
  chain.eq = (...args: unknown[]) => {
    eqMock(...args);
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
