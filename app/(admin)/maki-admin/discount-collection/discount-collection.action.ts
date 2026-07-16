"use server";

import {
  listDiscountCollection as listDiscountCollectionService,
  addToDiscountCollection as addToDiscountCollectionService,
  removeFromDiscountCollection as removeFromDiscountCollectionService,
  toggleDiscountCollectionActive as toggleDiscountCollectionActiveService,
  updateDiscountCollectionItem as updateDiscountCollectionItemService,
  reorderDiscountCollection as reorderDiscountCollectionService,
  type DiscountCollectionItem,
} from "@/app/services/discount-collection.service";

/* ===============================================================
   🛡️ DISCOUNT COLLECTION — SERVER ACTIONS (thin wrapper)
   ===============================================================
   Admin `discount-collection/page.tsx` (client) → bu server action'lar →
   `discount-collection.service` (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmzalar +
     dönüş tipleri service ile BİREBİR (davranış değişmez); amaç yalnız
     client→server sınırını oluşturup native repo'yu client bundle'a
     sızdırmamak.
   =============================================================== */

export async function listDiscountCollectionAction(): Promise<
  DiscountCollectionItem[]
> {
  return listDiscountCollectionService();
}

export async function addToDiscountCollectionAction(
  villaId: string
): Promise<boolean> {
  return addToDiscountCollectionService(villaId);
}

export async function removeFromDiscountCollectionAction(
  id: string
): Promise<boolean> {
  return removeFromDiscountCollectionService(id);
}

export async function toggleDiscountCollectionActiveAction(
  id: string,
  isActive: boolean
): Promise<boolean> {
  return toggleDiscountCollectionActiveService(id, isActive);
}

export async function updateDiscountCollectionItemAction(
  id: string,
  patch: { custom_title?: string | null; custom_cover_image?: string | null }
): Promise<boolean> {
  return updateDiscountCollectionItemService(id, patch);
}

export async function reorderDiscountCollectionAction(
  orderedIds: string[]
): Promise<boolean> {
  return reorderDiscountCollectionService(orderedIds);
}
