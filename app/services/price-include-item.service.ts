import { supabase } from "@/lib/supabase";

/* ===============================================================
   🔥 PRICE INCLUDE ITEMS — MASTER CRUD
   ===============================================================
   MASTER:
   price_include_items
   - id
   - title
   - created_at

   RELATION:
   villa_price_include_relations
   - villa_id
   - include_id

   ⚠️ DB kolonu "title"
   ⚠️ Relation kolonu "include_id"
   =============================================================== */

export type PriceIncludeItem = {
  id: string;
  title: string;
};

/* ================= ADMIN ================= */

// 📦 TÜM PRICE INCLUDE'LAR
export async function getPriceIncludeItems(): Promise<
  PriceIncludeItem[]
> {
  const { data, error } = await supabase
    .from("price_include_items")
    .select("id, title")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(
      "❌ getPriceIncludeItems:",
      error.message
    );

    return [];
  }

  return (data || []) as PriceIncludeItem[];
}

/* ================= FRONT ================= */

// 📦 SADECE O VILLAYA AİT PRICE INCLUDES
export async function getPriceIncludeItemsByVilla(
  villaId: string
): Promise<PriceIncludeItem[]> {
  if (!villaId) return [];

  const { data, error } = await supabase
    .from("villa_price_include_relations")
    .select(`
      price_include_items (
        id,
        title
      )
    `)
    .eq("villa_id", villaId);

  if (error) {
    console.error(
      "❌ getPriceIncludeItemsByVilla:",
      error.message
    );

    return [];
  }

  /* Faz 9 hardening: embed-select inference fallback. */
  type Row = { price_include_items: PriceIncludeItem | null };
  const rows = (data || []) as unknown as Row[];
  const items: PriceIncludeItem[] = rows
    .map((x) => x.price_include_items)
    .filter((p): p is PriceIncludeItem => p !== null);

  return items;
}

/* ================= CRUD ================= */

// ➕ ADD
export async function addPriceIncludeItem(
  title: string
): Promise<boolean> {
  const trimmed = (title || "").trim();

  if (!trimmed) return false;

  const { error } = await supabase
    .from("price_include_items")
    .insert({
      title: trimmed,
    });

  if (error) {
    console.error(
      "❌ addPriceIncludeItem:",
      error.message
    );

    return false;
  }

  return true;
}

// ✏️ UPDATE
export async function updatePriceIncludeItem(
  id: string,
  title: string
): Promise<boolean> {
  const trimmed = (title || "").trim();

  if (!id || !trimmed) return false;

  const { error } = await supabase
    .from("price_include_items")
    .update({
      title: trimmed,
    })
    .eq("id", id);

  if (error) {
    console.error(
      "❌ updatePriceIncludeItem:",
      error.message
    );

    return false;
  }

  return true;
}

// ❌ DELETE
export async function deletePriceIncludeItem(
  id: string
): Promise<boolean> {
  if (!id) return false;

  // 🔥 önce relation temizle
  const { error: relErr } = await supabase
    .from("villa_price_include_relations")
    .delete()
    .eq("include_id", id);

  if (relErr) {
    console.error(
      "❌ price-include relation delete:",
      relErr.message
    );

    return false;
  }

  // 🔥 sonra master kaydı sil
  const { error } = await supabase
    .from("price_include_items")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(
      "❌ deletePriceIncludeItem:",
      error.message
    );

    return false;
  }

  return true;
}