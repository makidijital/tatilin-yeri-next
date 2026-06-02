import { db } from "@/lib/db";

/* ===============================================================
   🛡️ FAZ 40 — FAQ REPOSITORY
   ===============================================================
   `faqs` tablosu — global SSS master. Replace-all pattern (DELETE
   + bulk INSERT) service'te orchestrate edilir; repository sadece
   raw query'leri yapar.

   ⚠️ KESIN KURAL:
     - Public path: is_active=true + sort_order ASC
     - Admin path: is_active filtre YOK + sort_order ASC
     - DELETE all: .not("id","is",null) predicate (= id IS NOT NULL)
     - is_active default true (replaceFaqs payload'da set edilir)
=============================================================== */

export const faqRepository = {
  /** Public — yalnız aktif FAQ'lar. */
  async findActive() {
    return await db
      .from("faqs")
      .select("id, question, answer")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
  },

  /** Admin — tüm FAQ'lar (is_active filtre YOK). */
  async findAllForAdmin() {
    return await db
      .from("faqs")
      .select("id, question, answer")
      .order("sort_order", { ascending: true });
  },

  /** Replace-all pattern step 1 — TÜM rowları DELETE. */
  async deleteAll() {
    return await db.from("faqs").delete().not("id", "is", null);
  },

  /** Replace-all pattern step 2 — bulk INSERT. */
  async insertMany(
    rows: Array<{
      question: string;
      answer: string;
      sort_order: number;
      is_active: boolean;
    }>
  ) {
    return await db.from("faqs").insert(rows);
  },

  /** Single delete — admin tek-satır kullanım için. */
  async deleteById(id: string) {
    return await db.from("faqs").delete().eq("id", id);
  },
};
