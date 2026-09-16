/* ===============================================================
   🛡️ PHASE 10E BATCH 2 — villa-layout-translations.action.ts TESTLERİ
   ===============================================================
   AMAÇ: saveVillaLayoutTranslationAction'ın `authorizeAdminSession()`'ı
   İLK kontrol olarak çağırdığını, yetkisiz durumda servise/DB'ye HİÇ
   ulaşılmadığını; loadVillaLayoutTranslationsAction'ın (sayfa zaten
   middleware korumalı) ekstra auth OLMADAN servise ulaştığını doğrular.

   Mock convention: villa-translations-action.test.ts (Phase 10A) ile
   BİREBİR AYNI desen.
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";

const authorizeAdminSessionMock = vi.fn();
const getVillaLayoutTranslationsMock = vi.fn();
const upsertVillaLayoutTranslationMock = vi.fn();

vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminSession: (...args: unknown[]) =>
    authorizeAdminSessionMock(...args),
}));

vi.mock("@/app/services/villa-layout-translation.service", () => ({
  getVillaLayoutTranslations: (...args: unknown[]) =>
    getVillaLayoutTranslationsMock(...args),
  upsertVillaLayoutTranslation: (...args: unknown[]) =>
    upsertVillaLayoutTranslationMock(...args),
}));

import {
  loadVillaLayoutTranslationsAction,
  saveVillaLayoutTranslationAction,
} from "@/app/(admin)/maki-admin/villas/[id]/_components/villa-layout-translations.action";

const VILLA_ID = "villa-uuid-1";
const BEDROOM_INPUT = [
  { i: 0, tr: "Ana Yatak Odası", name: "Master Bedroom" },
];

beforeEach(() => {
  vi.clearAllMocks();
  authorizeAdminSessionMock.mockResolvedValue({
    ok: true,
    caller: { id: "admin-1" },
  });
});

describe("saveVillaLayoutTranslationAction — authorizeAdminSession İLK kontrol", () => {
  it("17) yetkili çağrıda authorizeAdminSession TAM 1 kez çağrılır", async () => {
    upsertVillaLayoutTranslationMock.mockResolvedValueOnce({
      ok: true,
      row: { id: "row-1" },
    });

    await saveVillaLayoutTranslationAction({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: BEDROOM_INPUT,
    });

    expect(authorizeAdminSessionMock).toHaveBeenCalledTimes(1);
  });

  it("18) yetkisiz oturum → { ok:false, error:'Yetkisiz' }, servise/DB'ye SIFIR çağrı", async () => {
    authorizeAdminSessionMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "unauthorized",
    });

    const result = await saveVillaLayoutTranslationAction({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: BEDROOM_INPUT,
    });

    expect(result).toEqual({ ok: false, error: "Yetkisiz" });
    expect(upsertVillaLayoutTranslationMock).toHaveBeenCalledTimes(0);
  });

  it("18b) 403 (pasif hesap) de aynı şekilde reddedilir", async () => {
    authorizeAdminSessionMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "Hesabınız pasif durumda",
    });

    const result = await saveVillaLayoutTranslationAction({
      villaId: VILLA_ID,
      locale: "de",
      bathroomLayout: [],
    });

    expect(result).toEqual({ ok: false, error: "Yetkisiz" });
    expect(upsertVillaLayoutTranslationMock).not.toHaveBeenCalled();
  });

  it("19) yetkili oturum → servise ulaşır, input AYNEN iletilir", async () => {
    upsertVillaLayoutTranslationMock.mockResolvedValueOnce({
      ok: true,
      row: { id: "row-1", villa_id: VILLA_ID, locale: "en" },
    });

    const input = {
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: BEDROOM_INPUT,
    };
    const result = await saveVillaLayoutTranslationAction(input);

    expect(upsertVillaLayoutTranslationMock).toHaveBeenCalledWith(input);
    expect(result).toEqual({
      ok: true,
      row: { id: "row-1", villa_id: VILLA_ID, locale: "en" },
    });
  });

  it("20) malformed payload → servis reddi aynen caller'a iletilir", async () => {
    upsertVillaLayoutTranslationMock.mockResolvedValueOnce({
      ok: false,
      error: "Oda çeviri formatı geçersiz",
    });

    const result = await saveVillaLayoutTranslationAction({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: "bozuk",
    });

    expect(result).toEqual({ ok: false, error: "Oda çeviri formatı geçersiz" });
  });

  it("21) locale 'tr' → servis reddi aynen iletilir (action bypass etmez)", async () => {
    upsertVillaLayoutTranslationMock.mockResolvedValueOnce({
      ok: false,
      error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir",
    });

    const result = await saveVillaLayoutTranslationAction({
      villaId: VILLA_ID,
      locale: "tr",
      bedroomLayout: BEDROOM_INPUT,
    });

    expect(result.ok).toBe(false);
    /* Auth geçtiği için servise ULAŞIR; reddi servis verir (tek doğruluk
       kaynağı — locale kuralı iki yerde kopyalanmaz). */
    expect(upsertVillaLayoutTranslationMock).toHaveBeenCalledTimes(1);
  });

  it("22) başarılı response { ok:true } convention'ına uyar", async () => {
    upsertVillaLayoutTranslationMock.mockResolvedValueOnce({
      ok: true,
      row: { id: "row-1" },
    });

    const result = await saveVillaLayoutTranslationAction({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: BEDROOM_INPUT,
    });

    expect(result.ok).toBe(true);
  });
});

describe("loadVillaLayoutTranslationsAction — sayfa zaten middleware korumalı", () => {
  it("authorizeAdminSession HİÇ çağrılmadan servise ulaşır", async () => {
    getVillaLayoutTranslationsMock.mockResolvedValueOnce({ ok: true, rows: [] });

    const result = await loadVillaLayoutTranslationsAction(VILLA_ID);

    expect(authorizeAdminSessionMock).not.toHaveBeenCalled();
    expect(getVillaLayoutTranslationsMock).toHaveBeenCalledWith(VILLA_ID);
    expect(result).toEqual({ ok: true, rows: [] });
  });
});
