"use server";

import {
  getVillasByIds as getVillasByIdsService,
  getTrashedVillas as getTrashedVillasService,
} from "@/app/services/villa.service";

/* ===============================================================
   🛡️ VILLA — SERVER ACTIONS (thin wrapper, Villa Migration S1)
   ===============================================================
   Client boundary temizliği: `villa.service` (nötr modül; ileride
   native `server-only` repo'ya geçecek) client bundle'ına SIZMASIN.
   İki client tüketicisi bu action'lara repoint edilir:
     - FavoritesGrid (public /favoriler)      → getVillasByIdsAction
     - villas/trash  (admin trash bin)        → getTrashedVillasAction

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder.
     İmzalar + dönüş tipleri service'ten türetilir (Parameters/
     ReturnType → cast/any YOK, birebir). Provider/repository/Supabase
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
