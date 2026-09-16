import Header from "./Header";
import { getMenu } from "@/app/services/menu.service";
import { getPublicSettings } from "@/app/services/settings.service";
import { resolveAssetUrlVersioned } from "@/lib/storage.helpers";
/* 🛡️ PHASE 10H — `source_type: "category"` menü öğeleri villa tipi
   adını gösterir; EN/DE karşılıkları migration 082'deki
   `villa_type_translations`'tan okunur. Locale'den BAĞIMSIZ okunur,
   seçim client tarafta (`Header.tsx`, `usePathname()` locale'i) yapılır
   — bu wrapper `headers()`/`cookies()` KULLANMAMAYA devam eder.
   `getMenu()` / `lib/menu-resolver.ts` DEĞİŞTİRİLMEDİ: çeviri burada,
   çözülmüş ağaca `source_id` üzerinden eklenir. */
import { isMultilingualEnabled } from "@/lib/i18n/config";
import { getVillaTypeNamesByLocale } from "@/lib/i18n/get-villa-type-translations.server";
import type { TaxonomyNameByLocale } from "@/lib/i18n/taxonomy-name.helper";

/** `getMenu()` ağacının bu dosyada ihtiyaç duyulan minimum şekli. */
type MenuNodeLike = {
  source_type?: string;
  source_id?: string | null;
  children?: MenuNodeLike[];
  nameByLocale?: TaxonomyNameByLocale;
};

/** Ağaçtaki tüm `category` öğelerinin `source_id`'lerini toplar. */
function collectCategoryIds(nodes: MenuNodeLike[], out: string[]): void {
  for (const n of nodes) {
    if (n?.source_type === "category" && typeof n.source_id === "string") {
      out.push(n.source_id);
    }
    if (Array.isArray(n?.children) && n.children.length > 0) {
      collectCategoryIds(n.children, out);
    }
  }
}

/** Çeviri haritasını ağaca uygular (yeni node'lar döner, mutasyon YOK). */
function attachTypeNames<T extends MenuNodeLike>(
  nodes: T[],
  namesById: Record<string, TaxonomyNameByLocale>
): T[] {
  return nodes.map((n) => {
    const children = Array.isArray(n?.children)
      ? attachTypeNames(n.children, namesById)
      : n?.children;
    const nameByLocale =
      n?.source_type === "category" && typeof n.source_id === "string"
        ? namesById[n.source_id]
        : undefined;
    if (!nameByLocale && children === n?.children) return n;
    return {
      ...n,
      ...(children === n?.children ? {} : { children }),
      ...(nameByLocale ? { nameByLocale } : {}),
    };
  });
}

export default async function HeaderWrapper() {
  /* ===============================================================
     🔥 SITE LOGO
     ===============================================================
     settings.site_logo varsa header'a aktarılır.
     Boş ise Header default text wordmark fallback gösterir.
     🛡️ Aşama A — resolveAssetUrl: FULL URL (legacy) pass-through;
        relative path (yeni) runtime'da getPublicUrl ile URL'e çevrilir.
     =============================================================== */
  let siteLogo: string | null = null;
  /* 🛡️ PHASE 10H — `multilingual_enabled` kapalıyken /en ve /de zaten
     404 (requirePublicLocaleEnabled) → çeviri okumak GEREKSİZ sorgu
     olur; bu bayrak o durumda okumayı tamamen atlatır. */
  let multilingualEnabled = false;
  try {
    const settings = await getPublicSettings();
    siteLogo =
      resolveAssetUrlVersioned(settings?.site_logo, settings?.updated_at) ||
      null;
    multilingualEnabled = isMultilingualEnabled(settings);
  } catch {
    siteLogo = null;
  }

  /* 🔥 güvenlik: menu okunamazsa boş array (ÖNCEKİ fallback davranışı).
     ⚠️ JSX try/catch DIŞINDA kurulur: React JSX'i anında render etmediği
     için try/catch render hatalarını ZATEN yakalamaz (bkz.
     react-hooks/error-boundaries). Veri hazırlığı try/catch içinde,
     tek `return` dışarıda — davranış BİREBİR aynı, lint uyarısı yok. */
  let menuItems: Awaited<ReturnType<typeof getMenu>> = [];
  try {
    menuItems = (await getMenu()) || [];

    /* 🛡️ PHASE 10H — villa tipi adlarının EN/DE karşılıkları. Okuma fail
       olursa header ÇÖKMEZ: harita boş kalır → canonical TR adı gösterilir
       (mevcut davranış). */
    if (multilingualEnabled && menuItems.length > 0) {
      const categoryIds: string[] = [];
      collectCategoryIds(menuItems as MenuNodeLike[], categoryIds);
      if (categoryIds.length > 0) {
        const namesById = await getVillaTypeNamesByLocale(categoryIds).catch(
          () => ({})
        );
        if (Object.keys(namesById).length > 0) {
          menuItems = attachTypeNames(menuItems, namesById);
        }
      }
    }
  } catch (err) {
    console.error("❌ HeaderWrapper menu error:", err);
    menuItems = [];
  }

  return <Header menu={menuItems} siteLogo={siteLogo} />;
}
