import { discountRepository } from "@/lib/db/discount.repository";

/* ===============================================================
   🛡️ DISCOUNT COLLECTION SERVICE (migration 062)
   ===============================================================
   Admin "İndirimli Koleksiyon" sayfası için CRUD. homepage-collection
   .service.ts'in BİREBİR klonu; tek fark repository (discountRepository)
   ve cache tag ("discount"). Public read yolu
   `lib/cache.helpers > getCachedDiscountCollectionVillas` (tag: "discount").

   Tüm mutation'lar caller tarafında revalidateDiscount() ile
   invalidate edilir (separation of concerns: service DB, caller cache).
   Yeni pricing/availability/reservation semantic'i YOK.
   =============================================================== */

/** 🔗 Section başlık default'u — frontend section hardcoded başlık.
    (Alt başlık kaldırıldı — client copy revizyonu.) */
export const DISCOUNT_COLLECTION_DEFAULTS = {
  title: "İndirimli Kiralık Villalar",
} as const;

export type DiscountCollectionItem = {
  id: string;
  villa_id: string;
  sort_order: number;
  is_active: boolean;
  custom_title: string | null;
  custom_cover_image: string | null;
  created_at: string | null;
  villa?: {
    id: string;
    slug: string | null;
    title: string | null;
    is_active: boolean | null;
    deleted_at: string | null;
    villa_images?: Array<{
      image_url: string | null;
      is_cover: boolean | null;
      sort_order: number | null;
    }> | null;
  } | null;
};

/* ----- LIST (admin) — aktif+pasif tümü, sort_order ASC ----- */
export async function listDiscountCollection(): Promise<
  DiscountCollectionItem[]
> {
  const { data, error } = await discountRepository.findAllForAdmin();
  if (error) {
    console.error("❌ listDiscountCollection error:", error.message);
    return [];
  }
  return (data || []) as unknown as DiscountCollectionItem[];
}

/* ----- ADD villa to collection ----- */
export async function addToDiscountCollection(
  villa_id: string
): Promise<boolean> {
  const { data: maxRow } = await discountRepository.findMaxSortOrder();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { error } = await discountRepository.insert({
    villa_id,
    sort_order: nextOrder,
    is_active: true,
  });
  if (error) {
    console.error("❌ addToDiscountCollection:", error.message);
    return false;
  }
  return true;
}

/* ----- REMOVE (hard delete satır) ----- */
export async function removeFromDiscountCollection(
  id: string
): Promise<boolean> {
  const { error } = await discountRepository.deleteById(id);
  if (error) {
    console.error("❌ removeFromDiscountCollection:", error.message);
    return false;
  }
  return true;
}

/* ----- TOGGLE is_active ----- */
export async function toggleDiscountCollectionActive(
  id: string,
  is_active: boolean
): Promise<boolean> {
  const { error } = await discountRepository.updateById(id, { is_active });
  if (error) {
    console.error("❌ toggleDiscountCollectionActive:", error.message);
    return false;
  }
  return true;
}

/* ----- UPDATE custom fields ----- */
export async function updateDiscountCollectionItem(
  id: string,
  fields: {
    custom_title?: string | null;
    custom_cover_image?: string | null;
  }
): Promise<boolean> {
  const payload: Record<string, unknown> = {};
  if ("custom_title" in fields) {
    payload.custom_title =
      (fields.custom_title ?? null) === null
        ? null
        : (fields.custom_title as string).trim() || null;
  }
  if ("custom_cover_image" in fields) {
    payload.custom_cover_image = fields.custom_cover_image ?? null;
  }
  if (Object.keys(payload).length === 0) return true;
  const { error } = await discountRepository.updateById(id, payload);
  if (error) {
    console.error("❌ updateDiscountCollectionItem:", error.message);
    return false;
  }
  return true;
}

/* ----- REORDER — yeni sıraya göre sort_order set et. ----- */
export async function reorderDiscountCollection(
  orderedIds: string[]
): Promise<boolean> {
  const ops = orderedIds.map((id, idx) =>
    discountRepository.updateById(id, { sort_order: idx })
  );
  const results = await Promise.all(ops);
  const firstErr = results.find((r) => r.error);
  if (firstErr?.error) {
    console.error("❌ reorderDiscountCollection:", firstErr.error.message);
    return false;
  }
  return true;
}
