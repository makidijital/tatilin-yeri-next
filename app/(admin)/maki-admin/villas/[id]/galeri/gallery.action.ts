"use server";

import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import { getVillaImages } from "@/app/services/villa-image/villa-image.read";
import { addVillaImage } from "@/app/services/villa-image/villa-image.mutations";
import {
  deleteVillaImage,
  deleteAllVillaImages,
} from "@/app/services/villa-image/villa-image.delete";
/* 🛡️ Villa Migration S8D — findSlugById native twin'e (S8C, byte-identical)
   repoint. Bu dosya "use server" → server-only native repo import'u güvenli.
   villaRepository yalnız findSlugById için kullanılıyor; method adı aynı
   (villaAdminRepository → villaRepository alias). */
import { villaAdminRepository as villaRepository } from "@/lib/db/villa.repository.server";
/* 🛡️ IMG-P2B/P3R — app-layer admin gate (native RLS-free write authz).
   Yalnız gate; auth.caller kullanılmaz. Service'ler native (dbAdminNative);
   eski sağlayıcı session client injection IMG-P3R'de kaldırıldı. */
import { authorizeAdminSession } from "@/lib/admin-route-auth";

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
  await requirePermission("villas");
  return getVillaImages(id);
}

export async function loadGallerySlug(id: string): Promise<string | null> {
  await requirePermission("villas");
  const { data } = await villaRepository.findSlugById(id);
  return (data?.slug as string | null) ?? null;
}

/* ---------------- WRITES (session-aware client → RLS admin write) ---------------- */

export async function addGalleryImage(
  villaId: string,
  imageUrl: string
): Promise<boolean> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return false;
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return false;
  }

  return addVillaImage(villaId, imageUrl);
}

export async function deleteGalleryImage(imageId: string): Promise<boolean> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return false;
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return false;
  }

  return deleteVillaImage(imageId);
}

export async function deleteAllGalleryImages(
  villaId: string
): Promise<{ ok: boolean; removed: number; orphans: string[] }> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, removed: 0, orphans: [] };
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return { ok: false, removed: 0, orphans: [] };
  }

  return deleteAllVillaImages(villaId);
}
