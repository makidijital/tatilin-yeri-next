/* ===============================================================
   🛡️ TRANSLATION TYPES — PHASE 3 (Database Translation Architecture)
   ===============================================================
   migration 082'de oluşturulan 9 çeviri tablosunun TypeScript
   karşılıkları. `Locale` mevcut lib/i18n/config.ts'ten import
   edilir — burada yeniden tanımlanmaz (PHASE 1B ile tutarlılık).

   Bu dosya YALNIZ TİP + statik registry içerir; hiçbir DB çağrısı
   yapmaz, "server-only" GEREKTİRMEZ (client-safe). DB'ye dokunan
   generic repository ayrı bir dosyada: lib/db/translation.repository.server.ts.

   Bu fazda bu dosyayı/repository'yi HİÇBİR call-site KULLANMIYOR —
   yalnız gelecek fazlar (admin çeviri UI, public fallback rendering)
   için hazır, izole, test edilmiş bir temel.
   =============================================================== */

import type { Locale } from "./config";

/* ---------- Satır tipleri (migration 082 kolonlarıyla birebir) ---------- */

export type VillaTranslationRow = {
  id: string;
  villa_id: string;
  locale: Locale;
  title: string | null;
  description: string | null;
  badge: string | null;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
};

export type VillaLocationTranslationRow = {
  id: string;
  location_id: string;
  locale: Locale;
  name: string | null;
  created_at: string;
  updated_at: string;
};

export type VillaTypeTranslationRow = {
  id: string;
  type_id: string;
  locale: Locale;
  name: string | null;
  created_at: string;
  updated_at: string;
};

export type VillaFeatureTranslationRow = {
  id: string;
  feature_id: string;
  locale: Locale;
  name: string | null;
  created_at: string;
  updated_at: string;
};

/** ⚠️ Parent tablo `rule_items` (audit'teki "villa_rules" yanlıştı).
 *  Çevrilebilir kolon `title` (`name` DEĞİL). */
export type RuleItemTranslationRow = {
  id: string;
  rule_id: string;
  locale: Locale;
  title: string | null;
  created_at: string;
  updated_at: string;
};

/** ⚠️ Çevrilebilir kolon `title` (`name` DEĞİL). */
export type PriceIncludeItemTranslationRow = {
  id: string;
  include_id: string;
  locale: Locale;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type VillaDistanceTranslationRow = {
  id: string;
  distance_id: string;
  locale: Locale;
  title: string | null;
  distance: string | null;
  created_at: string;
  updated_at: string;
};

export type PageTranslationRow = {
  id: string;
  page_id: string;
  locale: Locale;
  title: string | null;
  body: string | null;
  excerpt: string | null;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
};

export type FaqTranslationRow = {
  id: string;
  faq_id: string;
  locale: Locale;
  question: string | null;
  answer: string | null;
  created_at: string;
  updated_at: string;
};

/* ---------- Entity registry (repository'nin de kullandığı tek kaynak) ---------- */

export type TranslationEntity =
  | "villa"
  | "villa_location"
  | "villa_type"
  | "villa_feature"
  | "rule_item"
  | "price_include_item"
  | "villa_distance"
  | "page"
  | "faq";

export type TranslationRowFor<E extends TranslationEntity> = E extends "villa"
  ? VillaTranslationRow
  : E extends "villa_location"
    ? VillaLocationTranslationRow
    : E extends "villa_type"
      ? VillaTypeTranslationRow
      : E extends "villa_feature"
        ? VillaFeatureTranslationRow
        : E extends "rule_item"
          ? RuleItemTranslationRow
          : E extends "price_include_item"
            ? PriceIncludeItemTranslationRow
            : E extends "villa_distance"
              ? VillaDistanceTranslationRow
              : E extends "page"
                ? PageTranslationRow
                : E extends "faq"
                  ? FaqTranslationRow
                  : never;

export type TranslationEntityConfig = {
  /** migration 082 tablo adı. */
  table: string;
  /** Parent FK kolon adı (migration 082 ile birebir — bkz. proje
   *  konvansiyonu: villa_type_relations.type_id, villa_rule_relations
   *  → rule_id, villa_price_include_relations.include_id, vb.). */
  parentIdColumn: string;
};

/** migration 082'deki 9 tablonun TEK doğruluk kaynağı — hem
 *  lib/db/translation.repository.server.ts hem testler buradan okur.
 *  Yeni bir çeviri tablosu eklenirse yalnız burası + migration
 *  güncellenir. */
export const TRANSLATION_ENTITY_CONFIG: Record<
  TranslationEntity,
  TranslationEntityConfig
> = {
  villa: { table: "villa_translations", parentIdColumn: "villa_id" },
  villa_location: {
    table: "villa_location_translations",
    parentIdColumn: "location_id",
  },
  villa_type: {
    table: "villa_type_translations",
    parentIdColumn: "type_id",
  },
  villa_feature: {
    table: "villa_feature_translations",
    parentIdColumn: "feature_id",
  },
  rule_item: {
    table: "rule_item_translations",
    parentIdColumn: "rule_id",
  },
  price_include_item: {
    table: "price_include_item_translations",
    parentIdColumn: "include_id",
  },
  villa_distance: {
    table: "villa_distance_translations",
    parentIdColumn: "distance_id",
  },
  page: { table: "page_translations", parentIdColumn: "page_id" },
  faq: { table: "faq_translations", parentIdColumn: "faq_id" },
};
