import type { SupabaseClient } from "@supabase/supabase-js";

import { villaImageRepository } from "@/lib/db/villa-image.repository";

/* Opsiyonel session-aware client (geriye uyumlu, default anon `db`
   repo içinde). Server action bağlamında admin RLS session'ı taşımak
   için geçilir (PricingCalendarCanvas DI deseniyle aynı). */
type WriteClient = Pick<SupabaseClient, "from">;

/* ===============================================================
   🛡️ VILLA IMAGE — MUTATIONS (add / reorder / cover)
   ===============================================================
   SORUMLULUK: görsel ekleme + sıralama + kapak seçimi (yazma).
   BAĞLAM: admin browser (client). Yazma RLS'i
     `villa_images_admin_write` → `authenticated` + `is_active_admin()`
     gerektirir; bu koşul admin'in cookie-backed session'ıyla YALNIZ
     BROWSER'da sağlanır (server-side anon `db` cookie okumaz →
     auth.uid() NULL → RLS bloklar). Bu yüzden bu fonksiyonlar
     admin galeri client bileşeninden çağrılır; execution modeli
     KORUNUR.
   ⚠️ Storage I/O YOK — bu modül yalnız `villa_images` satırlarına
     dokunur (delete/storage cleanup ayrı `villa-image.delete.ts`).
   ⚠️ DAVRANIŞ DEĞİŞMEDİ — gövdeler eski servisten birebir.
   =============================================================== */

//
// ➕ ADD IMAGE (safe + cover fix)
//
export async function addVillaImage(
  villaId: string,
  imageUrl: string,
  client?: WriteClient
): Promise<boolean> {
  if (!villaId || !imageUrl) return false;

  // 🔥 son sırayı bul (hata vermez)
  const { data: last } = await villaImageRepository.findMaxSortOrder(
    villaId,
    client
  );

  const nextOrder =
    last?.sort_order !== undefined ? last.sort_order + 1 : 0;

  // 🔥 cover var mı kontrol et
  const { data: cover } = await villaImageRepository.findCoverId(
    villaId,
    client
  );

  const { error } = await villaImageRepository.insert(
    {
      villa_id: villaId,
      image_url: imageUrl,
      sort_order: nextOrder,
      is_cover: !cover, // 🔥 cover yoksa ilk görsel cover olur
    },
    client
  );

  if (error) {
    console.error("❌ addVillaImage error:", error.message);
    return false;
  }

  return true;
}

//
// 🔥 UPDATE ORDER
//
export async function updateImageOrder(
  updates: { id: string; sort_order: number }[],
  client?: WriteClient
) {
  try {
    const promises = updates.map((u) =>
      villaImageRepository.updateSortOrderById(u.id, u.sort_order, client)
    );

    await Promise.all(promises);
  } catch (err) {
    console.error("❌ updateImageOrder error:", err);
  }
}

//
// ⭐ SET COVER IMAGE
//
export async function setCoverImage(
  id: string,
  villaId: string,
  client?: WriteClient
) {
  try {
    // hepsini false yap
    await villaImageRepository.clearCoverByVilla(villaId, client);

    // seçileni true yap
    await villaImageRepository.setCoverById(id, client);
  } catch (err) {
    console.error("❌ setCoverImage error:", err);
  }
}
