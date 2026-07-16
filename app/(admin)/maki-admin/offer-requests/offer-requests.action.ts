"use server";

import type { OfferRequestRow, OfferRequestStatus } from "@/types/database";
import {
  getOfferRequests as getOfferRequestsService,
  updateOfferRequestStatus as updateOfferRequestStatusService,
  deleteOfferRequest as deleteOfferRequestService,
  type OfferRequestResult,
} from "@/app/services/offer-request.service";

/* ===============================================================
   🛡️ OFFER REQUESTS — SERVER ACTIONS (thin wrapper)
   ===============================================================
   Admin `OfferRequestList` (client) → bu server action'lar →
   `offer-request.service` (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder.
     İmzalar + dönüş tipleri service ile BİREBİR (davranış değişmez);
     amaç yalnız client→server sınırını oluşturup native repo'yu client
     bundle'a sızdırmamak.
   =============================================================== */

export async function getOfferRequestsAction(): Promise<OfferRequestRow[]> {
  return getOfferRequestsService();
}

export async function updateOfferRequestStatusAction(
  id: string,
  status: OfferRequestStatus
): Promise<OfferRequestResult> {
  return updateOfferRequestStatusService(id, status);
}

export async function deleteOfferRequestAction(
  id: string
): Promise<OfferRequestResult> {
  return deleteOfferRequestService(id);
}
