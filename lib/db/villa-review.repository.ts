import { db } from "@/lib/db";

/* ===============================================================
   🛡️ VILLA REVIEWS REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `villa-review.service.ts` içindeki inline `supabase.from("villa_reviews")`
   çağrılarının BİREBİR taşınmış hali. Davranış değişmez:
     - `db` = supabaseDbProvider (anon, RLS aktif) → service'in kullandığı
       `@/lib/supabase` ile aynı PostgrestQueryBuilder.
     - Method'lar ham query sonucunu (`{ data, error }` / maybeSingle)
       döner; mapping / clamp / aggregate / validation SERVICE'te kalır.
     - SELECT projeksiyonları, embedded join string'leri, filter ve
       order clause'ları AYNEN (byte-identical). limit değerleri caller
       (service) constant'larından parametre olarak geçer.
=============================================================== */

export const villaReviewRepository = {
  /** Public villa-detay listesi (6 kolon), featured-first + newest. */
  async findApprovedByVilla(villaId: string, limit: number) {
    return await db
      .from("villa_reviews")
      .select("id, guest_name, rating, comment, created_at, is_featured")
      .eq("villa_id", villaId)
      .eq("is_approved", true)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
  },

  /** Global stats — yalnız rating (tüm approved). */
  async findAllApprovedRatings() {
    return await db
      .from("villa_reviews")
      .select("rating")
      .eq("is_approved", true);
  },

  /** Villa-card batch — villa_id + rating (tüm approved). */
  async findApprovedRatingsAllVillas() {
    return await db
      .from("villa_reviews")
      .select("villa_id, rating")
      .eq("is_approved", true);
  },

  /** Per-villa stats — rating (villa + approved). */
  async findApprovedRatingsByVilla(villaId: string) {
    return await db
      .from("villa_reviews")
      .select("rating")
      .eq("villa_id", villaId)
      .eq("is_approved", true);
  },

  /** Homepage testimonial — embedded join (villa + images + location). */
  async findFeaturedHomepage(limit: number) {
    return await db
      .from("villa_reviews")
      .select(
        `id, guest_name, rating, comment, created_at, is_featured,
       villa:villa_id (
         id, slug, title, is_active, deleted_at,
         location:villa_locations(name),
         villa_images ( image_url, is_cover, sort_order )
       )`
      )
      .eq("is_approved", true)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
  },

  /** Admin moderation listesi — villa adı join, newest-first. */
  async findAllForAdmin() {
    return await db
      .from("villa_reviews")
      .select(
        `id, villa_id, guest_name, rating, comment, is_approved, is_featured,
       approved_at, created_at, villa:villa_id ( title )`
      )
      .order("created_at", { ascending: false });
  },

  /** Featured toggle için mevcut state (maybeSingle). */
  async findFeaturedStateById(id: string) {
    return await db
      .from("villa_reviews")
      .select("id, villa_id, is_featured, is_approved")
      .eq("id", id)
      .maybeSingle();
  },

  async insert(payload: Record<string, unknown>) {
    return await db.from("villa_reviews").insert(payload);
  },

  async updateById(id: string, payload: Record<string, unknown>) {
    return await db.from("villa_reviews").update(payload).eq("id", id);
  },

  /** Aynı villa'daki diğer featured review'ları temizle (defansif). */
  async clearFeaturedByVilla(villaId: string) {
    return await db
      .from("villa_reviews")
      .update({ is_featured: false })
      .eq("villa_id", villaId)
      .eq("is_featured", true);
  },

  async deleteById(id: string) {
    return await db.from("villa_reviews").delete().eq("id", id);
  },
};
