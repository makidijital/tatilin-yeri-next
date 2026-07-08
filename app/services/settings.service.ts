import { settingsRepository } from "@/lib/db/settings.repository";

/* ===============================================================
   🔥 SETTINGS — global site ayarları
   =============================================================== */

export type WatermarkPosition =
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type Settings = {
  id?: string;

  site_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;

  prepayment_rate?: number | null;

  // 🔥 SITE LOGO (Storage public URL)
  site_logo?: string | null;

  /* 🔥 FOOTER LOGO (mig 048) — footer'a özel negatif/beyaz logo.
     NULL → footer site_logo'ya fallback eder. */
  footer_logo?: string | null;

  // 🔥 WATERMARK
  watermark_logo?: string | null;
  watermark_enabled?: boolean | null;
  watermark_opacity?: number | null; // 0.05 - 1
  watermark_position?: WatermarkPosition | null;
  watermark_size?: number | null; // % (10 - 50)

  // 🔥 MAIL (Resend)
  resend_api_key?: string | null;
  mail_from?: string | null; // örn: rezervasyon@domain.com
  mail_from_name?: string | null; // örn: MAKI DIGITAL

  /* 🔥 HOMEPAGE HERO — content yönetimi.
     Tümü nullable; eksik alan hardcoded default'a fallback eder
     (lib/hero.helpers.ts > resolveHeroContent).
     hero_enabled === false → tüm hero defaults'a düşer (safety reset).
     Image Supabase Storage public URL (bucket: site-assets, path: hero/...). */
  hero_enabled?: boolean | null;
  hero_title?: string | null;
  hero_subtitle?: string | null;
  hero_background_image?: string | null;
  hero_overlay_opacity?: number | null; // 0..1
  hero_primary_cta_text?: string | null;
  hero_primary_cta_href?: string | null;
  hero_secondary_cta_text?: string | null;
  hero_secondary_cta_href?: string | null;
  hero_badge_text?: string | null;

  /* 🛡️ PAGE HERO ARKA PLAN (mig 067) — tüm public iç sayfaların PageHero
     bandında kullanılan tek ortak arka plan görseli (site-assets relative
     path). Güçlü beyaz/sand overlay + blur + gradient altında DOKU olarak
     kullanılır. NULL → görsel yok. get_public_settings() whitelist'inde. */
  page_hero_background_image?: string | null;

  /* ===============================================================
     🛡️ EXTENDED SETTINGS (migration applied — kolonlar DB'de mevcut)
     ===============================================================
     /settings sub-route'larındaki modüler form'lar bu alanları
     yönetir. Hepsi nullable — boş ise public site fallback'e düşer
     (footer/hero/SEO hardcoded defaults). Schema'da kolon zaten var,
     burada sadece TS tipi genişletilir. */

  // İletişim ek
  /** Çalışma saatleri — public iletişim sayfasında gösterilir.
   *  Multi-line text desteği (textarea). Boşsa "Çalışma Saatleri"
   *  satırı render edilmez. */
  business_hours?: string | null;

  // Sosyal medya
  instagram?: string | null;
  facebook?: string | null;
  youtube?: string | null;
  tiktok?: string | null;
  whatsapp_link?: string | null;

  // SEO defaults
  default_meta_title?: string | null;
  default_meta_description?: string | null;
  default_og_image?: string | null;
  robots_index?: boolean | null;
  robots_follow?: boolean | null;
  google_site_verification?: string | null;
  yandex_verification?: string | null;
  bing_verification?: string | null;

  // Genel — branding ek
  favicon_url?: string | null;
  browser_theme_color?: string | null;
  footer_copyright?: string | null;
  company_legal_name?: string | null;

  // Gelişmiş — entegrasyon + maintenance
  custom_head_scripts?: string | null;
  analytics_script?: string | null;
  gtm_container_id?: string | null;
  maintenance_mode?: boolean | null;
  maintenance_message?: string | null;

  /* 🛡️ Migration 051 — auto-touch timestamp (BEFORE UPDATE trigger).
     Anasayfa Hero görsel cache-bust kaynağı; admin save sonrası değişir →
     page.tsx heroCacheKey değişir → withCacheBust yeni `?ts=` üretir →
     browser / Supabase Storage CDN / Next/Image optimizer cache hepsi
     cache-miss eder. get_public_settings() RPC whitelist'inde (mig 051). */
  updated_at?: string | null;
};

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
