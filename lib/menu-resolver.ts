/* ===============================================================
   🛡️ MENU SOURCE RESOLVER — SINGLE SOURCE-OF-TRUTH
   ===============================================================
   `menu.source_type` (db/migrations/005) ile birlikte menu item
   kayıtları artık 4 farklı navigation source'a referans olabilir:

     manual   → menu.name, menu.href                  (canonical)
     page     → pages.title, /p/{pages.slug}          (source_id = pages.id)
     category → villa_types.name, /arama?categories=… (source_id = villa_types.id)
     region   → villa_locations.name, /arama?regions=… (source_id = villa_locations.id)

   Bu helper hem frontend (`menu.service.ts > getMenu()`) hem admin
   (`/maki-admin/menu/page.tsx`) tarafında reuse edilir. Tek mantık,
   iki context.

   ORPHAN HANDLING:
     Non-manual menu satırının source kaydı bulunmazsa (silinmiş /
     pasif), `resolveMenuRow` `null` döner → caller bu satırı
     tree'den çıkarır. Manual satırlar (en alt seviye fallback)
     hiçbir zaman null dönmez.

   URL CONTRACT:
     Category/Region için üretilen URL'ler `/arama` filter sistemiyle
     birebir uyumlu (categories / regions query params). Filtering
     logic'i, availability helper'ı, EXCLUDE constraint — hepsi
     dokunulmadan reuse edilir.
   =============================================================== */

/* 🛡️ TYPE SOURCE:
   MenuSourceType DB enum'undan; MenuRow ise resolver'ın çağıran
   taraftan beklediği MINIMAL shape (DB row değil — admin menu page
   örneğinde admin yalnız bir subset alanla resolver'ı çağırıyor).
   `is_active` / `created_at` gibi DB-only alanlar burada YOK çünkü
   resolver onları kullanmıyor.
=============================================================== */
export type { MenuSourceType } from "@/types/database";
import type { MenuSourceType } from "@/types/database";

/** Resolver'ın beklediği minimum field set. */
export type MenuRow = {
  id: string;
  name: string | null;
  href: string | null;
  order: number | null;
  parent_id: string | null;
  source_type: MenuSourceType | string | null;
  source_id: string | null;
};

/** Çözümlenmiş menu item — UI render için hazır. */
export type ResolvedMenuItem = {
  id: string;
  name: string;
  href: string;
  order: number;
  parent_id: string | null;
  source_type: MenuSourceType;
  source_id: string | null;
};

/** Lookup map'leri — toplu fetch sonrası bellekte tutulur, O(1) erişim. */
export type MenuSourceMaps = {
  pages: Map<string, { title: string; slug: string }>;
  /** types.slug: villa_types.slug (migration 008). NULL ise category
   *  href UUID fallback'ine düşer. */
  types: Map<string, { name: string; slug: string | null }>;
  /** locations.slug: villa_locations.slug (migration 009). NULL ise
   *  region href UUID fallback'ine düşer. */
  locations: Map<string, { name: string; slug: string | null }>;
};

/**
 * Tek bir menu satırını source'una göre resolve eder.
 * Orphan ise null döner (caller tree'den çıkarır).
 */
export function resolveMenuRow(
  row: MenuRow,
  maps: MenuSourceMaps
): ResolvedMenuItem | null {
  const sourceType: MenuSourceType =
    row.source_type === "page" ||
    row.source_type === "category" ||
    row.source_type === "region"
      ? row.source_type
      : "manual"; // backward-compat default

  const order = row.order ?? 999;
  const parent_id = row.parent_id ?? null;

  switch (sourceType) {
    case "manual": {
      /* Manual satırlar canonical: name/href direkt menu tablosunda.
         Boş ise yine de göster — admin temizleyebilsin. */
      return {
        id: row.id,
        name: row.name ?? "",
        href: row.href ?? "#",
        order,
        parent_id,
        source_type: "manual",
        source_id: null,
      };
    }

    case "page": {
      if (!row.source_id) return null;
      const p = maps.pages.get(row.source_id);
      if (!p) return null; // orphan → gizle
      return {
        id: row.id,
        name: p.title,
        href: `/p/${p.slug}`,
        order,
        parent_id,
        source_type: "page",
        source_id: row.source_id,
      };
    }

    case "category": {
      if (!row.source_id) return null;
      const t = maps.types.get(row.source_id);
      if (!t) return null;
      /* 🛡️ SEO-friendly URL: slug varsa onu yaz, yoksa UUID fallback.
         Canonical param: `villa-turleri` (TR). /arama page'i hem yeni
         `villa-turleri` hem eski `categories` paramını accept eder. */
      const token = (t.slug && t.slug.trim()) || row.source_id;
      return {
        id: row.id,
        name: t.name,
        href: `/arama?villa-turleri=${encodeURIComponent(token)}`,
        order,
        parent_id,
        source_type: "category",
        source_id: row.source_id,
      };
    }

    case "region": {
      if (!row.source_id) return null;
      const l = maps.locations.get(row.source_id);
      if (!l) return null;
      /* 🛡️ SEO-friendly URL: slug varsa onu yaz, yoksa UUID fallback.
         Canonical param: `bolgeler` (TR). /arama page'i hem yeni
         `bolgeler` hem eski `regions` paramını accept eder. */
      const token = (l.slug && l.slug.trim()) || row.source_id;
      return {
        id: row.id,
        name: l.name,
        href: `/arama?bolgeler=${encodeURIComponent(token)}`,
        order,
        parent_id,
        source_type: "region",
        source_id: row.source_id,
      };
    }
  }
}

/** Convenience: row array'ini map'leyip null'ları filter eder. */
export function resolveMenuRows(
  rows: MenuRow[],
  maps: MenuSourceMaps
): ResolvedMenuItem[] {
  const out: ResolvedMenuItem[] = [];
  for (const r of rows) {
    const resolved = resolveMenuRow(r, maps);
    if (resolved) out.push(resolved);
  }
  return out;
}
