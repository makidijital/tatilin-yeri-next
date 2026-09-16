/* ===============================================================
   🛡️ PHASE 10E BATCH 1 — VILLA LAYOUT LABEL HELPER TESTS
   ===============================================================
   Hedef: lib/villa-layout-label.helper.ts (enum etiketi → locale).

   GERÇEK (mock'lanmamış) dictionary + GERÇEK BED_TYPES/BATHROOM_TYPES
   kullanılır — Batch 4'teki distance-label.helper.test.ts ile AYNI
   desen. Böylece hem helper hem dictionary içeriği birlikte doğrulanır.

   KRİTİK: TR etiketleri lib/villa-layout.helper.ts'teki mevcut
   BED_TYPE_LABELS/BATHROOM_TYPE_LABELS ile BİREBİR aynı olmalı —
   aksi halde TR public render DEĞİŞİR (regresyon).
=============================================================== */

import { describe, it, expect } from "vitest";
import {
  getBedTypeLabel,
  getBathroomTypeLabel,
} from "@/lib/villa-layout-label.helper";
import {
  BED_TYPES,
  BATHROOM_TYPES,
  BED_TYPE_LABELS,
  BATHROOM_TYPE_LABELS,
} from "@/lib/villa-layout.helper";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";

const LOCALES: Locale[] = ["tr", "en", "de"];

describe("getBedTypeLabel", () => {
  it.each(BED_TYPES.map((t) => [t] as const))(
    "%s → TR etiketi mevcut BED_TYPE_LABELS ile BİREBİR aynı (regresyon guard)",
    (type) => {
      expect(getBedTypeLabel(type, "tr")).toBe(BED_TYPE_LABELS[type]);
    }
  );

  it("EN beklenen sabit değerler", () => {
    expect(getBedTypeLabel("double", "en")).toBe("Double Bed");
    expect(getBedTypeLabel("single", "en")).toBe("Single Bed");
    expect(getBedTypeLabel("queen", "en")).toBe("Queen Bed");
    expect(getBedTypeLabel("king", "en")).toBe("King Bed");
    expect(getBedTypeLabel("bunk", "en")).toBe("Bunk Bed");
    expect(getBedTypeLabel("sofa", "en")).toBe("Sofa Bed");
  });

  it("DE beklenen sabit değerler", () => {
    expect(getBedTypeLabel("double", "de")).toBe("Doppelbett");
    expect(getBedTypeLabel("single", "de")).toBe("Einzelbett");
    expect(getBedTypeLabel("queen", "de")).toBe("Queensize-Bett");
    expect(getBedTypeLabel("king", "de")).toBe("Kingsize-Bett");
    expect(getBedTypeLabel("bunk", "de")).toBe("Etagenbett");
    expect(getBedTypeLabel("sofa", "de")).toBe("Schlafsofa");
  });

  it.each(LOCALES)("locale=%s için 6 yatak tipinin TAMAMI dolu", (locale) => {
    for (const type of BED_TYPES) {
      expect(getBedTypeLabel(type, locale)).toBeTruthy();
    }
  });
});

describe("getBathroomTypeLabel", () => {
  it.each(BATHROOM_TYPES.map((t) => [t] as const))(
    "%s → TR etiketi mevcut BATHROOM_TYPE_LABELS ile BİREBİR aynı (regresyon guard)",
    (type) => {
      expect(getBathroomTypeLabel(type, "tr")).toBe(BATHROOM_TYPE_LABELS[type]);
    }
  );

  it("EN/DE beklenen sabit değerler", () => {
    expect(getBathroomTypeLabel("full", "en")).toBe("Full Bathroom");
    expect(getBathroomTypeLabel("shower_wc", "en")).toBe("Shower + WC");
    expect(getBathroomTypeLabel("wc", "en")).toBe("WC");
    expect(getBathroomTypeLabel("full", "de")).toBe("Vollbad");
    expect(getBathroomTypeLabel("shower_wc", "de")).toBe("Dusche + WC");
    expect(getBathroomTypeLabel("wc", "de")).toBe("WC");
  });

  it.each(LOCALES)("locale=%s için 3 banyo tipinin TAMAMI dolu", (locale) => {
    for (const type of BATHROOM_TYPES) {
      expect(getBathroomTypeLabel(type, locale)).toBeTruthy();
    }
  });
});

describe("dictionary — enum kapsama (drift koruması)", () => {
  it.each(LOCALES)(
    "locale=%s: dictionary key kümesi BED_TYPES/BATHROOM_TYPES ile birebir",
    (locale) => {
      const dict = getDictionary(locale);
      expect(Object.keys(dict.bedTypeLabels).sort()).toEqual(
        [...BED_TYPES].sort()
      );
      expect(Object.keys(dict.bathroomTypeLabels).sort()).toEqual(
        [...BATHROOM_TYPES].sort()
      );
    }
  );

  it("accommodation UI metinleri TR'de mevcut component metinleriyle aynı", () => {
    const tr = getDictionary("tr");
    expect(tr.accommodation.sectionTitle).toBe("Konaklama Düzeni");
    expect(tr.accommodation.noDetail).toBe("Detay belirtilmedi");
    expect(tr.accommodation.bedroomFallback).toBe("{n}. Yatak Odası");
    expect(tr.accommodation.bathroomFallback).toBe("{n}. Banyo");
  });

  it.each(LOCALES)("locale=%s: accommodation şablonları {n} içeriyor", (locale) => {
    const dict = getDictionary(locale);
    expect(dict.accommodation.bedroomFallback).toContain("{n}");
    expect(dict.accommodation.bathroomFallback).toContain("{n}");
    expect(dict.accommodation.sectionTitle).toBeTruthy();
    expect(dict.accommodation.noDetail).toBeTruthy();
  });
});
