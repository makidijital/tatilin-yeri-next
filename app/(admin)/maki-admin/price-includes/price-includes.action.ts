"use server";

import {
  getPriceIncludeItems as getPriceIncludeItemsService,
  addPriceIncludeItem as addPriceIncludeItemService,
  updatePriceIncludeItem as updatePriceIncludeItemService,
  deletePriceIncludeItem as deletePriceIncludeItemService,
  type PriceIncludeItem,
} from "@/app/services/price-include-item.service";

/* ===============================================================
   🛡️ PRICE INCLUDE ITEMS — SERVER ACTIONS (thin wrapper)
   ===============================================================
   Admin `price-includes/page.tsx` (client) → bu server action'lar →
   `price-include-item.service` (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmzalar +
     dönüş tipleri service ile BİREBİR (davranış değişmez); amaç yalnız
     client→server sınırını oluşturup native repo'yu client bundle'a
     sızdırmamak.
   =============================================================== */

export async function getPriceIncludeItemsAction(): Promise<
  PriceIncludeItem[]
> {
  return getPriceIncludeItemsService();
}

export async function addPriceIncludeItemAction(
  title: string
): Promise<boolean> {
  return addPriceIncludeItemService(title);
}

export async function updatePriceIncludeItemAction(
  id: string,
  title: string
): Promise<boolean> {
  return updatePriceIncludeItemService(id, title);
}

export async function deletePriceIncludeItemAction(
  id: string
): Promise<boolean> {
  return deletePriceIncludeItemService(id);
}
