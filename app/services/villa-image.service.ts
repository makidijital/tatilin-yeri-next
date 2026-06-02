import { supabase } from "@/lib/supabase";
import {
  removeVillaImageByUrl,
} from "@/lib/villa-image.helpers";

export type VillaImage = {
  id: string;
  villa_id: string;
  image_url: string;
  sort_order?: number;
  is_cover?: boolean;
  created_at?: string;
};

//
// 📦 GET IMAGES
//
export async function getVillaImages(
  villaId: string
): Promise<VillaImage[]> {
  if (!villaId) return [];

  const { data, error } = await supabase
    .from("villa_images")
    .select("*")
    .eq("villa_id", villaId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("❌ getVillaImages error:", error.message);
    return [];
  }

  return data || [];
}

//
// ➕ ADD IMAGE (safe + cover fix)
//
export async function addVillaImage(
  villaId: string,
  imageUrl: string
): Promise<boolean> {
  if (!villaId || !imageUrl) return false;

  // 🔥 son sırayı bul (hata vermez)
  const { data: last } = await supabase
    .from("villa_images")
    .select("sort_order")
    .eq("villa_id", villaId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder =
    last?.sort_order !== undefined ? last.sort_order + 1 : 0;

  // 🔥 cover var mı kontrol et
  const { data: cover } = await supabase
    .from("villa_images")
    .select("id")
    .eq("villa_id", villaId)
    .eq("is_cover", true)
    .maybeSingle();

  const { error } = await supabase.from("villa_images").insert({
    villa_id: villaId,
    image_url: imageUrl,
    sort_order: nextOrder,
    is_cover: !cover, // 🔥 cover yoksa ilk görsel cover olur
  });

  if (error) {
    console.error("❌ addVillaImage error:", error.message);
    return false;
  }

  return true;
}

//
// 🔥 UPDATE ORDER
//
export async function updateImageOrder(
  updates: { id: string; sort_order: number }[]
) {
  try {
    const promises = updates.map((u) =>
      supabase
        .from("villa_images")
        .update({ sort_order: u.sort_order })
        .eq("id", u.id)
    );

    await Promise.all(promises);
  } catch (err) {
    console.error("❌ updateImageOrder error:", err);
  }
}

//
// ⭐ SET COVER IMAGE
//
export async function setCoverImage(
  id: string,
  villaId: string
) {
  try {
    // hepsini false yap
    await supabase
      .from("villa_images")
      .update({ is_cover: false })
      .eq("villa_id", villaId);

    // seçileni true yap
    await supabase
      .from("villa_images")
      .update({ is_cover: true })
      .eq("id", id);
  } catch (err) {
    console.error("❌ setCoverImage error:", err);
  }
}

/* ===============================================================
   🛡️ DELETE IMAGE — production-hardened lifecycle
   ===============================================================
   GARANTİLER (Faz 8 hardening):

   1) IDEMPOTENT
      - id'ye karşılık DB row YOKSA: zaten silinmiş → true döner.
        İki admin aynı anda silmeye basarsa ikisi de success görür.

   2) DB-FIRST ORDER (defansif)
      - Önce DB delete, sonra storage delete.
      - Eski sıralama: storage → DB. DB fail olursa kırık `<img>` UI'da
        kalıyordu. Yeni sıralama: DB delete OK → UI'dan kayıt anında
        düşer; storage cleanup arka planda retry'li çalışır. Storage
        kalsa bile UX bozulmaz (yalnız orphan dosya).
      - Cache invalidation caller'ın sorumluluğu (eski davranış aynı).

   3) STORAGE RETRY
      - 3 deneme, exponential backoff (200ms, 400ms).
      - "not found" → idempotent başarı kabul edilir.
      - Tüm denemeler başarısız → orphan log yazılır, UX bozulmaz.

   4) PATH PARSING
      - `parseVillaStorageUrl` (lib/villa-image.helpers) merkezi.
      - Eski `.split("/object/public/")[1]` ile byte-identical sonuç;
        ayrıca bucket-relative path'leri de tanır.

   RETURN SEMANTIC:
     true  → DB row removed (UX intact). Storage cleanup ya başarılı
             ya da orphan; her iki durumda UX değişmez.
     false → DB delete başarısız. Kullanıcıya hata gösterilmeli.

   BACKWARD COMPATIBILITY:
     - Eski caller'lar boolean kontrol ediyor: korunur.
     - Eski URL formatları (UUID/UUID.webp) aynen parse edilir.
     - Race koşullarında (zaten silinmiş) eski false → yeni true.
       Bu davranış strict improvement: success/failure ayrımı netleşir.
   =============================================================== */
export async function deleteVillaImage(id: string): Promise<boolean> {
  if (!id) return false;

  /* 1) Fetch — image_url storage cleanup için lazım. */
  const { data: image, error: fetchError } = await supabase
    .from("villa_images")
    .select("image_url")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    console.error("[villa-image.delete] FETCH_FAILED", {
      id,
      error: fetchError.message,
    });
    return false;
  }

  /* IDEMPOTENT: row yoksa zaten silinmiş → success. */
  if (!image) {
    console.info("[villa-image.delete] ALREADY_GONE", { id });
    return true;
  }

  /* 2) DB DELETE — defansif önce. */
  const { error: dbError } = await supabase
    .from("villa_images")
    .delete()
    .eq("id", id);

  if (dbError) {
    console.error("[villa-image.delete] DB_FAILED", {
      id,
      error: dbError.message,
    });
    return false;
  }

  /* 3) STORAGE CLEANUP — best-effort, retry'lı. URL parse veya
        storage remove fail olsa bile DB row gitti → UX intact.
        Orphan dosya log'lanır; arka plan cleanup job'una bırakılır. */
  if (image.image_url) {
    const result = await removeVillaImageByUrl(image.image_url);
    if (!result.ok) {
      console.warn("[villa-image.delete] STORAGE_ORPHAN", {
        id,
        image_url: image.image_url,
        failed: result.failed,
        attempts: result.attempts,
        message:
          "DB row removed; storage file deletion failed after retries. " +
          "Orphan storage file remains — UX not affected.",
      });
      /* DB row gittiği için caller'a success döneriz. */
    }
  }

  return true;
}