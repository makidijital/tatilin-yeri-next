"use server";

import { menuRepository } from "@/lib/db/menu.repository";
import { villaTypeRepository } from "@/lib/db/villa-type.repository";

/* ===============================================================
   🛡️ HERO FİLTRE YÜKLEME — SERVER ACTION
   ===============================================================
   HeroSearchPanel (client) mount'ta tip (taksonomi) + bölge
   (locations) listelerini artık DOĞRUDAN repository yerine bu server
   action üzerinden yükler. Böylece `menu.repository` /
   `villa-type.repository` (ve `@/lib/db`) client bundle'ına GİRMEZ.

   ⚠️ DAVRANIŞ AYNEN: repo metodları birebir aynı SELECT/order'ı
   çalıştırır; dönen `data` dizileri ham haliyle verilir (bölge
   filtresi/UI mantığı bileşende kalır). Public okuma → ek yetki yok.
   =============================================================== */
export async function loadHeroFilters() {
  const [types, locations] = await Promise.all([
    villaTypeRepository.findAllForPublicTaxonomy(),
    menuRepository.findAllVillaLocations(),
  ]);
  return { types: types.data, locations: locations.data };
}
