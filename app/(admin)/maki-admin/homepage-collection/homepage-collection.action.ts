"use server";

import {
  listHomepageCollection as listHomepageCollectionService,
  addToHomepageCollection as addToHomepageCollectionService,
  removeFromHomepageCollection as removeFromHomepageCollectionService,
  toggleHomepageCollectionActive as toggleHomepageCollectionActiveService,
  updateHomepageCollectionItem as updateHomepageCollectionItemService,
  reorderHomepageCollection as reorderHomepageCollectionService,
  type HomepageCollectionItem,
} from "@/app/services/homepage-collection.service";

/* ===============================================================
   🛡️ HOMEPAGE COLLECTION — SERVER ACTIONS (thin wrapper)
   ===============================================================
   Admin `homepage-collection/page.tsx` (client) → bu server action'lar →
   `homepage-collection.service` (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmzalar +
     dönüş tipleri service ile BİREBİR (davranış değişmez); amaç yalnız
     client→server sınırını oluşturup native repo'yu client bundle'a
     sızdırmamak.
   =============================================================== */

export async function listHomepageCollectionAction(): Promise<
  HomepageCollectionItem[]
> {
  return listHomepageCollectionService();
}

export async function addToHomepageCollectionAction(
  villaId: string
): Promise<boolean> {
  return addToHomepageCollectionService(villaId);
}

export async function removeFromHomepageCollectionAction(
  id: string
): Promise<boolean> {
  return removeFromHomepageCollectionService(id);
}

export async function toggleHomepageCollectionActiveAction(
  id: string,
  isActive: boolean
): Promise<boolean> {
  return toggleHomepageCollectionActiveService(id, isActive);
}

export async function updateHomepageCollectionItemAction(
  id: string,
  fields: { custom_title?: string | null; custom_cover_image?: string | null }
): Promise<boolean> {
  return updateHomepageCollectionItemService(id, fields);
}

export async function reorderHomepageCollectionAction(
  orderedIds: string[]
): Promise<boolean> {
  return reorderHomepageCollectionService(orderedIds);
}
