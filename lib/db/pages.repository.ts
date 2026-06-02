import { db } from "@/lib/db";

/* ===============================================================
   🛡️ FAZ 40 — PAGES REPOSITORY
   ===============================================================
   `pages` tablosu — CMS sayfa kayıtları. Service public/admin
   read'leri kapsar; repository sadece DB I/O.

   ⚠️ KESIN KURAL:
     - Public list: is_active=true + created_at DESC.
     - Slug detail: .eq("slug").single() — single resolver (missing
       row → PGRST116 error; service "null" branch'iyle yakalar).
=============================================================== */

export const pagesRepository = {
  /** Public list — aktif pages, created_at DESC. */
  async findActiveList() {
    return await db
      .from("pages")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
  },

  /** Slug detail — .single() resolver. */
  async findBySlug(slug: string) {
    return await db
      .from("pages")
      .select("*")
      .eq("slug", slug)
      .single();
  },

  /** All published pages — slim projection.
     Footer "Kurumsal" kolonunun veri kaynağı. Tek tek farklar:
       • `is_active=true` filtre AYNEN (yayında olmayan asla sızmaz).
       • `show_in_menu` filtresi YOK → header'da gizli sayfalar da
         footer'da görünebilir. Bu kural admin "Menüde Göster"
         toggle'ının yalnız header navigation'ı kontrol etmesini
         sağlar; footer ayrı kanal.
       • Slim SELECT: sections/body/cover_image JSONB+TEXT'leri
         taşımaz → footer SSR payload'ı küçük.
     Sıralama caller tarafında (Footer.tsx): menu_order ASC nulls-
     last, sonra created_at ASC. Repo `.order` zincir bağlamaz çünkü
     SQL "nulls last" semantic'i PostgreSQL'de explicit; client-side
     sort daha taşınabilir. */
  async findActivePages() {
    return await db
      .from("pages")
      .select("id, title, slug, menu_order, created_at")
      .eq("is_active", true);
  },
};
