"use server";

import {
  createSharedVillaList as createSharedVillaListService,
  type CreateSharedVillaListInput,
  type CreateSharedVillaListResult,
} from "@/app/services/shared-villa-list.service";

/* ===============================================================
   🛡️ SHARED VILLA LIST — SERVER ACTION (thin wrapper)
   ===============================================================
   Admin `VillaListesiClient` (client) → bu server action →
   `shared-villa-list.service` (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmza +
     dönüş tipi service ile BİREBİR (davranış değişmez); amaç yalnız
     client→server sınırını oluşturup native repo'yu client bundle'a
     sızdırmamak.
   =============================================================== */

export async function createSharedVillaListAction(
  input: CreateSharedVillaListInput
): Promise<CreateSharedVillaListResult> {
  return createSharedVillaListService(input);
}
