import { supabase } from "@/lib/supabase";

/* ================= TYPES ================= */

export type Feature = {
  id: string;
  name: string;
};

/* ================= ADMIN ================= */

// 📦 TÜM FEATURE'LAR
export async function getVillaFeatures(): Promise<Feature[]> {
  const { data, error } = await supabase
    .from("villa_features")
    .select("id, name")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ getVillaFeatures:", error.message);
    return [];
  }

  return data || [];
}

/* ================= FRONT ================= */

// 📦 SADECE O VİLLAYA AİT FEATURE'LAR
export async function getVillaFeaturesByVilla(
  villaId: string
): Promise<Feature[]> {
  const { data, error } = await supabase
    .from("villa_feature_relations")
    .select(`
      villa_features (
        id,
        name
      )
    `)
    .eq("villa_id", villaId);

  if (error) {
    console.error("❌ getVillaFeaturesByVilla:", error.message);
    return [];
  }

  /* 🔥 TYPE SAFE MAP (Faz 9 hardening):
     Supabase embed-select inference'ı `never` üretebildiği için
     local row shape ile narrow ediyoruz. `any` kaldırıldı; runtime
     mantığı birebir aynı. */
  type Row = { villa_features: Feature | null };
  const rows = (data || []) as unknown as Row[];
  const features: Feature[] = rows
    .map((x) => x.villa_features)
    .filter((f): f is Feature => f !== null);

  return features;
}

/* ================= CRUD ================= */

// ➕ ADD
export async function addVillaFeature(name: string): Promise<boolean> {
  const { error } = await supabase
    .from("villa_features")
    .insert({ name });

  if (error) {
    console.error("❌ addVillaFeature:", error.message);
    return false;
  }

  return true;
}

// ✏️ UPDATE
export async function updateVillaFeature(
  id: string,
  name: string
): Promise<boolean> {
  const { error } = await supabase
    .from("villa_features")
    .update({ name })
    .eq("id", id);

  if (error) {
    console.error("❌ updateVillaFeature:", error.message);
    return false;
  }

  return true;
}

// ❌ DELETE (relation temizliği dahil)
export async function deleteVillaFeature(
  id: string
): Promise<boolean> {
  // 🔥 relation temizle
  const { error: relationError } = await supabase
    .from("villa_feature_relations")
    .delete()
    .eq("feature_id", id);

  if (relationError) {
    console.error("❌ relation delete:", relationError.message);
  }

  // 🔥 feature sil
  const { error } = await supabase
    .from("villa_features")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("❌ deleteVillaFeature:", error.message);
    return false;
  }

  return true;
}