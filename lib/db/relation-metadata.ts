/* ===============================================================
   🛡️ STATİK İLİŞKİ METADATA KATMANI (project-scoped)
   ===============================================================
   AMAÇ:
     Repository'lerin embed-select string'lerinde kullandığı SONLU
     ilişki kümesini AÇIKÇA, EL İLE tanımlar. Native provider (pgQuery)
     JOIN sorgularını YALNIZ bu metadata'yı okuyarak üretir.

   ⚠️ NE DEĞİLDİR (bilinçli):
     - ORM DEĞİL.
     - Genel amaçlı ilişki çözücü / resource-embedding motoru DEĞİL.
     - Otomatik FK keşfi / reflection / schema taraması YOK.
     Yalnız bu projenin BUGÜN kullandığı ilişkiler burada tanımlıdır.
     Yeni bir embed gerekiyorsa BURAYA açıkça eklenir (niyetli + review'lı).

   ⚠️ REPOSITORY DOKUNULMAZ:
     Repo'lar select string'lerini aynen tutar. "İlişki nasıl çözülür"
     bilgisi buraya (DB katmanı) taşınır — repo'ya değil.

   ⚠️ SAF MODÜL:
     `pg` import etmez; runtime bağımlılığı yoktur → client/server her
     bağlamda güvenli, TSC/ESLint temiz. Provider bunu tüketir.

   KAPSAM (embed-select kullanan 6 repo'nun tükettiği ilişkiler):
     villa               → location (1) / villa_images (N) / villa_prices (N)
     reservations        → villa (1)
     discount_collections→ villa (1)   [villa iç içe: location/images/prices]
     homepage_collections→ villa (1)   [villa iç içe]
     villa_reviews       → villa (1)   [villa iç içe: location/images]
   =============================================================== */

/** İlişki kardinalitesi: tekil nesne mi, dizi mi. */
export type RelationCardinality = "one" | "many";

/** Tek bir yönlü ilişkinin statik tanımı (parent → target). */
export interface RelationDef {
  /** Embed alias'ı — repo select string'inde geçen ad
   *  (ör. "location", "villa_images", "villa"). */
  readonly alias: string;
  /** Hedef fiziksel tablo adı. */
  readonly table: string;
  /** one → tekil JSON obje; many → json_agg dizi. */
  readonly cardinality: RelationCardinality;
  /** JOIN koşulu — PARENT tablodaki kolon. */
  readonly localKey: string;
  /** JOIN koşulu — TARGET tablodaki kolon. */
  readonly foreignKey: string;
  /** `many` için embed içi varsayılan sıralama (opsiyonel). */
  readonly orderBy?: ReadonlyArray<{
    readonly column: string;
    readonly direction: "asc" | "desc";
  }>;
}

/* ---------------------------------------------------------------
   İLİŞKİ KAYDI — parent tablo → sonlu, el ile tanımlı ilişki listesi.
   Buradaki DIŞINDA hiçbir ilişki tanımlı DEĞİLDİR (bilerek).
   --------------------------------------------------------------- */
export const RELATION_METADATA: Readonly<Record<string, ReadonlyArray<RelationDef>>> = {
  /* villa: kart/detay embed'lerinin çekirdeği; discount/homepage/review
     içinde İÇ İÇE de kullanılır (aşağıdaki parent'lar "villa" alias'ıyla
     bu tabloya bağlanır; nested çözüm yine bu kayda bakar). */
  villa: [
    {
      alias: "location",
      table: "villa_locations",
      cardinality: "one",
      localKey: "location_id",
      foreignKey: "id",
    },
    {
      alias: "villa_images",
      table: "villa_images",
      cardinality: "many",
      localKey: "id",
      foreignKey: "villa_id",
      /* is_cover öncelikli + sort_order tie-break (mevcut embed davranışı). */
      orderBy: [
        { column: "is_cover", direction: "desc" },
        { column: "sort_order", direction: "asc" },
      ],
    },
    {
      alias: "villa_prices",
      table: "villa_prices",
      cardinality: "many",
      localKey: "id",
      foreignKey: "villa_id",
    },
  ],

  /* reservations → villa (operations + reservation detay embed'i). */
  reservations: [
    {
      alias: "villa",
      table: "villa",
      cardinality: "one",
      localKey: "villa_id",
      foreignKey: "id",
    },
  ],

  /* discount_collections → villa (kart; villa iç içe location/images/prices). */
  discount_collections: [
    {
      alias: "villa",
      table: "villa",
      cardinality: "one",
      localKey: "villa_id",
      foreignKey: "id",
    },
  ],

  /* homepage_collections → villa (kart; villa iç içe). */
  homepage_collections: [
    {
      alias: "villa",
      table: "villa",
      cardinality: "one",
      localKey: "villa_id",
      foreignKey: "id",
    },
  ],

  /* villa_reviews → villa (public/admin liste; villa iç içe location/images). */
  villa_reviews: [
    {
      alias: "villa",
      table: "villa",
      cardinality: "one",
      localKey: "villa_id",
      foreignKey: "id",
    },
  ],

  /* external_calendar_events → villa (admin liste: villa:villa_id(...)). */
  external_calendar_events: [
    {
      alias: "villa",
      table: "villa",
      cardinality: "one",
      localKey: "villa_id",
      foreignKey: "id",
    },
  ],

  /* external_calendar_sources → villa (admin liste: villa:villa_id(...)). */
  external_calendar_sources: [
    {
      alias: "villa",
      table: "villa",
      cardinality: "one",
      localKey: "villa_id",
      foreignKey: "id",
    },
  ],

  /* manual_reservations → villa (liste: villa:villa_id(title)). */
  manual_reservations: [
    {
      alias: "villa",
      table: "villa",
      cardinality: "one",
      localKey: "villa_id",
      foreignKey: "id",
    },
  ],
};

/* ---------------------------------------------------------------
   SAF LOOKUP HELPER'LARI (runtime sihir yok — düz map erişimi).
   --------------------------------------------------------------- */

/** Parent tablonun tanımlı ilişkileri (yoksa boş dizi). */
export function getRelationsFor(
  parentTable: string
): ReadonlyArray<RelationDef> {
  return RELATION_METADATA[parentTable] ?? [];
}

/** Parent tablo + alias → ilişki tanımı (yoksa undefined). */
export function getRelation(
  parentTable: string,
  alias: string
): RelationDef | undefined {
  return getRelationsFor(parentTable).find((r) => r.alias === alias);
}

/** Bu tablo için tanımlı embed ilişkisi var mı? */
export function hasRelations(parentTable: string): boolean {
  return getRelationsFor(parentTable).length > 0;
}
