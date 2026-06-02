import { db } from "@/lib/db";

/* ===============================================================
   🛡️ FAZ 40 — HOMEPAGE COLLECTIONS REPOSITORY
   ===============================================================
   `homepage_collections` tablosu — admin curasyon master.
   Reorder paralel update + add (max-order + 1) pattern'i service
   tarafında; repository sadece raw I/O.

   ⚠️ KESIN KURAL:
     - List embed shape (villa:villa_id (..., villa_images (...)))
       AYNEN; sort_order ASC.
     - Add: maxSortOrder + 1; service decision tarafında.
     - Reorder: paralel update'ler service Promise.all'da; repo
       tekil update sunar.
=============================================================== */

const LIST_SELECT = `
      id, villa_id, sort_order, is_active, custom_title,
      custom_cover_image, created_at,
      villa:villa_id (
        id, slug, title, is_active, deleted_at,
        villa_images ( image_url, is_cover, sort_order )
      )
    `;

export const homepageRepository = {
  /** Admin list — aktif + pasif, sort_order ASC. */
  async findAllForAdmin() {
    return await db
      .from("homepage_collections")
      .select(LIST_SELECT)
      .order("sort_order", { ascending: true });
  },

  /** Add helper'ı için max sort_order. */
  async findMaxSortOrder() {
    return await db
      .from("homepage_collections")
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
    return await db.from("homepage_collections").insert(payload);
  },

  /** Hard delete (satır kaldır). */
  async deleteById(id: string) {
    return await db
      .from("homepage_collections")
      .delete()
      .eq("id", id);
  },

  /** Generic update by id — toggle / custom fields / reorder hepsi
   *  partial payload ile çağırır. */
  async updateById(id: string, payload: Record<string, unknown>) {
    return await db
      .from("homepage_collections")
      .update(payload)
      .eq("id", id);
  },
};
