/* ===============================================================
   🛡️ PHASE 10E BATCH 1 — LAYOUT TRANSLATION DRIFT GUARD TESTS
   ===============================================================
   Hedef: lib/villa-layout-translation.helper.ts

   BU DOSYANIN ASIL AMACI: "sessizce yanlış odaya çeviri bağlamak"
   senaryolarının TAMAMININ TR fallback ürettiğini kanıtlamak.
   Oda/banyo kayıtlarının stabil ID'si yok; admin oda ekleyebilir,
   silebilir, sıralayabilir → index tek başına güvenilir değil.
=============================================================== */

import { describe, it, expect } from "vitest";
import {
  normalizeLayoutTranslationEntries,
  buildLayoutTranslationEntries,
  resolveLayoutTranslationNames,
} from "@/lib/villa-layout-translation.helper";

const TR = ["Ana Yatak Odası", "Çocuk Odası", "İkiz Yataklı Oda"];
const EN_ENTRIES = [
  { i: 0, tr: "Ana Yatak Odası", name: "Master Bedroom" },
  { i: 1, tr: "Çocuk Odası", name: "Children's Bedroom" },
  { i: 2, tr: "İkiz Yataklı Oda", name: "Twin Bedroom" },
];

describe("normalizeLayoutTranslationEntries", () => {
  it("geçerli diziyi aynen döner (trim uygulanmış)", () => {
    expect(
      normalizeLayoutTranslationEntries([
        { i: 0, tr: "  Ana Yatak Odası  ", name: "  Master Bedroom  " },
      ])
    ).toEqual([{ i: 0, tr: "Ana Yatak Odası", name: "Master Bedroom" }]);
  });

  it("dizi olmayan/boş/null girdiler → []", () => {
    expect(normalizeLayoutTranslationEntries(null)).toEqual([]);
    expect(normalizeLayoutTranslationEntries(undefined)).toEqual([]);
    expect(normalizeLayoutTranslationEntries("x")).toEqual([]);
    expect(normalizeLayoutTranslationEntries({})).toEqual([]);
    expect(normalizeLayoutTranslationEntries(42)).toEqual([]);
    expect(normalizeLayoutTranslationEntries([])).toEqual([]);
  });

  it("bozuk kayıtlar düşürülür (i yok / negatif / tip hatası)", () => {
    expect(
      normalizeLayoutTranslationEntries([
        null,
        "string",
        { tr: "A", name: "B" },
        { i: -1, tr: "A", name: "B" },
        { i: 0, tr: 5, name: "B" },
        { i: 1, tr: "A", name: 5 },
        { i: 2, tr: "A", name: "B" },
      ])
    ).toEqual([{ i: 2, tr: "A", name: "B" }]);
  });

  it("name boş olabilir (çevrilmemiş satır) — düşürülmez", () => {
    expect(
      normalizeLayoutTranslationEntries([{ i: 0, tr: "Oda", name: "" }])
    ).toEqual([{ i: 0, tr: "Oda", name: "" }]);
  });

  it("tr boş olabilir (isimsiz TR odası geçerlidir) — düşürülmez", () => {
    expect(
      normalizeLayoutTranslationEntries([{ i: 0, tr: "", name: "Bedroom" }])
    ).toEqual([{ i: 0, tr: "", name: "Bedroom" }]);
  });
});

describe("buildLayoutTranslationEntries (admin kaydetme yolu)", () => {
  it("TR layout'un pozisyonel aynasını üretir", () => {
    expect(
      buildLayoutTranslationEntries(TR, [
        "Master Bedroom",
        "Children's Bedroom",
        "Twin Bedroom",
      ])
    ).toEqual(EN_ENTRIES);
  });

  it("kısmi çeviride çevrilmemiş satır name:'' ile YERİNİ KORUR", () => {
    expect(
      buildLayoutTranslationEntries(TR, ["Master Bedroom", "", null])
    ).toEqual([
      { i: 0, tr: "Ana Yatak Odası", name: "Master Bedroom" },
      { i: 1, tr: "Çocuk Odası", name: "" },
      { i: 2, tr: "İkiz Yataklı Oda", name: "" },
    ]);
  });

  it("hiç çeviri yoksa BOŞ dizi döner (çağıran taraf NULL yazar)", () => {
    expect(buildLayoutTranslationEntries(TR, ["", "  ", undefined])).toEqual([]);
    expect(buildLayoutTranslationEntries(TR, [])).toEqual([]);
  });

  it("boş TR layout → boş dizi", () => {
    expect(buildLayoutTranslationEntries([], [])).toEqual([]);
  });
});

