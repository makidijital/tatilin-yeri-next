"use server";

import {
  getVillasByIds as getVillasByIdsService,
  getTrashedVillas as getTrashedVillasService,
} from "@/app/services/villa.service";
import { getVillaBadgesByLocale } from "@/lib/i18n/get-villa-badge-translations.server";
import type { Locale } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ VILLA — SERVER ACTIONS (thin wrapper, Villa Migration S1)
   ===============================================================
   Client boundary temizliği: `villa.service` (nötr modül; ileride
   native `server-only` repo'ya geçecek) client bundle'ına SIZMASIN.
   İki client tüketicisi bu action'lara repoint edilir:
     - FavoritesGrid (public /favoriler)      → getVillasByIdsAction
                                              → getVillaBadgesAction
     - villas/trash  (admin trash bin)        → getTrashedVillasAction

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder.
     İmzalar + dönüş tipleri service'ten türetilir (Parameters/
     ReturnType → cast/any YOK, birebir). Provider/repository/eski sağlayıcı
     DEĞİŞMEDİ; yalnız çağrı sınırı server action'a taşındı.
     Dönüş `VillaDTO[]` — plain (string/number/boolean/string[]),
     server action serialization güvenli.
   =============================================================== */

export async function getVillasByIdsAction(
  ...args: Parameters<typeof getVillasByIdsService>
): ReturnType<typeof getVillasByIdsService> {
  return getVillasByIdsService(...args);
}

export async function getTrashedVillasAction(
  ...args: Parameters<typeof getTrashedVillasService>
): ReturnType<typeof getTrashedVillasService> {
  return getTrashedVillasService(...args);
}

/* 🛡️ Kart rozeti (villa_translations.badge) çevirisi — `VillaList` /
   `DiscountCollection` ile AYNI batch kaynağı (`getVillaBadgesByLocale`),
   N+1 YOK. `FavoritesGrid` bir client component olduğu için server-only
   modülü doğrudan import EDEMEZ; bu ince wrapper yalnız sınır geçişi
   sağlar — iş mantığı YOK. TR'de servis zaten boş Map döner (sorgu
   atılmaz) → TR davranışı ve maliyeti BİREBİR eskisi gibi.

   Map serialize edilemediği için düz obje döner (server action
   serialization güvenli); çağıran tarafta `?? canonical` fallback'i
   korunur. */
export async function getVillaBadgesAction(
  villaIds: readonly string[],
  locale: Locale
): Promise<Record<string, string>> {
  const map = await getVillaBadgesByLocale(villaIds, locale);
  return Object.fromEntries(map);
}
