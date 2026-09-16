/* ===============================================================
   🛡️ VILLA LAYOUT LABEL HELPER — PHASE 10E
   ===============================================================
   Yatak tipi / banyo tipi ENUM etiketlerinin locale'e göre çözülmesi.

   KAPSAM: yalnız KAPALI KÜME enum etiketleri (BED_TYPES 6 değer,
   BATHROOM_TYPES 3 değer — migration 047). Oda/banyo ADLARI serbest
   metindir, bu helper'ın kapsamı DIŞI — onlar villa bazlı DB çevirisi
   olarak tutulur (bkz. lib/villa-layout-translation.helper.ts).

   MİMARİ KARAR: Batch 4'teki `lib/distance-label.helper.ts` deseninin
   BİREBİR aynısı — mevcut i18n dictionary sistemi (getDictionary)
   reuse edilir, yeni bir çeviri mekanizması İCAT EDİLMEZ.

   ⚠️ `lib/villa-layout.helper.ts` DEĞİŞTİRİLMEDİ: oradaki
   BED_TYPE_LABELS/BATHROOM_TYPE_LABELS TR sabitleri admin formunun
   (AccommodationLayoutStep) kullandığı haliyle AYNEN duruyor; bu dosya
   yalnız TİP'lerini type-only import eder (sıfır runtime etkisi) ve
   locale-aware okuma için AYRI bir yol sunar.

   DB'YE HİÇBİR ERİŞİM YOK. Saf (pure), server ve client'ta çağrılabilir.
   =============================================================== */

import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";
import type { BedType, BathroomType } from "@/lib/villa-layout.helper";

/**
 * Yatak tipi etiketini locale'e göre döner.
 *   getBedTypeLabel("double", "tr") → "Çift Kişilik Yatak"
 *   getBedTypeLabel("double", "en") → "Double Bed"
 *   getBedTypeLabel("double", "de") → "Doppelbett"
 *
 * Savunmacı fallback: dictionary'de (beklenmedik şekilde) yoksa enum
 * anahtarının kendisi döner — asla undefined/boş render edilmez.
 */
export function getBedTypeLabel(type: BedType, locale: Locale): string {
  const dict = getDictionary(locale);
  return dict.bedTypeLabels[type] || type;
}

/**
 * Banyo tipi etiketini locale'e göre döner.
 *   getBathroomTypeLabel("shower_wc", "tr") → "Duş + WC"
 *   getBathroomTypeLabel("shower_wc", "en") → "Shower + WC"
 *   getBathroomTypeLabel("shower_wc", "de") → "Dusche + WC"
 */
export function getBathroomTypeLabel(
  type: BathroomType,
  locale: Locale
): string {
  const dict = getDictionary(locale);
  return dict.bathroomTypeLabels[type] || type;
}