describe("resolveLayoutTranslationNames — mutlu yol", () => {
  it("tam çeviri uygulanır", () => {
    const r = resolveLayoutTranslationNames(TR, EN_ENTRIES);
    expect(r.names).toEqual([
      "Master Bedroom",
      "Children's Bedroom",
      "Twin Bedroom",
    ]);
    expect(r.usedTranslation).toBe(true);
    expect(r.stale).toBe(false);
  });

  it("TR sırası korunur (1:1 pozisyonel eşleme)", () => {
    const r = resolveLayoutTranslationNames(TR, EN_ENTRIES);
    expect(r.names).toHaveLength(TR.length);
    expect(r.names[0]).toBe("Master Bedroom");
    expect(r.names[2]).toBe("Twin Bedroom");
  });

  it("kısmi çeviri → çevrilen çevrilir, kalan TR", () => {
    const r = resolveLayoutTranslationNames(TR, [
      { i: 0, tr: "Ana Yatak Odası", name: "Master Bedroom" },
      { i: 1, tr: "Çocuk Odası", name: "" },
      { i: 2, tr: "İkiz Yataklı Oda", name: "" },
    ]);
    expect(r.names).toEqual([
      "Master Bedroom",
      "Çocuk Odası",
      "İkiz Yataklı Oda",
    ]);
    expect(r.usedTranslation).toBe(true);
    expect(r.stale).toBe(false);
  });
});

describe("resolveLayoutTranslationNames — DRIFT: TR fallback zorunlu", () => {
  it("çeviri hiç yok (null/[]) → TR, stale DEĞİL", () => {
    for (const raw of [null, undefined, []]) {
      const r = resolveLayoutTranslationNames(TR, raw);
      expect(r.names).toEqual(TR);
      expect(r.usedTranslation).toBe(false);
      expect(r.stale).toBe(false);
    }
  });

  it("bozuk/geçersiz dizi → TR fallback", () => {
    const r = resolveLayoutTranslationNames(TR, "bozuk-veri");
    expect(r.names).toEqual(TR);
    expect(r.usedTranslation).toBe(false);
  });

  it("🛡️ ODA SAYISI ARTTI (yeni oda eklendi) → TÜM dizi reddedilir", () => {
    const trPlusOne = [...TR, "Misafir Odası"];
    const r = resolveLayoutTranslationNames(trPlusOne, EN_ENTRIES);
    expect(r.names).toEqual(trPlusOne);
    expect(r.usedTranslation).toBe(false);
    expect(r.stale).toBe(true);
  });

  it("🛡️ ODA SAYISI AZALDI (oda silindi) → TÜM dizi reddedilir", () => {
    const trMinusOne = TR.slice(0, 2);
    const r = resolveLayoutTranslationNames(trMinusOne, EN_ENTRIES);
    expect(r.names).toEqual(trMinusOne);
    expect(r.usedTranslation).toBe(false);
    expect(r.stale).toBe(true);
  });

  it("🛡️ INDEX POZİSYONLA UYUŞMUYOR → TÜM dizi reddedilir", () => {
    const r = resolveLayoutTranslationNames(TR, [
      { i: 1, tr: "Ana Yatak Odası", name: "Master Bedroom" },
      { i: 0, tr: "Çocuk Odası", name: "Children's Bedroom" },
      { i: 2, tr: "İkiz Yataklı Oda", name: "Twin Bedroom" },
    ]);
    expect(r.names).toEqual(TR);
    expect(r.usedTranslation).toBe(false);
    expect(r.stale).toBe(true);
  });

  it("🛡️ TR ADI DEĞİŞTİ → YALNIZ o satır TR'ye düşer, diğerleri korunur", () => {
    const trRenamed = ["Ebeveyn Odası", "Çocuk Odası", "İkiz Yataklı Oda"];
    const r = resolveLayoutTranslationNames(trRenamed, EN_ENTRIES);
    expect(r.names).toEqual([
      "Ebeveyn Odası",
      "Children's Bedroom",
      "Twin Bedroom",
    ]);
    expect(r.usedTranslation).toBe(true);
    expect(r.stale).toBe(true);
  });

  it("🛡️ ODALAR YENİDEN SIRALANDI → çeviri yanlış odaya BAĞLANMAZ", () => {
    /* Admin 1. ve 2. odayı yer değiştirdi; çeviri dizisi eski sırada. */
    const reordered = ["Çocuk Odası", "Ana Yatak Odası", "İkiz Yataklı Oda"];
    const r = resolveLayoutTranslationNames(reordered, EN_ENTRIES);
    /* İlk iki satır TR'ye düşmeli — "Çocuk Odası" ASLA "Master Bedroom"
       olarak gösterilmemeli. */
    expect(r.names[0]).toBe("Çocuk Odası");
    expect(r.names[1]).toBe("Ana Yatak Odası");
    expect(r.names).not.toContain("Master Bedroom");
    expect(r.names).not.toContain("Children's Bedroom");
    expect(r.stale).toBe(true);
  });

  it("boş TR layout + çeviri var → boş sonuç, çeviri sızmaz", () => {
    const r = resolveLayoutTranslationNames([], EN_ENTRIES);
    expect(r.names).toEqual([]);
    expect(r.usedTranslation).toBe(false);
  });

  it("isimsiz TR odası (name:'') çevrilebilir — eşleşme '' === '' üzerinden", () => {
    const r = resolveLayoutTranslationNames(
      ["", "Çocuk Odası"],
      [
        { i: 0, tr: "", name: "Bedroom 1" },
        { i: 1, tr: "Çocuk Odası", name: "Children's Bedroom" },
      ]
    );
    expect(r.names).toEqual(["Bedroom 1", "Children's Bedroom"]);
    expect(r.stale).toBe(false);
  });
});

