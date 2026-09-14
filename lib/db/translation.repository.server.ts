import "server-only";

import { dbNative as db } from "./native";
import type { Locale } from "@/lib/i18n/config";
import {
  TRANSLATION_ENTITY_CONFIG,
  type TranslationEntity,
  type TranslationRowFor,
} from "@/lib/i18n/translations.types";

/* ===============================================================
   🛡️ TRANSLATION REPOSITORY — PHASE 3 (Database Translation Architecture)
   ===============================================================
   migration 082'deki 9 çeviri tablosu için TEK, generic repository.
   Proje konvansiyonu her tablo için ayrı bir dosya (villa-location.
   repository.server.ts, villa-type.repository.ts, vb.) olsa da, bu 9
   tablo YAPISAL OLARAK BİREBİR aynı (parent_id + locale + çevrilebilir
   alanlar) — 9 ayrı dosya sırf symmetry için gereksiz tekrar olurdu.
   Bunun yerine TRANSLATION_ENTITY_CONFIG registry'sinden (lib/i18n/
   translations.types.ts) beslenen, tip-güvenli TEK bir modül.

   `dbNative.from(table)` zaten her repository'nin kullandığı AYNI
   generic query builder (lib/db/native.ts) — burada da string tablo
   adı yalnız bu dosyanın kendi sabit registry'sinden gelir (kullanıcı
   girdisi asla `table`/`parentIdColumn` olarak geçilmez).

   ⚠️ BU FAZDA HİÇBİR CALL-SITE BU REPOSITORY'Yİ KULLANMIYOR. Mevcut
   villa/location/type/feature/rule/price-include/distance/page/faq
   repository'lerinin davranışı, public render'ı ve cache'i bu dosyadan
   HİÇ ETKİLENMEZ — yalnız gelecek fazlar (admin çeviri UI, public
   fallback rendering) için hazır bir temel.
   =============================================================== */

export const translationRepository = {
  /** Bir parent kaydın TEK bir locale'deki çevirisi (varsa). */
  async findOne<E extends TranslationEntity>(
    entity: E,
    parentId: string,
    locale: Locale
  ) {
    const { table, parentIdColumn } = TRANSLATION_ENTITY_CONFIG[entity];
    return db
      .from<TranslationRowFor<E>>(table)
      .select("*")
      .eq(parentIdColumn, parentId)
      .eq("locale", locale)
      .maybeSingle();
  },

  /** Bir parent kaydın TÜM locale çevirileri (varsa — 0..3 satır). */
  async findAllForParent<E extends TranslationEntity>(
    entity: E,
    parentId: string
  ) {
    const { table, parentIdColumn } = TRANSLATION_ENTITY_CONFIG[entity];
    return db
      .from<TranslationRowFor<E>>(table)
      .select("*")
      .eq(parentIdColumn, parentId);
  },
};
