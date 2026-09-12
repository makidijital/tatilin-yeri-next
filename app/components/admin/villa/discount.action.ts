"use server";

/* 🛡️ villa_discounts — SERVER ACTIONS (Admin "İndirimler" UI)
   ===============================================================
   `pricing.action.ts` (villa_prices) İLE AYNI DESEN, TAMAMEN AYRI
   dosya/tablo/RPC üzerinden çalışır:
     - Read: villaDiscountRepository.findDiscountsByVillaId
     - Write: villaDiscountRepository.rpcReplaceVillaDiscounts
       (replace_villa_discounts RPC, migration 079 — atomic
       DELETE+INSERT, `villa_prices`'ın replace-all deseninin
       birebir ikizi; bu action'lar HENÜZ hiçbir çağıranı olmayan
       Adım 1 repository'sinin İLK tüketicisidir).

   ⚠️ KAPSAM SINIRI:
     - villa_prices / pricing.action.ts / PricingCalendarCanvas /
       price.engine.ts / rezervasyon / public fiyat gösterimi —
       HİÇBİRİNE dokunulmadı, HİÇBİRİ buradan import edilmiyor.
     - Bu dosya yalnız villa_discounts CRUD'unu admin UI'a bağlar.

   YETKİ: authorizeAdminSession() — mevcut admin session cookie'si
   (diğer server action'larla aynı gate, bkz. pricing.action.ts /
   gallery.action.ts). Read tarafında gate YOK (mevcut fiyat okuma
   action'ı — loadPricingData — ile aynı: public/no-gate read,
   sadece write admin-gated).
=============================================================== */
import { villaDiscountRepository } from "@/lib/db/villa-discount.repository.server";
import type { VillaDiscountInput } from "@/lib/db/villa-discount.repository.server";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import type { VillaDiscountRow } from "@/types/database";

export type DiscountActionResult =
  | { ok: true }
  | { ok: false; error: string };

/* ---------------------------------------------
   🔥 DB hatasını anlaşılır Türkçe mesaja çevir.
   - EXCLUDE constraint (villa_discounts_no_overlap, SQLSTATE 23P01)
     → çakışan tarih aralığı (kullanıcının Soru 10'da istediği anlaşılır
     hata mesajı, TAM OLARAK BU).
   - CHECK constraint isimlerine göre (23514) daha spesifik mesajlar.
   - Diğer her şey → generic fallback (ham mesaj eklenir, admin'e
     debug bilgisi verir).
---------------------------------------------- */
function mapDiscountError(
  err: { code?: string; message?: string } | null
): string {
  if (!err) return "Bilinmeyen bir hata oluştu.";
  const msg = err.message || "";

  if (err.code === "23P01" || msg.includes("villa_discounts_no_overlap")) {
    return "Seçilen tarih aralığı, bu villa için tanımlı başka bir indirimle çakışıyor. Lütfen farklı bir tarih aralığı seç.";
  }
  if (msg.includes("villa_discounts_percent_range")) {
    return "Yüzde indirim değeri 100'ü geçemez.";
  }
  if (msg.includes("villa_discounts_currency_consistency")) {
    return "Sabit tutar indiriminde para birimi seçilmelidir.";
  }
  if (msg.includes("villa_discounts_value_positive")) {
    return "İndirim değeri 0'dan büyük olmalıdır.";
  }
  if (msg.includes("villa_discounts_valid_range")) {
    return "Bitiş tarihi, başlangıç tarihinden önce olamaz.";
  }
  if (msg.includes("villa_discounts_type_check")) {
    return "Geçersiz indirim türü.";
  }
  return `İndirim kaydedilemedi${msg ? `: ${msg}` : "."}`;
}

/** READ — bir villanın tüm indirimlerini getirir (start_date artan). */
export async function loadDiscountData(villaId: string): Promise<{
  discounts: VillaDiscountRow[];
  error?: string;
}> {
  const { data, error } =
    await villaDiscountRepository.findDiscountsByVillaId(villaId);

  if (error) {
    console.error("loadDiscountData:", error.message);
    return { discounts: [], error: "İndirimler yüklenemedi." };
  }

  const rows = (data || [])
    .slice()
    .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));

  return { discounts: rows };
}

/** WRITE — atomic replace-all (villa_prices ile birebir aynı desen).
 *  Caller (client component) tam listeyi (mevcut + eklenen/çıkarılan)
 *  gönderir; RPC o villa için tabloyu DELETE+INSERT ile değiştirir. */
export async function saveDiscountData(
  villaId: string,
  discounts: VillaDiscountInput[]
): Promise<DiscountActionResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) {
    return { ok: false, error: auth.error || "Oturum doğrulanamadı." };
  }

  const { error } = await villaDiscountRepository.rpcReplaceVillaDiscounts(
    villaId,
    discounts
  );

  if (error) {
    console.error("saveDiscountData:", error.message);
    return { ok: false, error: mapDiscountError(error) };
  }

  return { ok: true };
}
