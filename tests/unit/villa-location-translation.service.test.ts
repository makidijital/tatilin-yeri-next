/* ===============================================================
   🛡️ PHASE 10D — Batch 1 — villa-location-translation.service.ts TESTLERİ
   ===============================================================
   villa-translation-service.test.ts (Phase 10A) ile AYNI desen —
   tek fark: bu serviste parent-existence pre-check YOK (villa-location
   repository'de findById yok), bu yüzden findSlugById mock'u yok.
   translationRepository MOCK'LANIR — gerçek DB'ye dokunulmaz.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

const findAllForParentMock = vi.fn();
const upsertOneMock = vi.fn();

vi.mock("@/lib/db/translation.repository.server", () => ({
  translationRepository: {
    findAllForParent: (...args: unknown[]) => findAllForParentMock(...args),
    upsertOne: (...args: unknown[]) => upsertOneMock(...args),
  },
}));

const VALID_ROW = {
  id: "row-1",
  location_id: "location-uuid-1",
  locale: "en",
  name: "Test Location",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  findAllForParentMock.mockReset();
  upsertOneMock.mockReset();

  upsertOneMock.mockResolvedValue({ data: VALID_ROW, error: null });
  findAllForParentMock.mockResolvedValue({ data: [], error: null });
});

describe("upsertLocationTranslation", () => {
  it("EN upsert — geçerli girdi repository.upsertOne'a doğru argümanlarla ulaşır", async () => {
    const { upsertLocationTranslation } = await import(
      "@/app/services/villa-location-translation.service"
    );

    const result = await upsertLocationTranslation({
      locationId: "location-uuid-1",
      locale: "en",
      name: "Test Location",
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith(
      "villa_location",
      "location-uuid-1",
      "en",
      { name: "Test Location" }
    );
  });

  it("DE upsert — geçerli girdi repository.upsertOne'a doğru argümanlarla ulaşır", async () => {
    const { upsertLocationTranslation } = await import(
      "@/app/services/villa-location-translation.service"
    );

    const result = await upsertLocationTranslation({
      locationId: "location-uuid-1",
      locale: "de",
      name: "Test Standort",
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith(
      "villa_location",
      "location-uuid-1",
      "de",
      { name: "Test Standort" }
    );
  });

  it("mevcut EN çeviriyi günceller (aynı upsertOne çağrı deseni)", async () => {
    const { upsertLocationTranslation } = await import(
      "@/app/services/villa-location-translation.service"
    );

    await upsertLocationTranslation({ locationId: "location-uuid-1", locale: "en", name: "V1" });
    await upsertLocationTranslation({ locationId: "location-uuid-1", locale: "en", name: "V2 güncel" });

    expect(upsertOneMock).toHaveBeenCalledTimes(2);
    expect(upsertOneMock).toHaveBeenLastCalledWith(
      "villa_location",
      "location-uuid-1",
      "en",
      { name: "V2 güncel" }
    );
  });

  it("locale 'fr' reddedilir — repository çağrılmaz", async () => {
    const { upsertLocationTranslation } = await import(
      "@/app/services/villa-location-translation.service"
    );

    const result = await upsertLocationTranslation({
      locationId: "location-uuid-1",
      locale: "fr",
      name: "Emplacement",
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("locale 'tr' reddedilir — bu UI üzerinden TR yazılamaz", async () => {
    const { upsertLocationTranslation } = await import(
      "@/app/services/villa-location-translation.service"
    );

    const result = await upsertLocationTranslation({
      locationId: "location-uuid-1",
      locale: "tr",
      name: "Türkçe İsim",
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("boş/geçersiz locationId reddedilir — repository çağrılmaz", async () => {
    const { upsertLocationTranslation } = await import(
      "@/app/services/villa-location-translation.service"
    );

    const result = await upsertLocationTranslation({
      locationId: "   ",
      locale: "en",
      name: "Test",
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("boş isim reddedilir (trim sonrası boş)", async () => {
    const { upsertLocationTranslation } = await import(
      "@/app/services/villa-location-translation.service"
    );

    const result = await upsertLocationTranslation({
      locationId: "location-uuid-1",
      locale: "en",
      name: "   ",
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("geçerli girdi repository'ye başarıyla ulaşır ve { ok: true, row } döner", async () => {
    const { upsertLocationTranslation } = await import(
      "@/app/services/villa-location-translation.service"
    );

    const result = await upsertLocationTranslation({
      locationId: "location-uuid-1",
      locale: "en",
      name: "Test Location",
    });

    expect(result).toEqual({ ok: true, row: VALID_ROW });
  });
});

describe("getLocationTranslations", () => {
  it("yalnız en/de satırlarını döner (tr varsa filtrelenir)", async () => {
    findAllForParentMock.mockResolvedValueOnce({
      data: [
        { ...VALID_ROW, locale: "tr" },
        { ...VALID_ROW, locale: "en" },
        { ...VALID_ROW, locale: "de" },
      ],
      error: null,
    });

    const { getLocationTranslations } = await import(
      "@/app/services/villa-location-translation.service"
    );

    const result = await getLocationTranslations("location-uuid-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows.map((r) => r.locale).sort()).toEqual(["de", "en"]);
    }
  });

  it("boş/geçersiz locationId reddedilir — repository çağrılmaz", async () => {
    const { getLocationTranslations } = await import(
      "@/app/services/villa-location-translation.service"
    );

    const result = await getLocationTranslations("   ");

    expect(result.ok).toBe(false);
    expect(findAllForParentMock).not.toHaveBeenCalled();
  });
});
