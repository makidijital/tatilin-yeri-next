import { supabase } from "@/lib/supabase";

/* ===============================================================
   🔥 RULE ITEMS — MASTER CRUD
   ===============================================================
   Tablo: rule_items (id, title, created_at)
   Relation: villa_rule_relations (villa_id, rule_id)

   ⚠️ DB kolonu "title" — "name" DEĞİL.
   =============================================================== */

export type RuleItem = {
  id: string;
  title: string;
};

/* ================= ADMIN ================= */

// 📦 TÜM KURALLAR
export async function getRuleItems(): Promise<RuleItem[]> {
  const { data, error } = await supabase
    .from("rule_items")
    .select("id, title")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ getRuleItems:", error.message);
    return [];
  }

  return (data || []) as RuleItem[];
}

/* ================= FRONT ================= */

// 📦 SADECE O VILLAYA AİT KURALLAR
export async function getRuleItemsByVilla(
  villaId: string
): Promise<RuleItem[]> {
  if (!villaId) return [];

  const { data, error } = await supabase
    .from("villa_rule_relations")
    .select(`
      rule_items (
        id,
        title
      )
    `)
    .eq("villa_id", villaId);

  if (error) {
    console.error("❌ getRuleItemsByVilla:", error.message);
    return [];
  }

  /* Faz 9 hardening: embed-select inference fallback. */
  type Row = { rule_items: RuleItem | null };
  const rows = (data || []) as unknown as Row[];
  const rules: RuleItem[] = rows
    .map((x) => x.rule_items)
    .filter((r): r is RuleItem => r !== null);

  return rules;
}

/* ================= CRUD ================= */

// ➕ ADD
export async function addRuleItem(title: string): Promise<boolean> {
  const trimmed = (title || "").trim();
  if (!trimmed) return false;

  const { error } = await supabase
    .from("rule_items")
    .insert({ title: trimmed });

  if (error) {
    console.error("❌ addRuleItem:", error.message);
    return false;
  }

  return true;
}

// ✏️ UPDATE
export async function updateRuleItem(
  id: string,
  title: string
): Promise<boolean> {
  const trimmed = (title || "").trim();
  if (!id || !trimmed) return false;

  const { error } = await supabase
    .from("rule_items")
    .update({ title: trimmed })
    .eq("id", id);

  if (error) {
    console.error("❌ updateRuleItem:", error.message);
    return false;
  }

  return true;
}

// ❌ DELETE (relation temizliği dahil)
export async function deleteRuleItem(
  id: string
): Promise<boolean> {
  if (!id) return false;

  // 🔥 önce relation'ları temizle
  const { error: relErr } = await supabase
    .from("villa_rule_relations")
    .delete()
    .eq("rule_id", id);

  if (relErr) {
    console.error("❌ rule relation delete:", relErr.message);
  }

  // 🔥 master'ı sil
  const { error } = await supabase
    .from("rule_items")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("❌ deleteRuleItem:", error.message);
    return false;
  }

  return true;
}
