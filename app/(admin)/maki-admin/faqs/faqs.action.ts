"use server";

import {
  getFaqsForAdmin as getFaqsForAdminService,
  replaceFaqs as replaceFaqsService,
  type Faq,
  type FaqInput,
} from "@/app/services/faq.service";

/* ===============================================================
   🛡️ FAQ — SERVER ACTIONS (thin wrapper)
   ===============================================================
   Admin `faqs/page.tsx` (client) → bu server action'lar →
   `faq.service` (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmzalar +
     dönüş tipleri service ile BİREBİR (davranış değişmez); amaç yalnız
     client→server sınırını oluşturup native repo'yu client bundle'a
     sızdırmamak.
   =============================================================== */

export async function getFaqsForAdminAction(): Promise<Faq[]> {
  return getFaqsForAdminService();
}

export async function replaceFaqsAction(
  items: FaqInput[]
): Promise<{ ok: boolean; error?: string }> {
  return replaceFaqsService(items);
}
