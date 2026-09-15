/* ===============================================================
   🛡️ PHASE 6B — VILLA DETAIL TITLE TRANSLATION: TESTLER
   ===============================================================
   Hedef: lib/i18n/get-villa-translation.server.ts (getVillaTranslatedTitle)

   Mock SEVİYESİ bilinçli seçildi: Phase 5'in `get-translation.test.ts`'i
   gibi, en ALT sınırda — `@/lib/db/translation.repository.server`'ın
   `findOne`'ı — mock'lanır. Böylece `getTranslation` (Phase 5, TR
   kısayolu dahil) ve `resolveTranslatedField` (fallback) GERÇEK
   kodlarıyla çalışır; bu dosya yalnız "doğru villaId/locale ile doğru
   sorgu + doğru fallback" ZİNCİRİNİ uçtan uca doğrular. GERÇEK DB'YE
   HİÇ DOKUNULMAZ, production villa_translations'a test verisi
   YAZILMAZ.

   React `cache()` bu ortamda (Vitest/Node, aktif RSC dispatcher yok)
   memoize ETMEZ — her çağrı taze çalışır (bkz. request-locale.test.ts
   ampirik notu). Bu, aşağıdaki testlerin doğruluğunu ETKİLEMEZ (her
   test tek bir çağrı yapıyor); yalnız request-içi dedupe'un KENDİSİ
   bu dosyada ayrıca test edilmiyor (Next.js/React'ın kendi garantisi,
   Phase 4B'de zaten doğrulandı).

   Mevcut price-engine / discount / pool-heating / reservation / TR
   route / Phase 1B-2-4A-4B-5 testlerine HİÇ dokunulmadı.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

import { getVillaTranslatedTitle } from "@/lib/i18n/get-villa-translation.server";

const findOneMock = vi.fn();

vi.mock("@/lib/db/translation.repository.server", () => ({
  translationRepository: {
    findOne: (...args: unknown[]) => findOneMock(...args),
  },
}));

beforeEach(() => {
  findOneMock.mockReset();
});

const VILLA_ID = "villa-uuid-1";
const ORIGINAL_TITLE = "Villa Aşkım";

describe("getVillaTranslatedTitle", () => {
  /* --- 1) TR --- */
  it("1) locale='tr' → orijinal villa.title döner, translation sorgusu ATILMAZ", async () => {
    const result = await getVillaTranslatedTitle(VILLA_ID, ORIGINAL_TITLE, "tr");
    expect(result).toBe(ORIGINAL_TITLE);
    expect(findOneMock).not.toHaveBeenCalled();
  });

  /* --- 2) EN + mevcut --- */
  it("2) locale='en' + çeviri mevcut → çevrilmiş title döner", async () => {
    findOneMock.mockResolvedValue({
      data: { id: "t1", villa_id: VILLA_ID, locale: "en", title: "Villa In Love", description: null, badge: null, seo_title: null, seo_description: null, created_at: "", updated_at: "" },
      error: null,
    });
    const result = await getVillaTranslatedTitle(VILLA_ID, ORIGINAL_TITLE, "en");
    expect(result).toBe("Villa In Love");
  });

  /* --- 3) EN + yok --- */
  it("3) locale='en' + çeviri YOK → orijinal villa.title'a düşer", async () => {
    findOneMock.mockResolvedValue({ data: null, error: null });
    const result = await getVillaTranslatedTitle(VILLA_ID, ORIGINAL_TITLE, "en");
    expect(result).toBe(ORIGINAL_TITLE);
  });

  /* --- 4) DE + mevcut --- */
  it("4) locale='de' + çeviri mevcut → çevrilmiş title döner", async () => {
    findOneMock.mockResolvedValue({
      data: { id: "t2", villa_id: VILLA_ID, locale: "de", title: "Villa Verliebt", description: null, badge: null, seo_title: null, seo_description: null, created_at: "", updated_at: "" },
      error: null,
    });
    const result = await getVillaTranslatedTitle(VILLA_ID, ORIGINAL_TITLE, "de");
    expect(result).toBe("Villa Verliebt");
  });

  /* --- 5) DE + yok --- */
  it("5) locale='de' + çeviri YOK → orijinal villa.title'a düşer", async () => {
    findOneMock.mockResolvedValue({ data: null, error: null });
    const result = await getVillaTranslatedTitle(VILLA_ID, ORIGINAL_TITLE, "de");
    expect(result).toBe(ORIGINAL_TITLE);
  });

  /* --- 6) DB hatası --- */
  it("6) DB hatası dönerse → exception FIRLATMADAN orijinal villa.title'a düşer", async () => {
    findOneMock.mockResolvedValue({
      data: null,
      error: { message: "connection lost" },
    });
    await expect(
      getVillaTranslatedTitle(VILLA_ID, ORIGINAL_TITLE, "en")
    ).resolves.toBe(ORIGINAL_TITLE);
  });

  /* --- 7) Helper doğru locale kullanıyor --- */
  it("7) helper, findOne'ı TAM OLARAK geçirilen locale ile çağırır ('en')", async () => {
    findOneMock.mockResolvedValue({ data: null, error: null });
    await getVillaTranslatedTitle(VILLA_ID, ORIGINAL_TITLE, "en");
    expect(findOneMock).toHaveBeenCalledWith("villa", VILLA_ID, "en");
  });

  it("7b) helper, findOne'ı TAM OLARAK geçirilen locale ile çağırır ('de')", async () => {
    findOneMock.mockResolvedValue({ data: null, error: null });
    await getVillaTranslatedTitle(VILLA_ID, ORIGINAL_TITLE, "de");
    expect(findOneMock).toHaveBeenCalledWith("villa", VILLA_ID, "de");
  });

  /* --- 8) Doğru villa ID + entity --- */
  it("8) translation sorgusu doğru villa ID + 'villa' entity'siyle atılır (başka bir villaId ile karışmaz)", async () => {
    findOneMock.mockResolvedValue({ data: null, error: null });
    const otherVillaId = "villa-uuid-2";
    await getVillaTranslatedTitle(otherVillaId, ORIGINAL_TITLE, "en");
    expect(findOneMock).toHaveBeenCalledTimes(1);
    expect(findOneMock).toHaveBeenCalledWith("villa", otherVillaId, "en");
    expect(findOneMock).not.toHaveBeenCalledWith("villa", VILLA_ID, "en");
  });
});
