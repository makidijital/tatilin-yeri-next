/* ===============================================================
   🛡️ ADMIN-WIDE CACHE BYPASS — force-dynamic (server layout)
   ===============================================================
   Bu dosya `(admin)` route group'unun TEPE LAYOUT'udur. Server
   component (`"use client"` yok) olduğu için Next.js Route Segment
   Config seçenekleri export edebilir.

   `export const dynamic = "force-dynamic"` direktifi Next.js
   inheritance kuralı ile `(admin)/**` altındaki TÜM child route
   segment'lere uygulanır:
     - app/(admin)/maki-admin/page.tsx
     - app/(admin)/maki-admin/villas/**
     - app/(admin)/maki-admin/reservations/**
     - app/(admin)/maki-admin/settings/**
     - ... (toplam 47 admin page.tsx)

   Child page'ler `"use client"` olsa bile parent server layout'tan
   inherit ederler (kendi `export const dynamic` yazamasalar bile).
   Mevcut `maki-admin/layout.tsx` `"use client"` durumu BU
   DAVRANIŞI ETKİLEMEZ — bu layout daha üst seviyede, Route Segment
   Config server layout'unda kalır.

   PUBLIC ROUTE GROUP `(public)` ETKİLENMEZ — kendi ISR + revalidate
   tag + unstable_cache stratejisi korunur (sitemap, anasayfa,
   villa detay, kategori/bölge koleksiyonları, vb.).

   Mevcut child segment'lerden bazıları (villa-listesi, villas)
   kendi `export const dynamic = "force-dynamic"` deklarasyonunu
   taşıyor — Route Segment Config inheritance kuralında deeper-wins
   geçerli, aynı değer override edildiği için davranış değişmez.

   AMAÇ: Production'da admin mutation sonrası (villa silme, ekleme,
   güncelleme, settings save vb.) cached HTML servis edilmesinin
   önüne geçmek. Local dev (`next dev`) zaten her request fresh
   render yaptığı için davranış local'de değişmez.
=============================================================== */
export const dynamic = "force-dynamic";

export default function AdminGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
