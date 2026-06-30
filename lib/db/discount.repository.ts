import { db } from "@/lib/db";

/* ===============================================================
   🛡️ DISCOUNT COLLECTIONS REPOSITORY (migration 062)
   ===============================================================
   `discount_collections` tablosu — "İndirimli Koleksiyon" curasyon
   master. homepage.repository.ts'in BİREBİR klonu; tek fark tablo
   adı (`discount_collections`). Raw I/O; karar service tarafında.

   ⚠️ KESIN KURAL (homepage paralel):
     - List embed shape (villa:villa_id (..., villa_images (...)))
       AYNEN; sort_order ASC.
     - Add: maxSortOrder + 1; service decision tarafında.
     - Reorder: paralel update'ler service Promise.all'da.
=============================================================== */

const LIST_SELECT = `
      id, villa_id, sort_order, is_active, custom_title,
      custom_cover_image, created_at,
      villa:villa_id (
        id, slug, title, is_active, deleted_at,
        villa_images ( image_url, is_cover, sort_order )
      )
    `;

export const discountRepository = {
  /** Admin list — aktif + pasif, sort_order ASC. */
  async findAllForAdmin() {
    return await db
      .from("discount_collections")
      .select(LIST_SELECT)
      .order("sort_order", { ascending: true });
  },

  /** PUBLIC CARDS — yalnız aktif (is_active=true); embedded villa +
   *  location + images + prices; sort_order ASC. cache.helpers >
   *  getCachedDiscountCollectionVillas delege. homepage public-cards
   *  metodunun BİREBİR klonu; tek fark tablo (`discount_collections`).
   *  Embedded select string + .eq + order BİREBİR cache.helpers'tan
   *  kopyalandı; mapping caller'da KALIR. */
  async findActivePublicCards() {
    return await db
      .from("discount_collections")
      .select(
        `
        id,
        sort_order,
        is_active,
        custom_title,
        custom_cover_image,
        villa:villa_id (
          id,
          slug,
          title,
          badge,
          bedrooms,
          bathrooms,
          guests,
          is_active,
          deleted_at,
          location:villa_locations(name),
          villa_images (
            image_url,
            is_cover,
            sort_order
          ),
          villa_prices (
            price,
            currency,
            start_date
          )
        )
      `
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
  },

  /** Add helper'ı için max sort_order. */
  async findMaxSortOrder() {
    return await db
      .from("discount_collections")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
  },

  /** INSERT — service nextOrder + villa_id + is_active default true. */
  async insert(payload: {
    villa_id: string;
    sort_order: number;
    is_active: boolean;
  }) {
    return await db.from("discount_collections").insert(payload);
  },

  /** Hard delete (satır kaldır). */
  async deleteById(id: string) {
    return await db
      .from("discount_collections")
      .delete()
      .eq("id", id);
  },

  /** Generic update by id — toggle / custom fields / reorder. */
  async updateById(id: string, payload: Record<string, unknown>) {
    return await db
      .from("discount_collections")
      .update(payload)
      .eq("id", id);
  },
};