describe("resolveLayoutTranslationNames — banyolar (aynı implementasyon)", () => {
  const TR_BATH = ["1. Banyo", "2. Banyo"];

  it("tam çeviri", () => {
    const r = resolveLayoutTranslationNames(TR_BATH, [
      { i: 0, tr: "1. Banyo", name: "Bathroom 1" },
      { i: 1, tr: "2. Banyo", name: "Bathroom 2" },
    ]);
    expect(r.names).toEqual(["Bathroom 1", "Bathroom 2"]);
  });

  it("🛡️ banyo sayısı uyuşmazlığı → TR fallback", () => {
    const r = resolveLayoutTranslationNames(["1. Banyo"], [
      { i: 0, tr: "1. Banyo", name: "Bathroom 1" },
      { i: 1, tr: "2. Banyo", name: "Bathroom 2" },
    ]);
    expect(r.names).toEqual(["1. Banyo"]);
    expect(r.usedTranslation).toBe(false);
    expect(r.stale).toBe(true);
  });
});

describe("round-trip: build → resolve", () => {
  it("build edilen dizi aynı TR layout'la resolve edilince birebir geri gelir", () => {
    const built = buildLayoutTranslationEntries(TR, [
      "Master Bedroom",
      "Children's Bedroom",
      "Twin Bedroom",
    ]);
    const r = resolveLayoutTranslationNames(TR, built);
    expect(r.names).toEqual([
      "Master Bedroom",
      "Children's Bedroom",
      "Twin Bedroom",
    ]);
    expect(r.stale).toBe(false);
  });

  it("build → TR layout değişti → resolve güvenli şekilde TR'ye düşer", () => {
    const built = buildLayoutTranslationEntries(TR, [
      "Master Bedroom",
      "Children's Bedroom",
      "Twin Bedroom",
    ]);
    const r = resolveLayoutTranslationNames([...TR, "Yeni Oda"], built);
    expect(r.usedTranslation).toBe(false);
    expect(r.stale).toBe(true);
  });
});
