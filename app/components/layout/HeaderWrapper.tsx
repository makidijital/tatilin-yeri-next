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
/* 🛡️ MIGRATION 086 — dinamik menü etiketlerinin EN/DE karşılıkları
   (`menu_translations`). Villa tipi çevirisiyle AYNI batch deseni:
   locale başına TEK `.in()` sorgusu, N+1 YOK. */
import { getMenuNamesByLocale } from "@/lib/i18n/get-menu-translations.server";
import type { TaxonomyNameByLocale } from "@/lib/i18n/taxonomy-name.helper";

/** `getMenu()` ağacının bu dosyada ihtiyaç duyulan minimum şekli. */
type MenuNodeLike = {
  /** 🛡️ MIGRATION 086 — `menu_translations` lookup anahtarı. */
  id?: string;
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

/* 🛡️ MIGRATION 086 — ağaçtaki TÜM düğümlerin kendi `id`'leri.
   `menu` tablosundan gelen satırlarda bu `menu.id`'dir; legacy
   auto-include sayfalarda `pages.id`'dir — ikincisi için
   `menu_translations`'ta kayıt BULUNMAZ (FK menu(id)) ve harita
   doğal olarak boş kalır, davranış değişmez. */
function collectNodeIds(nodes: MenuNodeLike[], out: string[]): void {
  for (const n of nodes) {
    if (typeof n?.id === "string" && n.id.length > 0) out.push(n.id);
    if (Array.isArray(n?.children) && n.children.length > 0) {
      collectNodeIds(n.children, out);
    }
  }
}

/** Çeviri haritalarını ağaca uygular (yeni node'lar döner, mutasyon YOK).
 *
 *  🛡️ MIGRATION 086 — İKİ KAYNAK, NET ÖNCELİK (locale bazında):
 *    1. `menuNamesById[node.id]`  → admin'in `/maki-admin/menu`'de o
 *       menü satırı için ELLE girdiği etiket (EN/DE). KAZANIR.
 *    2. `typeNamesById[source_id]` → villa tipi adının çevirisi
 *       (Phase 10H, `villa_type_translations`). Menü çevirisi yoksa
 *       devreye girer — MEVCUT DAVRANIŞ BİREBİR KORUNUR.
 *  Hiçbiri yoksa `nameByLocale` undefined kalır → canonical TR `name`
 *  (`resolveTaxonomyName` fallback'i). */
function attachTypeNames<T extends MenuNodeLike>(
  nodes: T[],
  namesById: Record<string, TaxonomyNameByLocale>,
  menuNamesById: Record<string, TaxonomyNameByLocale> = {}
): T[] {
  return nodes.map((n) => {
    const children = Array.isArray(n?.children)
      ? attachTypeNames(n.children, namesById, menuNamesById)
      : n?.children;

    const typeName =
      n?.source_type === "category" && typeof n.source_id === "string"
        ? namesById[n.source_id]
        : undefined;
    const menuName =
      typeof n?.id === "string" ? menuNamesById[n.id] : undefined;

    /* Locale bazında merge — menü çevirisi üstte. Yalnız DOLU
       (boş/whitespace olmayan) değerler haritalara girdiği için
       (bkz. get-*-translations.server.ts) ek bir trim gerekmez. */
    const merged: TaxonomyNameByLocale | undefined =
      typeName || menuName ? { ...typeName, ...menuName } : undefined;
    const nameByLocale =
      merged && Object.keys(merged).length > 0 ? merged : undefined;

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
      /* 🛡️ MIGRATION 086 — menü satırlarının kendi id'leri. */
      const nodeIds: string[] = [];
      collectNodeIds(menuItems as MenuNodeLike[], nodeIds);

      /* İki batch okuma PARALEL; her biri locale başına TEK `.in()`
         sorgusu (N+1 YOK). Boş id listesinde sorgu HİÇ atılmaz.
         Okuma fail olursa header ÇÖKMEZ: harita boş kalır → canonical
         TR adı gösterilir (mevcut davranış). */
      const [namesById, menuNamesById] = await Promise.all([
        categoryIds.length > 0
          ? getVillaTypeNamesByLocale(categoryIds).catch(() => ({}))
          : Promise.resolve({}),
        nodeIds.length > 0
          ? getMenuNamesByLocale(nodeIds).catch(() => ({}))
          : Promise.resolve({}),
      ]);

      if (
        Object.keys(namesById).length > 0 ||
        Object.keys(menuNamesById).length > 0
      ) {
        menuItems = attachTypeNames(menuItems, namesById, menuNamesById);
      }
    }
  } catch (err) {
    console.error("❌ HeaderWrapper menu error:", err);
    menuItems = [];
  }

  return <Header menu={menuItems} siteLogo={siteLogo} />;
}
