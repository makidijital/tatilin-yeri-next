"use server";

import {
  getVillaTypes as getVillaTypesService,
  addVillaType as addVillaTypeService,
  updateVillaType as updateVillaTypeService,
  deleteVillaType as deleteVillaTypeService,
  setVillaTypeCover as setVillaTypeCoverService,
  setVillaTypeHomepage as setVillaTypeHomepageService,
  setVillaTypeSortOrders as setVillaTypeSortOrdersService,
} from "@/app/services/villa-type.service";

/* ===============================================================
   🛡️ VILLA TYPES — SERVER ACTIONS (thin wrapper)
   ===============================================================
   Admin `types/page.tsx` (client) → bu server action'lar →
   `villa-type.service` (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmzalar +
     dönüş tipleri service ile BİREBİR (davranış değişmez); amaç yalnız
     client→server sınırını oluşturup native repo'yu client bundle'a
     sızdırmamak.
   =============================================================== */

export async function getVillaTypesAction() {
  return getVillaTypesService();
}

export async function addVillaTypeAction(
  name: string,
  slug?: string | null
): Promise<boolean> {
  return addVillaTypeService(name, slug);
}

export async function updateVillaTypeAction(
  id: string,
  name: string,
  slug?: string | null
): Promise<boolean> {
  return updateVillaTypeService(id, name, slug);
}

export async function deleteVillaTypeAction(id: string): Promise<boolean> {
  return deleteVillaTypeService(id);
}

export async function setVillaTypeCoverAction(
  id: string,
  path: string | null
): Promise<boolean> {
  return setVillaTypeCoverService(id, path);
}

export async function setVillaTypeHomepageAction(
  id: string,
  show: boolean
): Promise<boolean> {
  return setVillaTypeHomepageService(id, show);
}

export async function setVillaTypeSortOrdersAction(
  updates: Array<{ id: string; sort_order: number }>
): Promise<boolean> {
  return setVillaTypeSortOrdersService(updates);
}
