"use server";

import {
  createVillaReview,
  getVillaReviewsForAdmin,
  approveVillaReview,
  deleteVillaReview,
  toggleFeaturedReview,
} from "@/app/services/villa-review.service";

/* ===============================================================
   🛡️ VILLA REVIEW — SERVER ACTIONS (thin wrapper, Migration VR-B1)
   ===============================================================
   Client boundary temizliği: `villa-review.service` VR-P5A'da native
   `server-only` repo'ya repoint edildi → mixed module oldu; iki client
   component (VillaReviewsSection + ReviewAdminList) service'i runtime
   VALUE import ettiği için `server-only` client bundle'a sızıyordu (build
   fail). Bu "use server" sınırı: client'lar buradan import eder → fonksiyon-
   lar server RPC referansına döner, service + native repo client'a girmez.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder (payment-
     method/western-union/settings.action deseni). İmzalar + dönüş tipleri
     service'ten türetilir (Parameters/ReturnType → cast/any YOK). Business
     logic / repository / native repo / DTO DEĞİŞMEDİ.

   ⚠️ AUTHZ NOTU (kapsam dışı — ayrı sprint): admin fonksiyonları
     (getVillaReviewsForAdmin/approve/delete/toggle) VR-P5A sonrası native
     (RLS-free) repo kullanır; eski client-side authenticated RLS gate'i
     ARTIK YOK. Bu wrapper'lar authz EKLEMEZ (business logic değişmez kuralı)
     → admin mutation action'ları şu an gate'siz. Native RLS-free altında
     `authorizeAdminCaller`/`requireAdmin` benzeri app-layer gate ayrı bir
     sprintte eklenmeli.
   =============================================================== */

export async function createVillaReviewAction(
  ...args: Parameters<typeof createVillaReview>
): ReturnType<typeof createVillaReview> {
  return createVillaReview(...args);
}

export async function getVillaReviewsForAdminAction(
  ...args: Parameters<typeof getVillaReviewsForAdmin>
): ReturnType<typeof getVillaReviewsForAdmin> {
  return getVillaReviewsForAdmin(...args);
}

export async function approveVillaReviewAction(
  ...args: Parameters<typeof approveVillaReview>
): ReturnType<typeof approveVillaReview> {
  return approveVillaReview(...args);
}

export async function deleteVillaReviewAction(
  ...args: Parameters<typeof deleteVillaReview>
): ReturnType<typeof deleteVillaReview> {
  return deleteVillaReview(...args);
}

export async function toggleFeaturedReviewAction(
  ...args: Parameters<typeof toggleFeaturedReview>
): ReturnType<typeof toggleFeaturedReview> {
  return toggleFeaturedReview(...args);
}
