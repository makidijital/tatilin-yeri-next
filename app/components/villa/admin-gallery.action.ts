"use server";

import {
  updateImageOrder,
  setCoverImage,
} from "@/app/services/villa-image/villa-image.mutations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
/* 🛡️ IMG-P2B — app-layer admin gate (native RLS-free öncesi write authz).
   Yalnız gate; auth.caller kullanılmaz. Business logic / createSupabaseServerClient
   / service DEĞİŞMEDİ. */
import { authorizeAdminSession } from "@/lib/admin-route-auth";

/* ===============================================================
   🛡️ ADMIN GALLERY — WRITE ORCHESTRATION (SERVER ACTIONS)
   ===============================================================
   AdminGallery (client) sıralama + kapak yazmalarını artık doğrudan
   service yerine bu server action'lar üzerinden yapar → `villa-image.
   mutations` / `@/lib/db` client bundle'a girmez.

   ⚠️ ORCHESTRATION-ONLY: mevcut `updateImageOrder` / `setCoverImage`
   fonksiyonları tek gerçek kaynak; session-aware client geçilir →
   admin write RLS'i BUGÜNKÜ Supabase session ile birebir korunur.
   =============================================================== */

export async function reorderGalleryImages(
  updates: { id: string; sort_order: number }[]
): Promise<void> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return;

  const supabase = await createSupabaseServerClient();
  await updateImageOrder(updates, supabase);
}

export async function setGalleryCover(
  id: string,
  villaId: string
): Promise<void> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return;

  const supabase = await createSupabaseServerClient();
  await setCoverImage(id, villaId, supabase);
}
