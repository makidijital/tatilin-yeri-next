"use server";

import type { ContactMessageRow } from "@/types/database";
import {
  listMessages as listMessagesService,
  markAsRead as markAsReadService,
  archiveMessage as archiveMessageService,
} from "@/app/services/contact-message.service";

/* ===============================================================
   🛡️ MESSAGES — SERVER ACTIONS (thin wrapper)
   ===============================================================
   Admin `messages/page.tsx` (client) → bu server action'lar →
   `contact-message.service` (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder.
     İmzalar + dönüş tipleri service ile BİREBİR (davranış değişmez);
     amaç yalnız client→server sınırını oluşturup native repo'yu
     client bundle'a sızdırmamak.
   =============================================================== */

export async function listMessagesAction(opts?: {
  includeArchived?: boolean;
}): Promise<ContactMessageRow[]> {
  return listMessagesService(opts);
}

export async function markAsReadAction(
  id: string,
  isRead: boolean
): Promise<boolean> {
  return markAsReadService(id, isRead);
}

export async function archiveMessageAction(
  id: string,
  archived: boolean
): Promise<boolean> {
  return archiveMessageService(id, archived);
}
