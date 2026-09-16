import Footer from "./Footer";

import { getPublicSettings } from "@/app/services/settings.service";
import type { Settings } from "@/app/services/settings.types";
import { menuRepository } from "@/lib/db/menu.repository";
import { pagesRepository } from "@/lib/db/pages.repository";

/* ---------------- DYNAMIC TAXONOMY ITEMS ---------------- */

export type TaxonomyItem = { id: string; name: string; slug: string | null };

/* ---------------- KURUMSAL — CMS-DRIVEN ----------------
   Veri kaynağı: `pagesRepository.findActivePages()` (slim).
   Header (`getMenu()`) ile AYRI kanal:
     • Header  : is_active=true VE show_in_menu=true (mevcut)
     • Footer  : is_active=true (show_in_menu YOK)
   Admin "Menüde Göster" sadece header navigation'ı kontrol eder.
   Yayında olan her sayfa otomatik footer Kurumsal'da görünür.
   Sıralama: menu_order ASC nulls-last, sonra created_at ASC.
---------------------------------------------------------- */
export type CorporatePage = {
  id: string;
  title: string;
  slug: string;
  menu_order?: number | null;
  created_at?: string | null;
};

/* ===================================================================
   🛡️ PHASE 9B — FOOTER SERVER DATA WRAPPER
   ===================================================================
   HeaderWrapper.tsx (async server) → Header.tsx (client) deseninin
   BİREBİR aynısı. Footer'ın DB/service veri-çekme mantığı (Phase 8'e
   kadar Footer.tsx içinde yaşıyordu) buraya, davranışı DEĞİŞTİRİLMEDEN
   taşındı: aynı Promise.allSettled sırası, aynı filtreleme/sıralama,
   aynı fallback'ler (bir fetch reject olursa diğerleri etkilenmez).

   Bu dosya `headers()`/`cookies()` KULLANMAZ — dolayısıyla bu wrapper'ın
   eklenmesi, `(public)/layout.tsx`'in statik/ISR rendering uygunluğunu
   HİÇ etkilemez (Phase 9 audit'inde doğrulanan risk, bu tasarımla
   tamamen ortadan kalkıyor). Locale tespiti artık `Footer.tsx` (client)
   içinde, Header'daki gibi `usePathname()` ile yapılıyor — bu wrapper
   locale'den tamamen bağımsız, saf veri katmanı.
=================================================================== */
export default async function FooterWrapper() {
  /* Dört paralel fetch — biri fail olursa diğeri etkilenmez.
     Promise.allSettled tüm sonuçları döner; reject olanlar null. */
  const [settingsRes, locsRes, typesRes, corpPagesRes] =
    await Promise.allSettled([
      getPublicSettings(),
      menuRepository.findAllVillaLocations(),
      menuRepository.findAllVillaTypes(),
      /* Footer'a özel slim helper — `findActivePages` (show_in_menu
         filtresi YOK). Header'ın `findActivePagesForMenu` helper'ı
         DOKUNULMADI; iki kanal birbirinden bağımsız. */
      pagesRepository.findActivePages(),
    ]);

  const settings: Settings | null =
    settingsRes.status === "fulfilled" ? settingsRes.value : null;

  const locations: TaxonomyItem[] =
    locsRes.status === "fulfilled" && Array.isArray(locsRes.value?.data)
      ? (locsRes.value.data as TaxonomyItem[])
          .filter((l) => l?.name)
          .slice(0, 7)
      : [];

  const villaTypes: TaxonomyItem[] =
    typesRes.status === "fulfilled" && Array.isArray(typesRes.value?.data)
      ? (typesRes.value.data as TaxonomyItem[])
          .filter((t) => t?.name)
          .slice(0, 7)
      : [];

  /* Kurumsal CMS pages — filter + sort.
     Repo `is_active=true` filtreli; show_in_menu KASTEN filtrelenmez
     (footer header'dan ayrı kanal). slug + title sanity check.
     Sıralama: menu_order ASC nulls-last, sonra created_at ASC
     (deterministic tie-break). */
  const corporatePages: CorporatePage[] =
    corpPagesRes.status === "fulfilled" &&
    Array.isArray(corpPagesRes.value?.data)
      ? (corpPagesRes.value.data as CorporatePage[])
          .filter(
            (p) =>
              typeof p?.slug === "string" &&
              p.slug.trim().length > 0 &&
              typeof p?.title === "string" &&
              p.title.trim().length > 0
          )
          .sort((a, b) => {
            const ao =
              typeof a.menu_order === "number"
                ? a.menu_order
                : Number.MAX_SAFE_INTEGER;
            const bo =
              typeof b.menu_order === "number"
                ? b.menu_order
                : Number.MAX_SAFE_INTEGER;
            if (ao !== bo) return ao - bo;
            const ac = a.created_at || "";
            const bc = b.created_at || "";
            return ac.localeCompare(bc);
          })
      : [];

  const year = new Date().getFullYear();
  const siteName = settings?.site_name || "VillayaGel";
  const phoneDigits = settings?.phone?.replace(/[^\d]/g, "") || "";

  return (
    <Footer
      settings={settings}
      locations={locations}
      villaTypes={villaTypes}
      corporatePages={corporatePages}
      year={year}
      siteName={siteName}
      phoneDigits={phoneDigits}
    />
  );
}
