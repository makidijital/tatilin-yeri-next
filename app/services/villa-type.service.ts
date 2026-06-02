import { supabase } from "@/lib/supabase";
import { slugifyTr } from "@/lib/slug";

/* ===============================================================
   🛡️ VILLA TYPES — public taxonomy CRUD
   ===============================================================
   Migration 008 sonrası `villa_types.slug` SEO-friendly URL
   üretimi için kullanılır. Burada slug:
     - INSERT'te `name`'den otomatik üretilir (caller override
       edebilir → manuel slug desteklenir).
     - UPDATE'te name değişirse slug yeniden üretilir; caller
       explicit `slug` geçtiyse o öncelikli (admin manual edit).
     - Boş veya çakışan slug'lar admin tarafında düzeltilebilir
       (uniqueness DB tarafında PARTIAL UNIQUE INDEX ile korunur).
   =============================================================== */

// 📦 GET
export async function getVillaTypes() {
  const { data, error } = await supabase
    .from("villa_types")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ getVillaTypes error:", error.message);
    return [];
  }

  return data || [];
}

// ➕ ADD
export async function addVillaType(name: string, slug?: string | null) {
  const finalSlug = (slug && slug.trim()) || slugifyTr(name) || null;
  const { error } = await supabase
    .from("villa_types")
    .insert({ name, slug: finalSlug });

  if (error) {
    console.error("❌ addVillaType error:", error.message);
    return false;
  }

  return true;
}

// ✏️ UPDATE
export async function updateVillaType(
  id: string,
  name: string,
  slug?: string | null
) {
  /* Caller explicit slug verdiyse onu kullan; yoksa name'den
     yeniden üret. Boş üretim olursa null bırak (FE UUID fallback). */
  const finalSlug =
    slug !== undefined && slug !== null
      ? slug.trim() || null
      : slugifyTr(name) || null;

  const { error } = await supabase
    .from("villa_types")
    .update({ name, slug: finalSlug })
    .eq("id", id);

  if (error) {
    console.error("❌ updateVillaType error:", error.message);
    return false;
  }

  return true;
}

/* ===============================================================
   🛡️ COVER IMAGE — villa_types.cover_image (migration 010)
   ===============================================================
   `path` parametresi Supabase Storage bucket-relative path
   (örn. "category-covers/balayi-villalari.webp"). Full public URL
   DEĞİL — bucket/domain değişimine immune. NULL geçilirse cover
   kaldırılır (DB NULL). Caller başarı sonrası revalidateTaxonomy()
   çağırmalı; bu fonksiyon cache invalidation yapmaz (separation
   of concerns: service DB, caller UI/cache).
=============================================================== */
export async function setVillaTypeCover(
  id: string,
  path: string | null
): Promise<boolean> {
  const { error } = await supabase
    .from("villa_types")
    .update({ cover_image: path })
    .eq("id", id);

  if (error) {
    console.error("❌ setVillaTypeCover error:", error.message);
    return false;
  }
  return true;
}

// ❌ DELETE (relation varsa önce temizler)
export async function deleteVillaType(id: string) {
  // 🔥 önce relation sil (çok önemli)
  await supabase
    .from("villa_type_relations")
    .delete()
    .eq("type_id", id);

  const { error } = await supabase
    .from("villa_types")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("❌ deleteVillaType error:", error.message);
    return false;
  }

  return true;
}
