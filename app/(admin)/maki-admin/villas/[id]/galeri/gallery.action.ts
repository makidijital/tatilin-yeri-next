"use server";

import { getVillaImages } from "@/app/services/villa-image/villa-image.read";
import { addVillaImage } from "@/app/services/villa-image/villa-image.mutations";
import {
  deleteVillaImage,
  deleteAllVillaImages,
} from "@/app/services/villa-image/villa-image.delete";
import { villaRepository } from "@/lib/db/villa.repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/* ===============================================================
   🛡️ GALERİ — READ ORCHESTRATION (SERVER ACTION)
   ===============================================================
   Galeri sayfasının (client) OKUMALARINI (villa görselleri + slug)
   artık doğrudan service/repository yerine bu server action üzerinden
   yapar → `villa-image.read` / `villa.repository` (ve `@/lib/db`) bu
   okumalar için client bundle'a girmez.

   ⚠️ ORCHESTRATION-ONLY: yeni sorgu/mantık YOK; mevcut fonksiyonlar
   tek gerçek kaynak. Public RLS okuması → server'da anon ile birebir.
   =============================================================== */
export async function loadGalleryImages(id: string) {
  return getVillaImages(id);
}

export async function loadGallerySlug(id: string): Promise<string | null> {
  const { data } = await villaRepository.findSlugById(id);
  return (data?.slug as string | null) ?? null;
}

/* ---------------- WRITES (session-aware client → RLS admin write) ---------------- */

export async function addGalleryImage(
  villaId: string,
  imageUrl: string
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  return addVillaImage(villaId, imageUrl, supabase);
}

export async function deleteGalleryImage(imageId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  return deleteVillaImage(imageId, supabase);
}

export async function deleteAllGalleryImages(
  villaId: string
): Promise<{ ok: boolean; removed: number; orphans: string[] }> {
  const supabase = await createSupabaseServerClient();
  return deleteAllVillaImages(villaId, supabase);
}
