import "server-only";

import { cache } from "react";

import { getTranslation, resolveTranslatedField } from "@/lib/i18n/get-translation.server";
import type { Locale } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ VILLA TITLE TRANSLATION OVERLAY — PHASE 6B
   ===============================================================
   AMAÇ: Phase 5'in generic `getTranslation()`'ının üzerine, YALNIZ
   villa `title` alanı için ince, villa'ya özgü bir okuma katmanı.
   Description/badge/seo_title/seo_description bu fazın KAPSAMI
   DIŞINDA — bilerek eklenmedi ("SADECE TITLE").

   DOKUNULMAYANLAR (bilinçli):
     - `app/services/villa.service.ts` / `mapVilla` — HİÇ import
       edilmiyor, HİÇ çağrılmıyor. Bu dosya `VillaDTO`'yu üretmez,
       yalnız (villaId, orijinal title, locale) alıp NİHAİ gösterilecek
       title string'ini döner. Villa'nın kendisi ÇAĞIRAN TARAFTA
       (EN/DE page.tsx) zaten mevcut `getVillaBySlug` ile okunur.
     - `lib/cache.helpers.ts` / `unstable_cache` — YOK. Bu dosya
       Next.js Data Cache'e HİÇ dokunmuyor (Phase 6A audit'inin
       Bölüm 5 bulgusu: unstable_cache'li fonksiyonlara locale
       eklemek çapraz-dil cache sızıntısı riski taşıyor — bu yüzden
       KAÇINILDI).
     - `getVillaBySlugCached` (kiralik-villa/[slug]/page.tsx'e ÖZEL,
       export edilmiyor) — bu dosyadan hiç erişilmiyor/değiştirilmiyor.

   MEKANİZMA — React `cache()` (request-scoped dedupe):
     Projenin zaten kullandığı AYNI primitive (bkz.
     `getVillaBySlugCached = cache((slug) => getVillaBySlug(slug))`,
     kiralik-villa/[slug]/page.tsx:154; ayrıca Phase 4B'nin
     `request-locale.server.ts`'i). Yalnız ASIL DB okuyan adım
     (`getTranslation` çağrısı) `cache()` ile sarılır — `resolveTranslatedField`
     saf/senkron olduğu için sarmaya gerek yok. Bu, aynı (villaId, locale)
     ikilisi bir request içinde birden çok yerden istenirse (bu fazda
     tek call-site var; ileride generateMetadata da eklenirse) TEK
     translation sorgusu paylaşılmasını sağlar — Next.js'in GERÇEK bir
     RSC request render'ı içindeki request-scoped dispatcher'ı sayesinde;
     Vitest/Node ortamında bu memoize ETMEZ (bkz. request-locale.server.ts
     ve bu dosyanın testindeki mock — aynı, kanıtlanmış desen).

   FALLBACK: `getTranslation` zaten TR için sorgu atmıyor (Phase 5).
   Çeviri satırı yoksa/`title` boşsa `resolveTranslatedField` orijinal
   `villa.title`'a düşer — mevcut Türkçe davranışla birebir.
   =============================================================== */

const getVillaTranslationCached = cache(
  (villaId: string, locale: Locale) => getTranslation("villa", villaId, locale)
);

/**
 * Bir villanın, verilen locale için GÖSTERİLECEK title'ını döner.
 *   - `locale` TR'ye çözümleniyorsa → `originalTitle` (sorgu YOK).
 *   - Çeviri satırı yoksa / `title` kolonu boşsa → `originalTitle`.
 *   - DB hatası olursa → `originalTitle` (getTranslation zaten
 *     throw etmez, hatayı null'a indirger — burada da asla exception
 *     fırlatmaz, sayfa render'ını ASLA çökertmez).
 *   - Aksi halde → çevrilmiş title.
 */
export async function getVillaTranslatedTitle(
  villaId: string,
  originalTitle: string,
  locale: Locale
): Promise<string> {
  const translation = await getVillaTranslationCached(villaId, locale);
  return resolveTranslatedField(translation?.title, originalTitle);
}
