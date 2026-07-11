"use server";

import { villaRepository } from "@/lib/db/villa.repository";

/* ===============================================================
   🛡️ VILLA SEARCH — SERVER ACTION
   ===============================================================
   VillaSearchBox (client) canlı aramayı artık DOĞRUDAN repository
   yerine bu server action üzerinden yapar. Böylece `villa.repository`
   (ve dolayısıyla `@/lib/db`) client bundle'ına GİRMEZ; sorgu server
   tarafında çalışır.

   ⚠️ DAVRANIŞ AYNEN: `villaRepository.searchByTitle` birebir aynı
   SELECT/filter/ilike/limit'i çalıştırır; dönüş şekli değişmez.
   Public villa okuması olduğu için server tarafında ek yetki
   gerektirmez.
   =============================================================== */
export async function searchVillas(term: string, limit = 5) {
  return villaRepository.searchByTitle(term, limit);
}
