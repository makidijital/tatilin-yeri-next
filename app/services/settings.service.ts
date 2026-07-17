import { settingsRepository } from "@/lib/db/settings.repository";
import type { Settings } from "./settings.types";

/* ===============================================================
   🔥 SETTINGS — global site ayarları
   ===============================================================
   ⚠️ FAZ 6 S1 — `Settings` + `WatermarkPosition` tipleri client-safe
   `./settings.types` modülüne taşındı; burada import edilip kullanılır
   (tüm dış tip-tüketicileri de settings.types'tan alır). Şekiller AYNEN.
   =============================================================== */


/* ===============================================================
   🛡️ SAFE getSettings (Faz 2A)
   ===============================================================
   .single() boş tabloda PGRST116 (no rows) hatası fırlatır ve
   downstream'de Header/TopBar/BookingSidebar/Mail config pipeline'ı
   çöküyordu. .maybeSingle() boş tabloda { data: null } döner;
   davranış:
     - tablo BOŞSA → null (önceden: exception)
     - row mevcutsa → aynı Settings objesi (BYTE-IDENTICAL)
   Schema/UI değişmedi. Çağıran tüm yerler zaten `Settings | null`
   bekliyor, yeni davranış uyumlu.
   =============================================================== */
export async function getSettings(): Promise<Settings | null> {
  /* FAZ 40: settingsRepository delege; .maybeSingle resolver aynen.
     ⚠️ FULL row (resend_api_key DAHİL). YALNIZ server (mail
     getMailConfig) ve authenticated admin (settings edit) bağlamında
     kullanılmalı. Public/client için getPublicSettings() kullanın. */
  const { data, error } = await settingsRepository.findSingleton();

  if (error) {
    console.error("[settings.get] FAILED", error.message);
    return null;
  }

  return (data as Settings) || null;
}

/* ===============================================================
   🛡️ getPublicSettings — PUBLIC-SAFE (resend_api_key HARİÇ)
   ===============================================================
   Public/client component'ler (TopBar, ReservationForm,
   useBookingEngine) bunu kullanır. Repository public-safe kolon
   projeksiyonu döndürür → resend_api_key (ve mail_from*) browser
   response'una ASLA düşmez. Return tipi `Settings` (resend_api_key
   alanı undefined gelir; tüm public alanlar mevcut). Davranış
   getSettings ile aynı (maybeSingle, hata → null). */
export async function getPublicSettings(): Promise<Settings | null> {
  /* 🛡️ PHASE (migration 041/042): SECURITY DEFINER RPC `get_public_settings`.
     ESKİ: anon table-select (findPublicSingleton). 042 admin-only RLS sonrası
     anon table-select reddedilir → null → public site boşalırdı.
     YENİ: RPC (definer) güvenli kolon projeksiyonunu döndürür; resend_api_key
     ÇIKTIDA YOK. anon/server/authenticated her bağlamda + RLS sonrası çalışır.
     Return jsonb → Settings (safe subset). */
  const { data, error } = await settingsRepository.findPublicViaRpc();

  if (error) {
    console.error("[settings.getPublic] FAILED", error.message);
    return null;
  }

  return (data as Settings) || null;
}

/* ===============================================================
   🛡️ SAFE updateSettings — explicit boolean contract
   ===============================================================
   Return contract netleştirildi:
     - true  → update başarılı (DB'ye yazıldı)
     - false → settings tablosu boş veya supabase error
   Önceden `data` döndürüyordu; ancak Supabase `.update().eq()`
   `.select()` zinciri olmadan başarılı durumda da `data: null`
   döner. Bu, çağıran tarafta "null ⇒ fail" yanılgısına yol
   açabiliyordu. Boolean contract bu belirsizliği kaldırır.

   Davranış:
     - getSettings() row yoksa → false
     - supabase update error → false
     - row var ve update başarılı → true
   Yeni satır oluşturulmuyor (insert YOK); başlangıç row'unun
   var olduğu varsayımı önceki davranışla aynı.

   Çağıran taraflar:
     - handleSave: boolean check (true/false)
     - handleWatermarkSelect / handleLogoSelect: return değerini
       kullanmıyor (await fire-and-forget) → davranış AYNEN.
   =============================================================== */
export async function updateSettings(
  values: Partial<Settings>
): Promise<boolean> {
  const current = await getSettings();

  if (!current?.id) {
    console.error("[settings.update] NO_ROW — settings tablosu boş");
    return false;
  }

  /* FAZ 40: settingsRepository.updateById delege; predicate aynen. */
  const { error } = await settingsRepository.updateById(
    current.id,
    values
  );

  if (error) {
    console.error("[settings.update] FAILED", error.message);
    return false;
  }

  return true;
}
