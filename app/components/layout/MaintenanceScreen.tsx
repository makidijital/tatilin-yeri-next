"use client";

import { usePathname } from "next/navigation";

import { localeFromPathname } from "@/lib/i18n/config";
import { resolveSettingsText } from "@/lib/i18n/settings-translation.helper";
import type { SettingsTranslationsByLocale } from "@/lib/i18n/settings-translations.types";

/* ===============================================================
   🛡️ MAINTENANCE SCREEN — PHASE 10L §8
   ===============================================================
   `app/(public)/layout.tsx`'in bakım modu ekranı. DOM, className'ler,
   metin sırası ve Türkçe fallback cümlesi ORADAN BİREBİR TAŞINDI —
   TEK fark `message`'ın locale'e göre çözülmesi.

   NEDEN AYRI (client) COMPONENT:
     `(public)/layout.tsx` bir server component ve request locale'ini
     güvenle okuyamaz (Phase 7E: RSC parent-önce-çocuk render sırası;
     sayfanın `setRequestLocale()` çağrısı layout gövdesinden SONRA
     çalışır — bkz. tests/unit/html-lang-layout.test.ts). Header.tsx
     (Phase 9A) ve Footer.tsx (Phase 9B) ile AYNI çözüm: locale
     `usePathname()` ile client tarafta bulunur.

   ⚠️ BU FAZDA ÇEVRİLMEYENLER (§8 gereği):
     • "Bakım" üst etiketi (hardcoded) — DOKUNULMADI
     • Türkçe varsayılan mesaj fallback'i — DOKUNULMADI
     • `brand` (site_name) — canonical, her dilde aynı
   =============================================================== */

export default function MaintenanceScreen({
  brand,
  canonicalMessage,
  translations,
}: {
  brand: string;
  /** `settings.maintenance_message` — TR canonical (ham, trim'siz). */
  canonicalMessage: string | null;
  /** migration 083 EN/DE çevirileri; yoksa TR canonical kullanılır. */
  translations: SettingsTranslationsByLocale | null;
}) {
  const locale = localeFromPathname(usePathname());

  /* TR'de `resolveSettingsText` canonical değeri AYNEN döndürür →
     aşağıdaki `?.trim() || "…"` zinciri ESKİSİYLE BİREBİR AYNI. */
  const message =
    resolveSettingsText(
      canonicalMessage,
      translations,
      locale,
      "maintenance_message"
    )?.trim() || "Sitemizi yeniliyoruz. Kısa süre içinde tekrar buradayız.";

  return (
    <div className="public-shell flex flex-col min-h-screen bg-[var(--color-ivory)]">
      <section className="flex-1 flex items-center justify-center px-5 md:px-10 py-24">
        <div className="max-w-xl text-center">
          <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
            <span className="inline-block w-8 h-px bg-[var(--color-stone-300)] align-middle mr-3" />
            Bakım
          </p>
          <h1 className="font-display text-[40px] md:text-[64px] text-[var(--color-stone-900)] mt-6 leading-[1.02] tracking-[-0.03em]">
            {brand}
          </h1>
          <p className="text-[var(--color-stone-500)] mt-6 leading-relaxed text-[15px] md:text-[16px]">
            {message}
          </p>
        </div>
      </section>
    </div>
  );
}
